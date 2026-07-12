'use strict';

const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { TelegramService } = require('../services/telegram');

const router = express.Router();
router.use(requireAuth);

const telegram = new TelegramService();

/** GET /api/messages/campaigns — list past bulk-messaging campaigns. */
router.get('/campaigns', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({ campaigns: rows });
});

/**
 * POST /api/messages/send — send a message from selected accounts to a list of
 * recipients (by username/id). Records a campaign row with success/error counts.
 * Body: { accountIds[], recipients[], message, name? }
 */
router.post('/send', async (req, res) => {
  const { accountIds, recipients, message, name } = req.body || {};
  if (!Array.isArray(accountIds) || !accountIds.length) {
    return res.status(400).json({ error: 'accountIds[] is required' });
  }
  if (!Array.isArray(recipients) || !recipients.length) {
    return res.status(400).json({ error: 'recipients[] is required' });
  }
  if (!message) return res.status(400).json({ error: 'message is required' });

  const accounts = db
    .prepare(
      `SELECT * FROM accounts WHERE user_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`
    )
    .all(req.user.id, ...accountIds);
  if (!accounts.length) return res.status(404).json({ error: 'no matching accounts' });

  let success = 0;
  let error = 0;
  // Round-robin recipients across the selected accounts.
  const jobs = recipients.map((recipient, i) => ({
    account: accounts[i % accounts.length],
    recipient,
  }));

  await Promise.all(
    jobs.map(async ({ account, recipient }) => {
      try {
        await telegram.sendPrivateMessage(account.session_string, recipient, message, account.id);
        success += 1;
      } catch (_) {
        error += 1;
      }
    })
  );

  const info = db
    .prepare(
      `INSERT INTO campaigns (user_id, name, message, total, success_count, error_count, status)
       VALUES (?, ?, ?, ?, ?, ?, 'completed')`
    )
    .run(req.user.id, name || 'Campaign', message, recipients.length, success, error);

  res.json({ campaignId: info.lastInsertRowid, total: recipients.length, success, error });
});

module.exports = router;
