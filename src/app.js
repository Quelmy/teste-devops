'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());

// Restrict CORS origins per environment
const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    methods: ['GET'],
    optionsSuccessStatus: 200,
  })
);

// ─── Logging ─────────────────────────────────────────────────────────────────
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat));

// ─── Body parser ─────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

/** Root – project info */
app.get('/', (_req, res) => {
  res.json({
    project: 'Lacrei Saúde – API de Exemplo',
    description: 'Aplicação fictícia para o desafio DevOps',
    endpoints: ['/status', '/health'],
  });
});

/** /status – rota principal exigida pelo desafio */
app.get('/status', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/** /health – health-check do ALB/ECS */
app.get('/health', (_req, res) => {
  res.json({ healthy: true });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.message);
  if (err.message.startsWith('CORS policy')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
