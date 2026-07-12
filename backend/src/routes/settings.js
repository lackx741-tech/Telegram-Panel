'use strict';

/**
 * /api/settings/* — key/value settings (rate limits, delays, concurrency) plus
 * a read-only view of the API credential pool status.
 */

const express = require('express');
const { db, DEFAULT_SETTINGS } = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { apiPool } = require('../services/apiPool');

const router = express.Router();
router.use(requireAuth);

/** Numeric-typed setting keys, coerced on read/write. */
const NUMERIC_KEYS = new Set([
  'rate_limit_per_minute',
  'min_delay_seconds',
  'max_delay_seconds',
  'max_concurrency',
]);

function readSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const { key, value } of rows) {
    if (NUMERIC_KEYS.has(key)) out[key] = Number(value);
    else if (value === 'true' || value === 'false') out[key] = value === 'true';
    else out[key] = value;
  }
  return out;
}

/** GET /api/settings */
router.get('/', (_req, res) => {
  res.json({ settings: readSettings(), apiPool: apiPool.status() });
});

/** PUT /api/settings — merge provided keys. Only known keys are accepted. */
router.put('/', (req, res) => {
  const body = req.body || {};
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (!allowed.has(key)) continue;
      upsert.run(key, String(value));
    }
  });
  tx(Object.entries(body));

  res.json({ settings: readSettings(), apiPool: apiPool.status() });
});

module.exports = router;
