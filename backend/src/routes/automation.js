'use strict';

/**
 * /api/automation/* — the 7 MODULE579 automation operations.
 *
 * Every endpoint accepts either a single `accountId` or an `accountIds[]` array
 * for bulk. Single requests run the operation directly; bulk requests go
 * through TelegramService.executeBulkOperation (bounded concurrency, per-account
 * error isolation, FloodWait / revoked-session handling). Every attempt is
 * written to the automation_logs table.
 */

const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const {
  TelegramService,
  SessionRevokedError,
  isSessionRevokedError,
  SUPPORTED_REACTIONS,
} = require('../services/telegram');

const router = express.Router();
router.use(requireAuth);

const telegram = new TelegramService();

/** Load current concurrency/delay settings from the settings table. */
function loadBulkOptions() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    concurrency: Number(map.max_concurrency) || 5,
    delayRange: [
      Number(map.min_delay_seconds) || 1,
      Number(map.max_delay_seconds) || 3,
    ],
  };
}

const logStmt = db.prepare(
  `INSERT INTO automation_logs (account_id, operation, target, status, error)
   VALUES (?, ?, ?, ?, ?)`
);

function logAttempt(accountId, operation, target, status, error) {
  try {
    logStmt.run(accountId ?? null, operation, target ?? null, status, error ?? null);
  } catch (_) {
    /* logging must never break the request */
  }
}

/** Fetch the caller's accounts by id list, keyed by id. */
function getAccounts(userId, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM accounts WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...ids);
}

/**
 * Normalise the account-selection part of a request body into an id array.
 * Accepts { accountId } or { accountIds: [...] }.
 */
function resolveAccountIds(body) {
  if (Array.isArray(body.accountIds) && body.accountIds.length) {
    return { ids: body.accountIds.map(Number), bulk: true };
  }
  if (body.accountId != null) {
    return { ids: [Number(body.accountId)], bulk: false };
  }
  return { ids: [], bulk: false };
}

/**
 * Shared handler: validate accounts, dispatch single or bulk, log, respond.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} cfg
 * @param {string} cfg.operation log/operation name
 * @param {string} cfg.target human-readable target for logging (link/user)
 * @param {(account) => Promise<any>} cfg.run per-account operation
 */
async function dispatch(req, res, cfg) {
  const { ids, bulk } = resolveAccountIds(req.body || {});
  if (!ids.length) {
    return res.status(400).json({ error: 'accountId or accountIds[] is required' });
  }

  const accounts = getAccounts(req.user.id, ids);
  if (!accounts.length) {
    return res.status(404).json({ error: 'no matching accounts' });
  }

  // ---- Single-account path -------------------------------------------------
  if (!bulk) {
    const account = accounts[0];
    try {
      const result = await cfg.run(account);
      logAttempt(account.id, cfg.operation, cfg.target, 'success', null);
      return res.json({ success: true, results: [{ accountId: account.id, status: 'success', result }], errors: [] });
    } catch (err) {
      const revoked = err instanceof SessionRevokedError || isSessionRevokedError(err);
      const status = revoked ? 'revoked' : 'error';
      logAttempt(account.id, cfg.operation, cfg.target, status, err.message);
      if (revoked) markRevoked(account.id, req.user.id);
      return res
        .status(revoked ? 409 : 502)
        .json({ success: false, results: [], errors: [{ accountId: account.id, status, error: err.message }] });
    }
  }

  // ---- Bulk path -----------------------------------------------------------
  const opts = loadBulkOptions();
  const summary = await telegram.executeBulkOperation(
    accounts.map((a) => ({ id: a.id, sessionString: a.session_string })),
    (acc) => cfg.run(accounts.find((a) => a.id === acc.id)),
    {
      ...opts,
      onResult: (entry) =>
        logAttempt(
          entry.accountId,
          cfg.operation,
          cfg.target,
          entry.status,
          entry.error || null
        ),
    }
  );

  if (summary.revokedSessions.length) {
    for (const accId of summary.revokedSessions) markRevoked(accId, req.user.id);
  }

  return res.json({
    success: summary.errorCount === 0,
    successCount: summary.successCount,
    errorCount: summary.errorCount,
    results: summary.results,
    errors: summary.errors,
    revokedSessions: summary.revokedSessions,
  });
}

/** Mark an account as revoked so the UI can surface it. */
function markRevoked(accountId, userId) {
  try {
    db.prepare('UPDATE accounts SET status = ? WHERE id = ? AND user_id = ?').run(
      'revoked',
      accountId,
      userId
    );
  } catch (_) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

router.post('/reaction', (req, res) => {
  const { link, reaction } = req.body || {};
  if (!link || !reaction) return res.status(400).json({ error: 'link and reaction are required' });
  if (!SUPPORTED_REACTIONS.includes(reaction)) {
    return res.status(400).json({ error: `unsupported reaction; use one of ${SUPPORTED_REACTIONS.join(' ')}` });
  }
  return dispatch(req, res, {
    operation: 'reaction',
    target: link,
    run: (acc) => telegram.applyReaction(acc.session_string, link, reaction, acc.id),
  });
});

router.post('/vote', (req, res) => {
  const { link, option } = req.body || {};
  if (!link || option == null) return res.status(400).json({ error: 'link and option are required' });
  return dispatch(req, res, {
    operation: 'vote',
    target: link,
    run: (acc) => telegram.votePoll(acc.session_string, link, Number(option), acc.id),
  });
});

router.post('/join', (req, res) => {
  const { link } = req.body || {};
  if (!link) return res.status(400).json({ error: 'link is required' });
  return dispatch(req, res, {
    operation: 'join',
    target: link,
    run: (acc) => telegram.joinChat(acc.session_string, link, acc.id),
  });
});

router.post('/leave', (req, res) => {
  const { link } = req.body || {};
  if (!link) return res.status(400).json({ error: 'link is required' });
  return dispatch(req, res, {
    operation: 'leave',
    target: link,
    run: (acc) => telegram.leaveChat(acc.session_string, link, acc.id),
  });
});

router.post('/block', (req, res) => {
  const { user } = req.body || {};
  if (!user) return res.status(400).json({ error: 'user is required' });
  return dispatch(req, res, {
    operation: 'block',
    target: user,
    run: (acc) => telegram.blockUser(acc.session_string, user, acc.id),
  });
});

router.post('/send-pv', (req, res) => {
  const { user, message } = req.body || {};
  if (!user || !message) return res.status(400).json({ error: 'user and message are required' });
  return dispatch(req, res, {
    operation: 'send-pv',
    target: user,
    run: (acc) => telegram.sendPrivateMessage(acc.session_string, user, message, acc.id),
  });
});

router.post('/comment', (req, res) => {
  const { link, comment } = req.body || {};
  if (!link || !comment) return res.status(400).json({ error: 'link and comment are required' });
  return dispatch(req, res, {
    operation: 'comment',
    target: link,
    run: (acc) => telegram.postComment(acc.session_string, link, comment, acc.id),
  });
});

/** GET /api/automation/logs — operation history (for the History sub-tab). */
router.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db
    .prepare(
      `SELECT l.*, a.phone AS account_phone
       FROM automation_logs l
       LEFT JOIN accounts a ON a.id = l.account_id
       WHERE a.user_id = ? OR l.account_id IS NULL
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(req.user.id, limit);
  res.json({ logs: rows });
});

module.exports = router;
