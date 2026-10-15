const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let store, app, gemini;
const auth = (r, uid = 'alice') => r.set('Authorization', `Bearer ${uid}`);
const input = { problemId: 'two-sum', language: 'javascript', code: 'function pairSum(v,t) { return null; }', requestId: 'coding-one' };
const submit = (body = input, uid) => auth(request(app).post('/api/coding/submissions'), uid).send(body);
beforeEach(() => { store = createFirebaseDouble(); gemini = createGeminiDouble(); app = createApp({ env: { SESSION_SECRET: 'offline-coding-practice-session-secret' }, firebase: store.firebase, gemini, logger: pino({ level: 'silent' }) }); });
test('library search, filters, cursor validation and reference answer hiding', async () => {
  const first = (await auth(request(app).get('/api/coding/problems?pageSize=1')).expect(200)).body;
  const detail = (await auth(request(app).get('/api/coding/problems/two-sum')).expect(200)).body; expect(detail.starter.python).toContain('def pair_sum'); expect(detail.solution).toBeUndefined();
  await auth(request(app).get('/api/coding/problems/unknown')).expect(404);
  expect(first.items[0].solution).toBeUndefined(); expect(first.nextCursor).toBe('two-sum');
  expect((await auth(request(app).get('/api/coding/problems?pageSize=1&after=two-sum'))).body.items[0].id).toBe('balanced-brackets');
  expect((await auth(request(app).get('/api/coding/problems?q=stack&category=strings&difficulty=medium'))).body.items).toHaveLength(1);
  expect((await auth(request(app).get('/api/coding/problems?q=no-such-problem-zz'))).body.items).toEqual([]);
  await auth(request(app).get('/api/coding/problems?difficulty=impossible')).expect(400);
  await auth(request(app).get('/api/coding/problems?category=strings&after=two-sum')).expect(400);
  await request(app).get('/api/coding/problems').expect(401);
});
test('private exact-text drafts enforce revisions and authenticated owner', async () => {
  const body = { ...input, code: '  indented code\n', revision: 0, ownerUid: 'bob' };
  const a = (await auth(request(app).put('/api/coding/drafts/two-sum')).send(body).expect(200)).body;
  expect(a.code).toBe(body.code); expect(a.revision).toBe(1);
  for (const uid of ['bob', 'admin']) expect((await auth(request(app).get('/api/coding/drafts/two-sum?language=javascript'), uid)).body.code).toBe('');
  await auth(request(app).put('/api/coding/drafts/two-sum')).send(body).expect(409);
  const race = await Promise.all(['a', 'b'].map(code => auth(request(app).put('/api/coding/drafts/two-sum')).send({ ...body, revision: 1, code })));
  expect(race.map(r => r.status).sort()).toEqual([200, 409]);
  await auth(request(app).put('/api/coding/drafts/two-sum')).send({ ...body, language: 'shell' }).expect(400);
});
test('AI review snapshots persist without executing code or claiming test results; progress stays separate', async () => {
  const malicious = 'require("node:fs").writeFileSync("/tmp/NEVER-EXECUTE-PREPTO", "bad"); <img src=x>';
  gemini.generate.mockResolvedValueOnce({ score: 90, summary: '<script>unsafe()</script>', improvements: ['Review empty input'], executed: true, passedTestCases: 100 });
  const saved = (await submit({ ...input, code: malicious }).expect(201)).body.submission;
  expect(saved.execution).toMatchObject({ executed: false, passedTestCases: null, status: 'disabled' }); expect(saved.problem.solution).toContain('map');
  expect(saved.feedback.executed).toBeUndefined(); expect(require('node:fs').existsSync('/tmp/NEVER-EXECUTE-PREPTO')).toBe(false);
  await submit({ ...input, code: malicious }).expect(200); expect(gemini.generate).toHaveBeenCalledTimes(1);
  await submit().expect(409);
  const dashboard = (await auth(request(app).get('/api/progress/overview'))).body;
  expect(dashboard.summary.averageScore).toBeNull(); expect(dashboard.skills).toEqual([]); expect(dashboard.codingPractice.latestAiScore).toBe(90);
  expect(dashboard.codingPractice.skills[0].latest).toBe(90);
  const report = await auth(request(app).get('/reports/view/coding-one?type=CodingPractice')).expect(200);
  expect(report.text).toContain('execution disabled'); expect(report.text).not.toContain('<script>unsafe()');
  await auth(request(app).post('/api/coding/execute')).send({ code: malicious }).expect(501);
});
test('owner-only reviews/history/report/cursors deny cross-user and admin access', async () => {
  await submit().expect(201);
  for (const uid of ['bob', 'admin']) {
    await auth(request(app).get('/api/coding/submissions/coding-one'), uid).expect(404);
    await auth(request(app).get('/api/coding/submissions?after=coding-one'), uid).expect(404);
    expect((await auth(request(app).get('/api/coding/submissions'), uid)).body.items).toEqual([]);
    await auth(request(app).get('/reports/view/coding-one?type=CodingPractice'), uid).expect(404);
  }
  await submit({ ...input, requestId: 'coding-two' }).expect(201);
  const page = (await auth(request(app).get('/api/coding/submissions?pageSize=1&problemId=two-sum'))).body;
  expect(page.nextCursor).toBeTruthy(); expect(page.items[0].code).toBeUndefined(); expect(page.items[0].problem.solution).toBeUndefined();
  const next = (await auth(request(app).get(`/api/coding/submissions?pageSize=1&after=${page.nextCursor}`))).body;
  expect(next.items[0].id).not.toBe(page.items[0].id);
  await auth(request(app).get('/api/coding/submissions?problemId=balanced-brackets&after=coding-one')).expect(400);
});
test('feedback lease rejects parallel requests, records failure and supports retry without duplicate progress', async () => {
  let release, signal; const entered = new Promise(r => { signal = r; });
  gemini.generate.mockImplementationOnce(() => { signal(); return new Promise(r => { release = r; }); });
  const pending = submit().then(r => r); await entered;
  const raw = (await auth(request(app).get('/api/coding/submissions/coding-one'))).body; expect(raw.problem.solution).toBeUndefined();
  await submit().expect(409); release({ score: 999, summary: 'Invalid', improvements: [] }); expect((await pending).status).toBe(500);
  expect((await auth(request(app).get('/api/coding/submissions/coding-one'))).body.canRetry).toBe(true);
  await submit().expect(201); await submit().expect(200);
  expect([...store.records.keys()].filter(k => k.includes('/progress/CodingPractice/attempts/'))).toHaveLength(1);
});
test('expired feedback lease recovers and input bounds reject invalid submissions before the provider', async () => {
  await submit().expect(201);
  const raw = store.records.get('users/alice/codingSubmissions/coding-one');
  store.records.set('users/alice/codingSubmissions/coding-one', { ...raw, status: 'pending', leaseToken: 'abandoned', expiresAt: new Date(0) });
  await submit().expect(201);
  for (const patch of [{ language: 'bash' }, { code: '' }, { code: 'x'.repeat(30001) }, { problemId: 'foreign' }]) await submit({ ...input, ...patch }).expect(patch.problemId ? 404 : 400);
  expect(gemini.generate).toHaveBeenCalledTimes(2);
});

test('failed review retries use the original problem snapshot when library data changes', async () => {
  gemini.generate.mockRejectedValueOnce(new Error('Offline failure')); await submit().expect(500);
  const p = require('../fixtures/coding-problems.json')[0], original = p.prompt;
  try { p.prompt = 'Changed library prompt'; await submit().expect(201); expect(gemini.generate.mock.calls[1][0]).toContain(original); expect(gemini.generate.mock.calls[1][0]).not.toContain(p.prompt); }
  finally { p.prompt = original; }
});

test.each([{ score: 70, summary: null, improvements: [] }, { score: 70, summary: '', improvements: [] }, { score: 70, summary: 'Review', improvements: null }, { score: 70, summary: 'Review', improvements: [42] }])('malformed AI feedback returns a provider failure and leaves a retryable private record: %j', async value => {
  gemini.generate.mockResolvedValueOnce(value); await submit().expect(500);
  expect((await auth(request(app).get('/api/coding/submissions/coding-one'))).body.status).toBe('failed');
  expect((await auth(request(app).get('/api/progress/overview'))).body.codingPractice.attempts).toBe(0);
});
