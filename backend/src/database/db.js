'use strict';

/**
 * SQLite database layer (better-sqlite3) with WAL mode.
 *
 * Exposes a single shared connection and runs the schema migration on first
 * import so the rest of the app can `require('./database/db')` and start
 * issuing prepared statements immediately.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'panel.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Full schema. All statements are IF NOT EXISTS so this is safe to run on
 * every boot (idempotent migration).
 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      session_string TEXT NOT NULL,
      first_name TEXT,
      username TEXT,
      telegram_id TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audience (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      source TEXT,
      telegram_id TEXT,
      username TEXT,
      first_name TEXT,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      message TEXT,
      total INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS proxies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol TEXT DEFAULT 'socks5',
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT,
      password TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      operation TEXT NOT NULL,
      target TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_audience_user ON audience(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON automation_logs(created_at);
  `);

  seedDefaultSettings();
}

/**
 * Default settings row values. Stored as key/value strings; numeric values are
 * parsed back by the settings route.
 */
const DEFAULT_SETTINGS = {
  rate_limit_per_minute: '20',
  min_delay_seconds: '1',
  max_delay_seconds: '3',
  max_concurrency: '5',
  flood_wait_retry: 'true',
};

function seedDefaultSettings() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) insert.run(key, value);
  });
  tx(Object.entries(DEFAULT_SETTINGS));
}

migrate();

module.exports = { db, DEFAULT_SETTINGS, DB_PATH };
