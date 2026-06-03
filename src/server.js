'use strict';

const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[${new Date().toISOString()}] Server running on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.log('[SIGTERM] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Shutting down gracefully...');
  server.close(() => {
    console.log('[SIGINT] HTTP server closed.');
    process.exit(0);
  });
});
