'use strict';

/**
 * /api/analytics/* — read-only aggregates over the user's data.
 */

const express = require('express');
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** GET /api/analytics/overview — headline counts + per-operation breakdown. */
router.get('/overview', (req, res) => {
  const userId = req.user.id;

  const accountCount = db
    .prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?')
    .get(userId).n;
  const activeAccountCount = db
    .prepare("SELECT COUNT(*) AS n FROM accounts WHERE user_id = ? AND status = 'active'")
    .get(userId).n;
  const audienceCount = db
    .prepare('SELECT COUNT(*) AS n FROM audience WHERE user_id = ?')
    .get(userId).n;
  const campaignAgg = db
    .prepare(
      `SELECT COUNT(*) AS campaigns,
              COALESCE(SUM(success_count), 0) AS messagesSent
       FROM campaigns WHERE user_id = ?`
    )
    .get(userId);

  const opBreakdown = db
    .prepare(
      `SELECT l.operation,
              SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN l.status != 'success' THEN 1 ELSE 0 END) AS failed
       FROM automation_logs l
       LEFT JOIN accounts a ON a.id = l.account_id
       WHERE a.user_id = ? OR l.account_id IS NULL
       GROUP BY l.operation
       ORDER BY l.operation`
    )
    .all(userId);

  res.json({
    accounts: accountCount,
    activeAccounts: activeAccountCount,
    audience: audienceCount,
    campaigns: campaignAgg.campaigns,
    messagesSent: campaignAgg.messagesSent,
    operations: opBreakdown,
  });
});

/** GET /api/analytics/campaigns/:id/stats — success/failure for one campaign. */
router.get('/campaigns/:id/stats', (req, res) => {
  const row = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'campaign not found' });

  const total = row.total || 0;
  const success = row.success_count || 0;
  const error = row.error_count || 0;
  res.json({
    id: row.id,
    name: row.name,
    total,
    success,
    error,
    successRate: total ? Math.round((success / total) * 100) : 0,
    errorRate: total ? Math.round((error / total) * 100) : 0,
  });
});

/** GET /api/analytics/activity — recent automation activity, newest first. */
router.get('/activity', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db
    .prepare(
      `SELECT l.id, l.operation, l.target, l.status, l.error, l.created_at,
              a.phone AS account_phone
       FROM automation_logs l
       LEFT JOIN accounts a ON a.id = l.account_id
       WHERE a.user_id = ? OR l.account_id IS NULL
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(req.user.id, limit);
  res.json({ activity: rows });
});

module.exports = router;
