const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const fixtures = require('./documentFixtures');
const sample = require('../fixtures/resume-version.json');
let app, store, pdf;
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
function makeApp() { return createApp({ env: { SESSION_SECRET: 'resume-versions-offline-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), pdf, logger: pino({ level: 'silent' }) }); }
async function create(overrides = {}) { return (await auth(request(app).post('/api/resumes')).send({ ...sample, requestId: 'resume-create-request', ...overrides }).expect(201)).body; }
beforeEach(() => { store = createFirebaseDouble(); pdf = jest.fn(async () => Buffer.from('%PDF-test-export')); app = makeApp(); });
test('versions are immutable, survive app recreation and use optimistic concurrency', async () => {
  const initial = await create();
  const added = (await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send({ text: 'Improved Node.js and SQL experience', label: 'Backend role', expectedRevision: 1, requestId: 'version-two' }).expect(201)).body;
  expect(added.version.number).toBe(2); expect(added.resume.versionCount).toBe(2);
  app = makeApp();
  const original = (await auth(request(app).get(`/api/resumes/${initial.resume.id}/versions/${initial.version.id}`)).expect(200)).body;
  expect(original.text).toBe(sample.text);
  await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send({ text: 'Stale edit', expectedRevision: 1 }).expect(409);
  await auth(request(app).put(`/api/resumes/${initial.resume.id}/versions/${initial.version.id}`)).send({ text: 'Overwrite' }).expect(404);
  const list = (await auth(request(app).get(`/api/resumes/${initial.resume.id}/versions`))).body;
  expect(list.items.map(v => v.number)).toEqual([2, 1]); expect(list.items[0].text).toBeUndefined();
});
test('cross-user/admin access is denied for metadata, versions, writes, selection and PDF', async () => {
  const initial = await create(), root = `/api/resumes/${initial.resume.id}`;
  for (const uid of ['bob', 'admin']) {
    for (const url of [root, `${root}/versions`, `${root}/versions/${initial.version.id}`, `${root}/versions/${initial.version.id}/pdf`]) await auth(request(app).get(url), uid).expect(404);
    await auth(request(app).post(`${root}/versions`), uid).send({ text: 'Stolen', expectedRevision: 1, ownerUid: 'alice' }).expect(404);
    await auth(request(app).put(`${root}/current`), uid).send({ versionId: initial.version.id, expectedRevision: 1 }).expect(404);
    expect((await auth(request(app).get('/api/resumes'), uid)).body.items).toEqual([]);
  }
  expect(pdf).not.toHaveBeenCalled();
  await request(app).get(root).expect(401);
});
test('replaying create/version requests does not duplicate or roll back history', async () => {
  const initial = await create();
  await auth(request(app).post('/api/resumes')).send({ ...sample, requestId: 'resume-create-request' }).expect(200);
  await auth(request(app).post('/api/resumes')).send({ ...sample, text: 'Different', requestId: 'resume-create-request' }).expect(409);
  const body = { text: 'New content', expectedRevision: 1, requestId: 'version-two' };
  await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send(body).expect(201);
  await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send(body).expect(200);
  await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send({ ...body, text: 'Changed' }).expect(409);
  const retry = (await auth(request(app).post('/api/resumes')).send({ ...sample, requestId: 'resume-create-request' }).expect(200)).body;
  expect(retry.resume.versionCount).toBe(2); expect(retry.version.number).toBe(1);
});
test('parallel version saves create one winner and never lose a previous version', async () => {
  const initial = await create();
  const replies = await Promise.all(['a', 'b'].map(requestId => auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send({ text: requestId, expectedRevision: 1, requestId })));
  expect(replies.map(r => r.status).sort()).toEqual([201, 409]);
  expect((await auth(request(app).get(`/api/resumes/${initial.resume.id}`))).body.versionCount).toBe(2);
});
test('selecting an older current version preserves all content and rejects foreign/stale pointers', async () => {
  const initial = await create(), another = await create({ requestId: 'another-resume' });
  await auth(request(app).post(`/api/resumes/${initial.resume.id}/versions`)).send({ text: 'Version two', expectedRevision: 1 }).expect(201);
  await auth(request(app).put(`/api/resumes/${initial.resume.id}/current`)).send({ versionId: another.version.id, expectedRevision: 2 }).expect(404);
  await auth(request(app).put(`/api/resumes/${initial.resume.id}/current`)).send({ versionId: initial.version.id, expectedRevision: 1 }).expect(409);
  const current = (await auth(request(app).put(`/api/resumes/${initial.resume.id}/current`)).send({ versionId: initial.version.id, expectedRevision: 2 }).expect(200)).body;
  expect(current.currentVersionId).toBe(initial.version.id); expect(current.versionCount).toBe(2);
});
test.each(['pdf', 'docx'])('uploaded %s is actually extracted into a private version', async extension => {
  const data = await fixtures[extension]('Sample Candidate Node.js PostgreSQL');
  const result = (await auth(request(app).post('/api/resumes')).field('title', 'Imported resume').attach('resume', data, `resume.${extension}`).expect(201)).body;
  expect(result.version.text).toContain('Sample Candidate Node.js PostgreSQL'); expect(result.version.source.kind).toBe(extension);
  expect(result.version.source.fileName).toBe(`resume.${extension}`);
});
test('pagination returns all owned libraries/versions without exposing text in lists', async () => {
  const a = await create(), b = await create({ requestId: 'second-resume' });
  const first = (await auth(request(app).get('/api/resumes?pageSize=1'))).body;
  const second = (await auth(request(app).get(`/api/resumes?pageSize=1&after=${first.nextCursor}`))).body;
  expect(new Set([...first.items, ...second.items].map(r => r.id))).toEqual(new Set([a.resume.id, b.resume.id]));
  await auth(request(app).get(`/api/resumes?after=${a.resume.id}`), 'bob').expect(404);
  await auth(request(app).get(`/api/resumes/${a.resume.id}/versions?after=missing`)).expect(400);
});
test('PDF export escapes private text and input validation rejects malformed/oversized files', async () => {
  const a = await create({ text: '<script>attack()</script>\nSample Candidate' });
  await auth(request(app).get(`/api/resumes/${a.resume.id}/versions/${a.version.id}/pdf`)).expect(200).expect('Content-Type', /application\/pdf/);
  expect(pdf.mock.calls[0][0]).toContain('&lt;script&gt;'); expect(pdf.mock.calls[0][0]).not.toContain('<script>');
  await auth(request(app).post('/api/resumes')).send({ title: 'Empty', text: '' }).expect(400);
  await auth(request(app).post('/api/resumes')).send({ title: 'Long', text: 'a'.repeat(50001) }).expect(400);
  await auth(request(app).post('/api/resumes')).field('title', 'Invalid PDF').attach('resume', Buffer.from('not-pdf'), 'resume.pdf').expect(400);
  await auth(request(app).post('/api/resumes')).field('title', 'Invalid type').attach('resume', Buffer.from('data'), 'resume.exe').expect(415);
  await auth(request(app).post('/api/resumes')).field('title', 'Too large').attach('resume', Buffer.alloc(5 * 1024 * 1024 + 1), 'resume.pdf').expect(413);
});
