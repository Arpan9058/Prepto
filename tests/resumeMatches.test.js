const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let app, store, gemini, source, body;
const auth = (r, uid = 'alice') => r.set('Authorization', `Bearer ${uid}`);
const post = (data = body, uid) => auth(request(app).post('/api/resume-matches'), uid).send(data);
const result = { score: 60, summary: 'Evidence based estimate', matchedSkills: ['Node.js'], missingSkills: ['SQL'], recommendations: ['Add a SQL project'] };
beforeEach(async () => {
  store = createFirebaseDouble(); gemini = createGeminiDouble();
  app = createApp({ frontend: false, env: { SESSION_SECRET: 'offline-matching-only-session-secret' }, firebase: store.firebase, gemini, logger: pino({ level: 'silent' }) });
  source = (await auth(request(app).post('/api/resumes')).send(require('../fixtures/resume-version.json')).expect(201)).body;
  body = { resumeId: source.resume.id, resumeVersionId: source.version.id, jobTitle: 'Engineer', jobDescription: 'Node.js and SQL required', requestId: 'match-one' };
});
test('matching saves immutable source provenance, exact job text and replay without provider calls', async () => {
  const first = (await post().expect(201)).body.match;
  await auth(request(app).post(`/api/resumes/${source.resume.id}/versions`)).send({ text: 'Different SQL experience', expectedRevision: 1 }).expect(201);
  const saved = (await auth(request(app).get(`/api/resume-matches/${first.id}`)).expect(200)).body;
  expect(saved.versionNumber).toBe(1); expect(saved.jobDescription).toBe(body.jobDescription); expect(saved.modelId).toBe('offline-double');
  await post().expect(200); expect(gemini.generate).toHaveBeenCalledTimes(1);
  await post({ ...body, jobDescription: 'Different role' }).expect(409);
  expect(gemini.generate.mock.calls[0][0]).toContain(require('../fixtures/resume-version.json').text);
});
test('cross-user and admin access never invokes matching provider or exposes records', async () => {
  await post().expect(201);
  for (const uid of ['bob', 'admin']) {
    await post(body, uid).expect(404);
    await auth(request(app).get('/api/resume-matches/match-one'), uid).expect(404);
    await auth(request(app).get(`/api/resume-matches?resumeId=${source.resume.id}`), uid).expect(404);
    await auth(request(app).get('/api/resume-matches?after=match-one'), uid).expect(404);
    await auth(request(app).post('/api/resume-matches/compare'), uid).send({ firstId: 'match-one', secondId: 'other' }).expect(404);
    expect((await auth(request(app).get('/api/resume-matches'), uid)).body.items).toEqual([]);
  }
  await request(app).post('/api/resume-matches').send(body).expect(401);
  expect(gemini.generate).toHaveBeenCalledTimes(1);
});
test.each([{ ...result, score: 101 }, { ...result, score: '80' }, { ...result, missingSkills: [null] }, { ...result, recommendations: Array(11).fill('x') }])('invalid provider output fails safely and permits saved request retry: %j', async invalid => {
  gemini.generate.mockResolvedValueOnce(invalid);
  await post().expect(500);
  const failed = (await auth(request(app).get('/api/resume-matches/match-one'))).body;
  expect(failed.status).toBe('failed'); expect(failed.canRetry).toBe(true); expect(failed.result).toBeNull();
  await post().expect(201); expect(gemini.generate).toHaveBeenCalledTimes(2);
});
test('transactional lease rejects duplicate in-flight work and recovers an expired lease', async () => {
  let release, signal; const entered = new Promise(r => { signal = r; });
  gemini.generate.mockImplementationOnce(() => { signal(); return new Promise(r => { release = r; }); });
  const pending = post().then(r => r); await entered;
  await post().expect(409); expect(gemini.generate).toHaveBeenCalledTimes(1);
  release(result); expect((await pending).status).toBe(201);
  const raw = store.records.get('users/alice/resumeMatches/match-one');
  store.records.set('users/alice/resumeMatches/match-one', { ...raw, status: 'pending', expiresAt: new Date(0), leaseToken: 'abandoned' });
  await post().expect(201); expect(gemini.generate).toHaveBeenCalledTimes(2);
});
test('owner history paginates, filters and compares only completed same-job records', async () => {
  gemini.generate.mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, score: 80, matchedSkills: ['node.js', 'SQL'], missingSkills: [] });
  await post().expect(201); await post({ ...body, requestId: 'match-two' }).expect(201);
  await post({ ...body, requestId: 'match-other', jobDescription: 'Different job' }).expect(201);
  let cursor, ids = [];
  do { const r = (await auth(request(app).get(`/api/resume-matches?pageSize=1${cursor ? '&after=' + cursor : ''}`)).expect(200)).body; ids.push(...r.items.map(m => m.id)); expect(r.items[0].jobDescription).toBeUndefined(); cursor = r.nextCursor; } while (cursor);
  expect(new Set(ids).size).toBe(3);
  const filtered = (await auth(request(app).get(`/api/resume-matches?resumeId=${body.resumeId}&resumeVersionId=${body.resumeVersionId}`))).body;
  expect(filtered.items).toHaveLength(3);
  await auth(request(app).get(`/api/resume-matches?resumeVersionId=${body.resumeVersionId}`)).expect(400);
  const compare = ids => auth(request(app).post('/api/resume-matches/compare')).send({ firstId: ids[0], secondId: ids[1] });
  const changed = (await compare(['match-one', 'match-two']).expect(200)).body;
  expect(changed.scoreChange).toBe(20); expect(changed.newlyMatchedSkills).toEqual(['SQL']);
  await compare(['match-one', 'match-other']).expect(400); await compare(['match-one', 'match-one']).expect(400);
  store.records.get('users/alice/resumeMatches/match-two').status = 'failed';
  await compare(['match-one', 'match-two']).expect(409);
});
