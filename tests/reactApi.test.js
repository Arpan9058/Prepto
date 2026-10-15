const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let app, store;
beforeEach(() => { store = createFirebaseDouble(); app = createApp({ firebase: store.firebase, gemini: createGeminiDouble(), env: { SESSION_SECRET: 'react-adapter-offline-test-session-secret' }, logger: pino({ level: 'silent' }) }); });
const auth = (r, uid = 'alice') => r.set('Authorization', `Bearer ${uid}`);
test('JSON reports are sanitized and owner scoped, including admin and stale IDs', async () => {
  store.records.set('users/alice/progress/InterviewPractice/attempts/r1', { title: 'Private report', score: 80, submittedAt: new Date(), fullReport: '<h2>Safe</h2><script>unsafe()</script><img src=x onerror=alert(1)>' });
  const list = await auth(request(app).get('/api/reports')).expect(200); expect(list.body.items).toHaveLength(1); expect(list.body.items[0].raw).toBeUndefined();
  const report = await auth(request(app).get('/api/reports/r1?type=InterviewPractice')).expect(200); expect(report.body.fullReport).toBe('<h2>Safe</h2>');
  for (const uid of ['bob', 'admin']) { await auth(request(app).get('/api/reports/r1?type=InterviewPractice'), uid).expect(404); expect((await auth(request(app).get('/api/reports'), uid)).body.items).toEqual([]); }
  await auth(request(app).get('/api/reports/r1?type=Unknown')).expect(400);
});
test('legacy React data negotiation keeps coding auth, server sessions, repeated-answer rejection and JSON redirect semantics', async () => {
  const agent = request.agent(app); const bearer = r => r.set('Authorization', 'Bearer alice').set('Accept', 'application/json');
  await request(app).get('/coding-test').set('Accept', 'application/json').expect(302);
  expect((await bearer(agent.get('/coding-test'))).body.view).toBe('CodingTestFront');
  const started = await bearer(agent.post('/coding-test/start-test')).send({ language: 'Python' }).expect(200); expect(started.body.redirect).toBe('/coding-test/question/1');
  const q = await bearer(agent.get(started.body.redirect)).expect(200); expect(q.body.skeletonCode).toContain('def twoSum');
  await bearer(agent.post('/coding-test/submit-answer/1')).send({ code: 'return []', earlySubmit: 'true' }).expect(200);
  await bearer(agent.post('/coding-test/submit-answer/1')).send({ code: 'different' }).expect(409);
  const result = await bearer(agent.get('/coding-test/results')).expect(200); expect(result.body.view).toBe('results');
  await agent.get('/coding-test/results').set('Authorization', 'Bearer bob').set('Accept', 'application/json').expect(302).expect('Location', '/coding-test');
  await auth(request(app).get('/progress/legacy')).expect(302).expect('Location', '/progress');
});
test('new round adapters remain authenticated, same-origin protected and reset on identity change', async () => {
  const agent = request.agent(app);
  await request(app).post('/api/legacy/rounds/hr/start').expect(401);
  await agent.post('/api/legacy/rounds/hr/start').set('Authorization', 'Bearer alice').send({}).expect(200);
  expect((await agent.get('/api/legacy/rounds/hr').set('Authorization', 'Bearer alice')).body.started).toBe(true);
  expect((await agent.get('/api/legacy/rounds/hr').set('Authorization', 'Bearer bob')).body.started).toBe(false);
  await request(app).post('/api/legacy/rounds/hr/start').set('Cookie', 'session_token=alice').set('Origin', 'https://untrusted.example').send({}).expect(403);
  await auth(request(app).get('/api/legacy/rounds/unknown')).expect(400);
});

test('production bundles contain no server bindings or embedded publishable project configuration', () => {
  const fs = require('node:fs'), path = require('node:path'); const directory = path.join(__dirname, '../frontend/dist/assets');
  const scripts = fs.readdirSync(directory).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(directory, f), 'utf8')).join('');
  for (const binding of ['FIREBASE_SERVICE_ACCOUNT_JSON', 'GEMINI_API_KEY', 'SESSION_SECRET', require('../config/firebase-web.json').apiKey]) expect(scripts).not.toContain(binding);
});
