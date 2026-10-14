const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { seed } = require('../scripts/seed-question-bank');
const { transition } = require('../services/interviews');
let app, store;
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
beforeEach(async () => { store = createFirebaseDouble(); await seed(store.db); app = createApp({ env: { SESSION_SECRET: 'authorization-regression-offline-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) }); });
test.each([undefined, false, 'true', 1, {}, null])('invalid/missing admin claim %p cannot manage content', async claim => {
  store.verifyIdToken.mockResolvedValue({ uid: 'alice', admin: claim });
  const payload = { ...require('../fixtures/question-bank.json')[0], admin: true, ownerUid: 'admin' };
  await auth(request(app).post('/api/admin/questions')).send(payload).expect(403);
  await auth(request(app).put('/api/admin/questions/sample-01')).send({ ...payload, revision: 1 }).expect(403);
  await auth(request(app).post('/api/admin/questions/sample-01/archive')).send({ revision: 1 }).expect(403);
});
test('token verification is reused only inside one request and rerun on the next', async () => {
  await auth(request(app).get('/api/questions')).expect(200); expect(store.verifyIdToken).toHaveBeenCalledTimes(1);
  store.verifyIdToken.mockRejectedValueOnce(new Error('Revoked'));
  await auth(request(app).get('/api/questions')).expect(401); expect(store.verifyIdToken).toHaveBeenCalledTimes(2);
});
test('archived content stays private but authorized historic snapshots remain reproducible', async () => {
  const session = (await auth(request(app).post('/api/interviews')).send({ questionIds: ['sample-13'] }).expect(201)).body;
  await auth(request(app).put('/api/questions/sample-13/bookmark')).expect(200);
  await auth(request(app).post('/api/admin/questions/sample-13/archive'), 'admin').send({ revision: 1 }).expect(200);
  await auth(request(app).get('/api/questions/sample-13')).expect(404);
  await auth(request(app).put('/api/questions/sample-13/bookmark')).expect(404);
  expect((await auth(request(app).get('/api/bookmarks'))).body.items).toEqual([]);
  await auth(request(app).post('/api/interviews')).send({ questionIds: ['sample-13'] }).expect(400);
  await auth(request(app).get(`/api/interviews/${session.id}`), 'bob').expect(404);
  const saved = (await auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: 'sample-13', text: 'GET', requestId: 'historic-answer', version: session.version }).expect(200)).body;
  await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: saved.version }).expect(200);
});
test('invalid state transitions and stale updates cannot change session history', async () => {
  let session = (await auth(request(app).post('/api/interviews')).send({ questionIds: ['sample-13'] }).expect(201)).body;
  await expect(transition(store.db, 'alice', session.id, 'deleted', 1)).rejects.toMatchObject({ status: 400 });
  await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: 1 }).expect(409);
  session = (await auth(request(app).post(`/api/interviews/${session.id}/pause`)).send({ version: 1 }).expect(200)).body;
  await auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: 'sample-13', text: 'GET', requestId: 'paused-answer', version: session.version }).expect(409);
  await auth(request(app).post(`/api/interviews/${session.id}/resume`)).send({ version: 1 }).expect(409);
  session = (await auth(request(app).post(`/api/interviews/${session.id}/resume`)).send({ version: session.version }).expect(200)).body;
  session = (await auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: 'sample-13', text: 'GET', requestId: 'valid-answer', version: session.version }).expect(200)).body;
  session = (await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: session.version }).expect(200)).body;
  for (const action of ['pause', 'resume']) await auth(request(app).post(`/api/interviews/${session.id}/${action}`)).send({ version: session.version }).expect(409);
  await auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: 'sample-13', text: 'POST', requestId: 'overwrite', version: session.version }).expect(409);
  expect(store.records.get(`interviewSessions/${session.id}`).status).toBe('completed');
});
