'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');

const { db } = require('../database/db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

/** POST /api/auth/register — create a user and return a token. */
router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'username already taken' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  const user = { id: info.lastInsertRowid, username };
  const token = signToken(user);
  return res.status(201).json({ token, user });
});

/** POST /api/auth/login — verify credentials and return a token. */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const user = { id: row.id, username: row.username };
  const token = signToken(user);
  return res.json({ token, user });
});

/** GET /api/auth/me — return the current user. */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

module.exports = router;
