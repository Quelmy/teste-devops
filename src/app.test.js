'use strict';

const request = require('supertest');
const app = require('./app');

describe('GET /', () => {
  it('should return project info with 200', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('project');
    expect(res.body).toHaveProperty('endpoints');
  });
});

describe('GET /status', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should include env, version and timestamp fields', async () => {
    const res = await request(app).get('/status');
    expect(res.body).toHaveProperty('env');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should include security headers set by helmet', async () => {
    const res = await request(app).get('/status');
    expect(res.headers).toHaveProperty('x-content-type-options');
    expect(res.headers).toHaveProperty('x-frame-options');
  });

  it('should allow requests with no origin (server-to-server)', async () => {
    // Requests without Origin header (e.g. health-checks, server calls) must be allowed
    const res = await request(app)
      .get('/status')
      .unset('Origin');
    expect(res.statusCode).toBe(200);
  });

  it('should allow requests from a permitted origin', async () => {
    const res = await request(app)
      .get('/status')
      .set('Origin', 'http://localhost:3000');
    expect(res.statusCode).toBe(200);
  });

  it('should block requests from an unpermitted origin (CORS)', async () => {
    // Suppress expected console.error from the error handler
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .get('/status')
      .set('Origin', 'https://evil.example.com');
    consoleSpy.mockRestore();
    // CORS middleware returns 403 for disallowed origins
    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /health', () => {
  it('should return 200 with healthy true', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.healthy).toBe(true);
  });
});

describe('GET /unknown-route', () => {
  it('should return 404', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
