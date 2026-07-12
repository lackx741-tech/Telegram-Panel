'use strict';

const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { TelegramService } = require('../services/telegram');

const router = express.Router();
router.use(requireAuth);

const telegram = new TelegramService();

/** GET /api/audience — list collected audience members. */
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM audience WHERE user_id = ? ORDER BY id DESC LIMIT 1000')
    .all(req.user.id);
  res.json({ audience: rows });
});

/**
 * POST /api/audience/collect — collect participants of a channel/group using
 * one of the user's accounts and store them.
 * Body: { accountId, source } where source is a channel username/link.
 */
router.post('/collect', async (req, res) => {
  const { accountId, source } = req.body || {};
  if (!accountId || !source) {
    return res.status(400).json({ error: 'accountId and source are required' });
  }
  const account = db
    .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(accountId, req.user.id);
  if (!account) return res.status(404).json({ error: 'account not found' });

  try {
    const participants = await telegram.withClient(account.session_string, async (client) => {
      const entity = await client.getEntity(source);
      const users = await client.getParticipants(entity, { limit: 500 });
      return users.map((u) => ({
        telegramId: String(u.id),
        username: u.username || null,
        firstName: u.firstName || null,
      }));
    });

    const insert = db.prepare(
      `INSERT INTO audience (user_id, source, telegram_id, username, first_name)
       VALUES (?, ?, ?, ?, ?)`
    );
    const tx = db.transaction((list) => {
      for (const p of list) insert.run(req.user.id, source, p.telegramId, p.username, p.firstName);
    });
    tx(participants);

    res.json({ collected: participants.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** DELETE /api/audience — clear the user's audience. */
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM audience WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
