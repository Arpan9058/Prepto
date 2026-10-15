const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let app, store, gemini;
beforeEach(() => { store = createFirebaseDouble(); gemini = createGeminiDouble(); app = createApp({ frontend: false, env: { SESSION_SECRET: 'validation-offline-only-session-secret' }, firebase: store.firebase, gemini, logger: pino({ level: 'silent' }) }); });
test.each([
  ['post', '/api/sessions', { category: ['technical'] }],
  ['post', '/api/sessions/submit', { sessionId: '../someone', answers: {} }],
  ['post', '/api/sessions/submit', { sessionId: 'valid', answers: { a: { nested: 'object' } } }],
  ['post', '/coding-test/start-test', { language: {} }],
  ['post', '/coding-test/submit-answer/1', { code: ['unsafe'] }],
  ['put', '/api/progress/goals', { skill: 'SQL', targetScore: '80', weeklySessions: 2 }],
  ['put', '/api/progress/goals', { skill: 'SQL', targetScore: 80, weeklySessions: 15 }],
  ['post', '/api/interviews', { questionIds: [] }],
  ['post', '/api/interviews/s/pause', { version: -1 }],
])('rejects malformed %s %s without invoking AI or persistence', async (method, url, payload) => {
  const before = store.records.size;
  const result = await request(app)[method](url).set('Authorization', 'Bearer alice').send(payload).expect(400);
  expect(result.body.error).toBe('Invalid request fields'); expect(gemini.generate).not.toHaveBeenCalled();
  expect(store.records.size).toBe(before);
});
test('authentication still precedes payload validation', async () => { await request(app).put('/api/progress/goals').send({ skill: [] }).expect(401); });
test('valid goal schema strips privilege/owner injection but preserves server ownership', async () => {
  await request(app).put('/api/progress/goals').set('Authorization', 'Bearer alice').send({ skill: 'SQL', targetScore: 80, weeklySessions: 2, ownerUid: 'bob', admin: true }).expect(200);
  const own = await request(app).get('/api/progress/overview').set('Authorization', 'Bearer alice');
  const other = await request(app).get('/api/progress/overview').set('Authorization', 'Bearer bob');
  expect(own.body.goals).toHaveLength(1); expect(other.body.goals).toHaveLength(0);
});
test('missing and array JSON bodies return 400 instead of crashing route destructuring', async () => {
  await request(app).post('/api/sessions').set('Authorization', 'Bearer alice').expect(400);
  await request(app).put('/api/profile').set('Authorization', 'Bearer alice').send([]).expect(400);
  expect(gemini.generate).not.toHaveBeenCalled();
});
