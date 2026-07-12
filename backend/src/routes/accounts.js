'use strict';

const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/**
 * Public shape of an account row — never leak the raw session string to the UI.
 */
function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    firstName: row.first_name,
    username: row.username,
    telegramId: row.telegram_id,
    status: row.status,
    createdAt: row.created_at,
    hasSession: Boolean(row.session_string),
  };
}

/** GET /api/accounts — list the current user's accounts. */
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json({ accounts: rows.map(publicAccount) });
});

/** POST /api/accounts — register an account with an existing session string. */
router.post('/', (req, res) => {
  const { phone, sessionString, firstName, username, telegramId } = req.body || {};
  if (!phone || !sessionString) {
    return res.status(400).json({ error: 'phone and sessionString are required' });
  }
  const info = db
    .prepare(
      `INSERT INTO accounts (user_id, phone, session_string, first_name, username, telegram_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, phone, sessionString, firstName || null, username || null, telegramId || null);
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ account: publicAccount(row) });
});

/** DELETE /api/accounts/:id */
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'account not found' });
  res.json({ ok: true });
});

module.exports = router;
