const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { seed } = require('../scripts/seed-question-bank');
let app, store, gemini;
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
function makeApp() { return createApp({ frontend: false, env: { SESSION_SECRET: 'offline-persistent-interview-secret' }, firebase: store.firebase, gemini, logger: pino({ level: 'silent' }) }); }
async function start(ids = require('../fixtures/interview-start.json').questionIds) { return (await auth(request(app).post('/api/interviews')).send({ questionIds: ids, ownerUid: 'bob' }).expect(201)).body; }
function answer(session, text = 'GET', requestId = 'answer-request-1') { return auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: session.currentQuestionId, text, requestId, version: session.version }); }
beforeEach(async () => { store = createFirebaseDouble(); await seed(store.db); gemini = createGeminiDouble(); app = makeApp(); });
test('persistent sessions survive app recreation, hide keys and only list owned records', async () => {
  const session = await start();
  expect(store.records.get(`interviewSessions/${session.id}`).ownerUid).toBe('alice');
  expect(session.questions[0].answer).toBeUndefined(); expect(session.questions[0].explanation).toBeUndefined();
  app = makeApp();
  expect((await auth(request(app).get(`/api/interviews/${session.id}`)).expect(200)).body.id).toBe(session.id);
  expect((await auth(request(app).get('/api/interviews'), 'bob').expect(200)).body.items).toEqual([]);
  const own = await auth(request(app).get('/api/interviews')).expect(200);
  expect(own.body.items).toHaveLength(1); expect(own.body.items[0].questions).toBeUndefined();
});
test('every session endpoint enforces ownership, including administrator requests and cursors', async () => {
  const session = await start();
  for (const uid of ['bob', 'admin']) {
    await auth(request(app).get(`/api/interviews/${session.id}`), uid).expect(404);
    await auth(request(app).get(`/api/interviews/${session.id}/review`), uid).expect(404);
    for (const action of ['pause', 'resume', 'complete', 'answers']) await auth(request(app).post(`/api/interviews/${session.id}/${action}`), uid).send({ version: 1, questionId: 'sample-13', text: 'GET', requestId: 'stolen' }).expect(404);
    await auth(request(app).get(`/api/interviews?after=${session.id}`), uid).expect(404);
  }
});
test('pause/resume is versioned, idempotent and protects saved work', async () => {
  const session = await start();
  const paused = (await auth(request(app).post(`/api/interviews/${session.id}/pause`)).send({ version: session.version }).expect(200)).body;
  await answer(paused).expect(409);
  await auth(request(app).post(`/api/interviews/${session.id}/pause`)).send({ version: session.version }).expect(200);
  await auth(request(app).post(`/api/interviews/${session.id}/resume`)).send({ version: 1 }).expect(409);
  const resumed = (await auth(request(app).post(`/api/interviews/${session.id}/resume`)).send({ version: paused.version }).expect(200)).body;
  expect(resumed.status).toBe('active'); await answer(resumed).expect(200);
});
test('multiple-choice grading uses immutable snapshots and exact replay is cached', async () => {
  const session = await start();
  store.records.set('questionBank/sample-13', { ...store.records.get('questionBank/sample-13'), answer: 'POST', archived: true });
  const saved = (await answer(session).expect(200)).body;
  expect(saved.answers[0].score).toBe(100); expect(saved.answers[0].text).toBe('GET');
  await answer(session).expect(200); expect(gemini.generate).not.toHaveBeenCalled();
  await answer(session, 'POST').expect(409);
  await auth(request(app).get(`/api/interviews/${session.id}/review`)).expect(409);
  const completed = (await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: saved.version }).expect(200)).body;
  expect(completed.score).toBe(100);
  await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: saved.version }).expect(200);
  const review = (await auth(request(app).get(`/api/interviews/${session.id}/review`)).expect(200)).body;
  expect(review.questions[0].correctAnswer).toBe('GET'); expect(review.questions[0].explanation).toContain('retrieves');
  expect([...store.records.keys()].filter(p => p.includes('/InterviewPractice/attempts/'))).toHaveLength(1);
  await auth(request(app).get(`/reports/view/${session.id}?type=InterviewPractice`)).expect(200);
});
test('sequential open-ended feedback is saved and completion writes one report atomically', async () => {
  let session = await start(['sample-01', 'sample-02']);
  await auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: session.version }).expect(409);
  await auth(request(app).post(`/api/interviews/${session.id}/answers`)).send({ questionId: 'sample-02', text: 'out of order', requestId: 'wrong-sequence', version: 1 }).expect(409);
  session = (await answer(session, 'An event loop handles async callbacks.').expect(200)).body;
  session = (await answer(session, 'An inner join matches rows.', 'answer-request-2').expect(200)).body;
  expect(session.answers.map(a => a.score)).toEqual([70, 70]);
  expect(gemini.generate.mock.calls[0][0]).toContain('Rubric:');
  const replies = await Promise.all([1, 2].map(() => auth(request(app).post(`/api/interviews/${session.id}/complete`)).send({ version: session.version })));
  expect(replies.map(r => r.status)).toEqual([200, 200]);
  expect(store.records.get(`users/alice/progress/InterviewPractice/attempts/${session.id}`).normalizedScore).toBe(70);
});
test('concurrent evaluation lease prevents duplicate AI calls and pause races', async () => {
  const session = await start(['sample-01']);
  let finish, signal;
  const started = new Promise(resolve => { signal = resolve; });
  gemini.generate.mockImplementationOnce(() => { signal(); return new Promise(resolve => { finish = resolve; }); });
  const first = answer(session, 'My answer').then(r => r);
  await started;
  await answer(session, 'Another answer', 'other-request').expect(409);
  const current = (await auth(request(app).get(`/api/interviews/${session.id}`))).body;
  expect(current.busy).toBe(true);
  await auth(request(app).post(`/api/interviews/${session.id}/pause`)).send({ version: current.version }).expect(409);
  finish({ score: 80, feedback: 'Good', nextStep: 'Practice tradeoffs' });
  expect((await first).status).toBe(200); expect(gemini.generate).toHaveBeenCalledTimes(1);
  expect(store.records.get(`interviewSessions/${session.id}`).answers).toHaveLength(1);
});
test('provider failures and invalid feedback release leases without losing answers', async () => {
  let session = await start(['sample-01']);
  gemini.generate.mockRejectedValueOnce(new Error('private-provider-key'));
  const failure = await answer(session, 'My answer').expect(500); expect(failure.body.error).toBe('Internal server error');
  let raw = store.records.get(`interviewSessions/${session.id}`); expect(raw.pending).toBeNull(); expect(raw.answers).toHaveLength(0);
  session = (await auth(request(app).get(`/api/interviews/${session.id}`))).body;
  gemini.generate.mockResolvedValueOnce({ score: 999, feedback: 'forged', nextStep: 'bad' });
  await answer(session, 'My answer').expect(500);
  raw = store.records.get(`interviewSessions/${session.id}`); expect(raw.pending).toBeNull();
  session = (await auth(request(app).get(`/api/interviews/${session.id}`))).body;
  await answer(session, 'My answer').expect(200);
});
test('expired evaluation leases recover after a crashed worker', async () => {
  const session = await start(['sample-01']);
  const ref = `interviewSessions/${session.id}`;
  store.records.set(ref, { ...store.records.get(ref), pending: { questionId: 'sample-01', requestId: 'abandoned', expiresAt: new Date(0) } });
  await answer(session, 'Recovered answer').expect(200); expect(store.records.get(ref).pending).toBeNull();
});
test('validation rejects empty/duplicate/archived questions, bad options and invalid filters', async () => {
  for (const ids of [[], ['sample-01', 'sample-01'], ['missing']]) await auth(request(app).post('/api/interviews')).send({ questionIds: ids }).expect(400);
  store.records.set('questionBank/sample-01', { ...store.records.get('questionBank/sample-01'), archived: true });
  await auth(request(app).post('/api/interviews')).send({ questionIds: ['sample-01'] }).expect(400);
  const session = await start(); await answer(session, 'forged option').expect(400);
  await auth(request(app).get('/api/interviews?status=unknown')).expect(400);
  await auth(request(app).get('/api/interviews?pageSize=100')).expect(400);
});
