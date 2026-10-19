const express = require('express');
const request = require('supertest');
const pino = require('pino');
const { errorHandler, httpError } = require('../middleware/errors');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(reporter, status = 500, requestId = 'synthetic-request') {
  const app = express();
  app.locals.reportError = reporter;
  app.use((req, _res, next) => { req.id = requestId; req.log = { error: jest.fn(), warn: jest.fn() }; next(); });
  app.get('/failure', (_req, _res, next) => next(httpError(status, 'PRIVATE_PROVIDER_CREDENTIAL')));
  app.use(errorHandler);
  return app;
}
test('reports a server failure once using only frozen safe metadata', async () => {
  const report = jest.fn();
  await request(fixture(report)).get('/failure?token=PRIVATE_QUERY').set('Authorization', 'Bearer PRIVATE_TOKEN').expect(500, { error: 'Internal server error' });
  await settle();
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith({ kind: 'http.server_error', status: 500, method: 'GET', requestId: 'synthetic-request' });
  expect(Object.isFrozen(report.mock.calls[0][0])).toBe(true);
  expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE');
});
test.each([400, 401, 403, 404, 409, 413, 429])('does not report expected HTTP %i errors', async status => {
  const report = jest.fn();
  await request(fixture(report, status)).get('/failure').expect(status);
  await settle();
  expect(report).not.toHaveBeenCalled();
});
test.each(['throw', 'reject'])('reporter %s cannot break or leak into an HTTP response', async mode => {
  const report = jest.fn(() => { if (mode === 'throw') throw new Error('PRIVATE_REPORTER'); return Promise.reject(new Error('PRIVATE_REPORTER')); });
  await request(fixture(report)).get('/failure').expect(500, { error: 'Internal server error' });
  await settle();
  expect(report).toHaveBeenCalledTimes(1);
});
test('an absent reporter is safe and app factory passes the deployment-owned sink to middleware', async () => {
  await request(fixture(undefined)).get('/failure').expect(500);
  const store = createFirebaseDouble();
  store.verifyIdToken.mockRejectedValueOnce(new Error('PRIVATE_FIREBASE_FAILURE'));
  const report = jest.fn();
  const app = createApp({ frontend: false, env: { NODE_ENV: 'test', SESSION_SECRET: 'synthetic-only-secret-at-least-32-characters' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }), reportError: report });
  expect(app.locals.reportError).toBe(report);
  await request(app).get('/dashboard').set('Authorization', 'Bearer synthetic').expect(401);
  expect(report).not.toHaveBeenCalled();
  store.firebase.firestore = () => { throw new Error('PRIVATE_DATABASE_FAILURE'); };
  await request(app).get('/api/profile').set('Authorization', 'Bearer alice').expect(500, { error: 'Internal server error' });
  await settle();
  expect(report).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(report.mock.calls)).not.toContain('PRIVATE');
});

test('untrusted request IDs are omitted and a pending sink cannot delay the response', async () => {
  const report = jest.fn(() => new Promise(() => {}));
  await request(fixture(report, 503, 'PRIVATE invalid id')).get('/failure').timeout(2000).expect(503, { error: 'Internal server error' });
  await settle();
  expect(report).toHaveBeenCalledWith({ kind: 'http.server_error', status: 503, method: 'GET' });
});
