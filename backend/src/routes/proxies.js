'use strict';

/**
 * /api/proxies/* — CRUD for proxy entries plus a connectivity test.
 */

const net = require('net');
const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function publicProxy(row) {
  if (!row) return null;
  return {
    id: row.id,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    username: row.username,
    hasPassword: Boolean(row.password),
    status: row.status,
    createdAt: row.created_at,
  };
}

/** GET /api/proxies */
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM proxies ORDER BY id DESC').all();
  res.json({ proxies: rows.map(publicProxy) });
});

/** POST /api/proxies */
router.post('/', (req, res) => {
  const { protocol, host, port, username, password } = req.body || {};
  if (!host || !port) return res.status(400).json({ error: 'host and port are required' });
  const info = db
    .prepare(
      `INSERT INTO proxies (protocol, host, port, username, password)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(protocol || 'socks5', host, Number(port), username || null, password || null);
  const row = db.prepare('SELECT * FROM proxies WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ proxy: publicProxy(row) });
});

/** PUT /api/proxies/:id */
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'proxy not found' });

  const { protocol, host, port, username, password, status } = req.body || {};
  db.prepare(
    `UPDATE proxies SET protocol = ?, host = ?, port = ?, username = ?, password = ?, status = ?
     WHERE id = ?`
  ).run(
    protocol ?? existing.protocol,
    host ?? existing.host,
    port != null ? Number(port) : existing.port,
    username ?? existing.username,
    // Only overwrite the password when a new one is supplied.
    password != null && password !== '' ? password : existing.password,
    status ?? existing.status,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
  res.json({ proxy: publicProxy(row) });
});

/** DELETE /api/proxies/:id */
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM proxies WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'proxy not found' });
  res.json({ ok: true });
});

/**
 * POST /api/proxies/:id/test — open a raw TCP connection to host:port and time
 * it. This checks reachability of the proxy endpoint (a full SOCKS handshake is
 * out of scope). Updates the proxy status to active/error accordingly.
 */
router.post('/:id/test', (req, res) => {
  const proxy = db.prepare('SELECT * FROM proxies WHERE id = ?').get(req.params.id);
  if (!proxy) return res.status(404).json({ error: 'proxy not found' });

  const started = Date.now();
  const socket = new net.Socket();
  let settled = false;

  const finish = (ok, error) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    db.prepare('UPDATE proxies SET status = ? WHERE id = ?').run(
      ok ? 'active' : 'error',
      proxy.id
    );
    res.json({ ok, latencyMs: Date.now() - started, error: error || null });
  };

  socket.setTimeout(5000);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false, 'connection timed out'));
  socket.once('error', (err) => finish(false, err.message));
  socket.connect(Number(proxy.port), proxy.host);
});

module.exports = router;
