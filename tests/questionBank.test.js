const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { seed } = require('../scripts/seed-question-bank');
let app, store;
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
const sample = require('../fixtures/question-bank.json')[0];
beforeEach(async () => {
  store = createFirebaseDouble(); await seed(store.db);
  app = createApp({ frontend: false, env: { SESSION_SECRET: 'offline-question-bank-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) });
});
test('bank search, combined filters and cursor pagination return only public fields', async () => {
  const response = await auth(request(app).get('/api/questions?q=NODE&category=technical&difficulty=easy')).expect(200);
  expect(response.body.items.map(q => q.id).sort()).toEqual(['sample-01', 'sample-10']);
  for (const q of response.body.items) { expect(q.answer).toBeUndefined(); expect(q.explanation).toBeUndefined(); expect(q.searchPrefixes).toBeUndefined(); }
  let after = '', ids = [];
  do {
    const r = await auth(request(app).get(`/api/questions?pageSize=4${after ? '&after=' + after : ''}`)).expect(200);
    ids.push(...r.body.items.map(q => q.id)); after = r.body.nextCursor;
  } while (after);
  expect(ids).toHaveLength(13); expect(new Set(ids).size).toBe(13);
});
test('bookmarks are private, idempotent and paginated', async () => {
  for (const id of ['sample-01', 'sample-02', 'sample-03']) await auth(request(app).put(`/api/questions/${id}/bookmark`)).expect(200);
  await auth(request(app).put('/api/questions/sample-01/bookmark')).expect(200);
  expect([...store.records.keys()].filter(p => p.startsWith('users/alice/bookmarks/'))).toHaveLength(3);
  const own = await auth(request(app).get('/api/bookmarks?pageSize=2')).expect(200);
  expect(own.body.items).toHaveLength(2); expect(own.body.nextCursor).toBeTruthy();
  const next = await auth(request(app).get(`/api/bookmarks?pageSize=2&after=${own.body.nextCursor}`)).expect(200); expect(next.body.items).toHaveLength(1);
  const other = await auth(request(app).get('/api/bookmarks'), 'bob').expect(200); expect(other.body.items).toEqual([]);
  await auth(request(app).delete('/api/questions/sample-01/bookmark'), 'bob').expect(200);
  expect(store.records.has('users/alice/bookmarks/sample-01')).toBe(true);
  await auth(request(app).delete('/api/questions/sample-01/bookmark')).expect(200);
  await auth(request(app).delete('/api/questions/sample-01/bookmark')).expect(200);
});
test('backend denies unauthorized management even with forged role/UID fields', async () => {
  await request(app).get('/api/questions').expect(401);
  await auth(request(app).post('/api/admin/questions')).send({ ...sample, admin: true, uid: 'admin' }).expect(403);
  await auth(request(app).put('/api/admin/questions/sample-01')).send({ ...sample, revision: 1 }).expect(403);
  await auth(request(app).post('/api/admin/questions/sample-01/archive')).send({ revision: 1 }).expect(403);
  await auth(request(app).get('/api/questions?archived=true')).expect(403);
  const page = await auth(request(app).get('/question-bank')).expect(200); expect(page.text).not.toContain('id="new-question"');
});
test('admin create/edit/archive records actor and prevents stale writes', async () => {
  const created = await auth(request(app).post('/api/admin/questions'), 'admin').send({ ...sample, createdBy: 'alice' }).expect(201);
  expect(created.body.createdBy).toBe('admin'); expect(created.body.revision).toBe(1);
  const id = created.body.id;
  const edited = await auth(request(app).put(`/api/admin/questions/${id}`), 'admin').send({ ...sample, title: 'Updated title', revision: 1 }).expect(200);
  expect(edited.body.revision).toBe(2);
  await auth(request(app).put(`/api/admin/questions/${id}`), 'admin').send({ ...sample, revision: 1 }).expect(409);
  await auth(request(app).post(`/api/admin/questions/${id}/archive`), 'admin').send({ revision: 2 }).expect(200);
  await auth(request(app).get(`/api/questions/${id}`)).expect(404);
  await auth(request(app).put(`/api/questions/${id}/bookmark`)).expect(404);
  const archived = await auth(request(app).get('/api/questions?archived=true'), 'admin').expect(200);
  expect(archived.body.items.map(q => q.id)).toEqual([id]);
  expect([...store.records.keys()].filter(p => p.startsWith('questionEvents/'))).toHaveLength(3);
});
test('bookmark views hide archived questions and seed does not overwrite edits', async () => {
  await auth(request(app).put('/api/questions/sample-01/bookmark'));
  await auth(request(app).post('/api/admin/questions/sample-01/archive'), 'admin').send({ revision: 1 }).expect(200);
  expect((await auth(request(app).get('/api/bookmarks'))).body.items).toEqual([]);
  expect(await seed(store.db)).toBe(0); expect(store.records.get('questionBank/sample-01').archived).toBe(true);
});
test.each(['/api/questions?pageSize=999', '/api/questions?pageSize=0', '/api/questions?q=two%20words', '/api/questions?difficulty=extreme', '/api/questions?category=unknown', '/api/questions?after=missing', '/api/questions?archived=invalid'])('invalid query rejected: %s', async url => { await auth(request(app).get(url)).expect(400); });
test('invalid content cannot be published', async () => {
  for (const body of [{ ...sample, title: '' }, { ...sample, type: 'bad' }, { ...sample, skills: [] }, { ...sample, type: 'multipleChoice', options: ['A', 'A'], answer: 'A' }, { ...sample, type: 'multipleChoice', options: ['A', 'B'], answer: 'C' }]) await auth(request(app).post('/api/admin/questions'), 'admin').send(body).expect(400);
});
