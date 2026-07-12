'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Importing the db module runs the schema migration on first load.
require('./database/db');

const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const audienceRoutes = require('./routes/audience');
const messagesRoutes = require('./routes/messages');
const automationRoutes = require('./routes/automation');
const proxiesRoutes = require('./routes/proxies');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'telegram-panel-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/audience', audienceRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/proxies', proxiesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// 404 for unknown API routes.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Telegram-Panel backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
