const request = require('supertest');
const pino = require('pino');
const { createDemoApp } = require('../demo/app');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const defaults = require('../firebase');
let demo, first, second, fetchSpy, authSpy, dbSpy;
beforeEach(async () => {
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in offline demo'));
  authSpy = jest.spyOn(defaults, 'auth').mockImplementation(() => { throw new Error('Production auth forbidden'); });
  dbSpy = jest.spyOn(defaults, 'firestore').mockImplementation(() => { throw new Error('Production storage forbidden'); });
  demo = await createDemoApp({ frontend: false, env: { FIREBASE_SERVICE_ACCOUNT_JSON: 'synthetic-unused-binding', GEMINI_API_KEY: 'synthetic-unused-binding' } });
  first = request.agent(demo.app); second = request.agent(demo.app);
});
afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); expect(authSpy).not.toHaveBeenCalled(); expect(dbSpy).not.toHaveBeenCalled(); jest.restoreAllMocks(); });
async function enter(agent) { return agent.post('/demo/start').expect(302).expect('Location', '/dashboard'); }
test('demo requires its own authenticated session and only seeds synthetic owner-scoped records', async () => {
  await first.get('/api/resumes').expect(401); await first.get('/dashboard').expect(302).expect('Location', '/login');
  const start = await enter(first), cookie = start.headers['set-cookie'].find(c => c.startsWith('prepto_demo_token='));
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
  const dashboard = await first.get('/dashboard').expect(200); expect(dashboard.text).toContain('OFFLINE DEMO'); expect(dashboard.text).not.toContain('href="/analyze"');
  const resumes = (await first.get('/api/resumes').expect(200)).body.items; expect(resumes[0].title).toContain('Synthetic');
  const progress = (await first.get('/api/progress/overview')).body; expect(progress.codingPractice.attempts).toBe(1); expect(progress.codingPractice.execution).toBe('disabled');
  const review = (await first.get('/api/coding/submissions/sample-coding-review')).body; expect(review.feedback.summary).toContain('not a real assessment'); expect(review.execution.executed).toBe(false);
  const match = (await first.get('/api/resume-matches/sample-match-0')).body; expect(match.modelId).toBe('synthetic-offline-demo');
  for (const key of demo.store.records.keys()) if (key.startsWith('users/')) expect(key).toMatch(/^users\/demo-/);
  await first.post('/api/admin/questions').send(require('../fixtures/question-bank.json')[0]).expect(403);
});
test('separate demo sessions cannot read each other’s private interviews, versions, drafts, reports or cursors', async () => {
  await enter(first); await enter(second);
  const interview = (await first.get('/api/interviews')).body.items[0];
  await second.get(`/api/interviews/${interview.id}`).expect(404);
  await first.post('/api/resumes').send({ title: 'First learner private', text: 'Fictional private content', requestId: 'only-first' }).expect(201);
  await second.get('/api/resumes/only-first').expect(404); await second.get('/api/resumes?after=only-first').expect(404);
  await first.put('/api/coding/drafts/two-sum').send({ language: 'javascript', code: 'first-only', revision: 1 }).expect(200);
  expect((await second.get('/api/coding/drafts/two-sum?language=javascript')).body.code).not.toBe('first-only');
  await first.post('/api/coding/submissions').send({ problemId: 'two-sum', language: 'javascript', code: 'first-only', requestId: 'first-submission' }).expect(201);
  await second.get('/api/coding/submissions/first-submission').expect(404);
  await second.get('/reports/view/first-submission?type=CodingPractice').expect(404);
});
test('demo tokens do not authenticate production app, and production flags never enable demo routes', async () => {
  const result = await enter(first), tokenCookie = result.headers['set-cookie'].find(c => c.startsWith('prepto_demo_token=')).split(';')[0];
  const store = createFirebaseDouble();
  const app = createApp({ frontend: false, env: { SESSION_SECRET: 'production-shaped-test-session-secret', DEMO_MODE: 'true' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) });
  await request(app).get('/api/resumes').set('Cookie', tokenCookie).expect(401);
  expect(store.verifyIdToken).not.toHaveBeenCalled();
  await request(app).get('/api/resumes').set('Authorization', 'Bearer ' + tokenCookie.split('=')[1]).expect(401);
  expect(store.verifyIdToken).toHaveBeenCalled(); expect(store.records.size).toBe(0);
  await request(app).post('/demo/start').expect(404); await request(app).get('/demo').expect(404);
  await expect(createDemoApp({ frontend: false, env: { NODE_ENV: 'production' } })).rejects.toThrow('cannot run in production');
});
test('demo rejects cross-origin starts/exits and untrusted hosts; live login/token routes remain absent', async () => {
  await first.post('/demo/start').set('Origin', 'https://evil.example').expect(403);
  await first.post('/demo/start').set('Origin', 'not-a-url').expect(403);
  await first.post('/demo/start').set('Sec-Fetch-Site', 'cross-site').expect(403);
  await first.get('/demo').set('Host', 'evil.example').expect(403);
  await first.post('/api/set-token').send({ token: 'real-looking' }).expect(404);
  await first.get('/login').expect(302).expect('Location', '/demo');
  await enter(first); await first.post('/demo/exit').set('Origin', 'https://evil.example').expect(403); await first.get('/api/resumes').expect(200);
  await first.post('/api/coding/execute').send({ code: 'process.exit()' }).expect(501);
  await first.get('/demo').expect('Content-Security-Policy', /connect-src 'self'/).expect('X-Prepto-Mode', 'offline-demo');
});
test('exit and process recreation clear synthetic data and invalidate old sessions', async () => {
  const result = await enter(first), cookie = result.headers['set-cookie'].find(c => c.startsWith('prepto_demo_token=')).split(';')[0];
  const initialKeys = [...demo.store.records.keys()].filter(k => k.startsWith('users/')); expect(initialKeys.length).toBeGreaterThan(0);
  await first.post('/demo/exit').expect(302); await first.get('/api/resumes').expect(401);
  expect([...demo.store.records.keys()].filter(k => k.startsWith('users/'))).toEqual([]);
  const fresh = await createDemoApp({ frontend: false, env: {} }); await request(fresh.app).get('/api/resumes').set('Cookie', cookie).expect(401);
});
test('demo sessions expire and cannot be elevated with a forged bearer identity', async () => {
  const now = Date.now(), start = await enter(first), cookie = start.headers['set-cookie'].find(c => c.startsWith('prepto_demo_token=')).split(';')[0];
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 3601000);
  try { await request(demo.app).get('/api/resumes').set('Cookie', cookie).expect(401); } finally { clock.mockRestore(); }
  await first.get('/api/resumes').set('Authorization', 'Bearer admin').expect(401);
  expect([...demo.store.records.keys()].filter(k => k.startsWith('users/'))).toEqual([]);
});
test('failed seeding rolls back the learner and local-only startup rejects public bind addresses', async () => {
  const submit = jest.spyOn(require('../services/codingPractice'), 'submit').mockRejectedValueOnce(new Error('Synthetic seed failure'));
  try { await first.post('/demo/start').expect(500); expect([...demo.store.records.keys()].filter(k => k.startsWith('users/') || k.startsWith('interviewSessions/'))).toEqual([]); }
  finally { submit.mockRestore(); }
  await expect(require('../scripts/demo-server').start({ HOST: '0.0.0.0' })).rejects.toThrow('HOST must be');
});
test('restarting a browser workspace replaces its data while preserving another learner', async () => {
  await enter(first); await enter(second);
  const old = (await first.get('/api/interviews')).body.items[0].id;
  await enter(first); await first.get(`/api/interviews/${old}`).expect(404);
  expect((await second.get('/api/interviews')).body.items).toHaveLength(1);
  await first.post('/demo/exit').expect(302); await second.get('/api/resumes').expect(200);
});

test('demo start and exit neither overwrite nor accept normal product cookies', async () => {
  const cookies = 'session_token=normal-cookie-sentinel; prepto.sid=normal-session-sentinel';
  await request(demo.app).get('/api/resumes').set('Cookie', cookies).expect(401);
  const start = await request(demo.app).post('/demo/start').set('Cookie', cookies).expect(302);
  expect(start.headers['set-cookie'].every(c => !c.startsWith('session_token=') && !c.startsWith('prepto.sid='))).toBe(true);
  const exit = await request(demo.app).post('/demo/exit').set('Cookie', start.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')).expect(302);
  expect(exit.headers['set-cookie'].every(c => c.startsWith('prepto_demo_token=') || c.startsWith('prepto.demo.sid='))).toBe(true);
});
