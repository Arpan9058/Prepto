const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel } = require('firebase/firestore');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../../app');
const { seed } = require('../../scripts/seed-question-bank');
setLogLevel('silent'); // Expected permission denials stay asserted without provider-log noise.
let rules, adminApp, db, app;
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'These checks require the emulator; never fall back to production');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Only loopback emulators are allowed');
  rules = await initializeTestEnvironment({ projectId: 'demo-prepto', firestore: { host, port: Number(port), rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } });
  adminApp = initializeApp({ projectId: 'demo-prepto' }, 'prepto-emulator-tests'); db = getFirestore(adminApp);
  const firebase = { firestore: () => db, auth: () => ({ verifyIdToken: async token => { if (!['alice', 'bob', 'admin'].includes(token)) throw new Error('Invalid offline test token'); return { uid: token, admin: token === 'admin' }; } }) };
  const gemini = { generate: async prompt => prompt.startsWith('Match resume version') ? { score: 80, summary: 'SQL evidence', matchedSkills: ['SQL'], missingSkills: [], recommendations: ['Describe project impact'] } : ({ score: 80, feedback: 'A clear example.', nextStep: 'Explain the tradeoff.' }) };
  app = createApp({ env: { SESSION_SECRET: 'emulator-only-session-secret-32-characters' }, firebase, gemini, logger: pino({ level: 'silent' }) });
});
after(async () => { await rules?.cleanup(); await db?.terminate(); if (adminApp) await deleteApp(adminApp); });
beforeEach(async () => { await rules.clearFirestore(); });
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
const sensitive = ['questionBank/q1', 'questionEvents/e1', 'interviewSessions/s1', 'sessions/s2', 'webSessions/w1', 'users/alice/bookmarks/q1', 'users/alice/studyGoals/g1', 'users/alice/progress/InterviewPractice/attempts/a1', 'users/alice/resumes/r1/versions/v1', 'users/alice/resumeMatches/m1'];
for (const identity of ['anonymous', 'alice', 'bob', 'admin']) test(`client rules deny sensitive reads/writes for ${identity}`, async () => {
  await rules.withSecurityRulesDisabled(async context => { for (const p of sensitive) await setDoc(doc(context.firestore(), p), { ownerUid: 'alice', answer: 'private answer', text: 'private resume' }); });
  const context = identity === 'anonymous' ? rules.unauthenticatedContext() : rules.authenticatedContext(identity, { admin: identity === 'admin' });
  for (const p of sensitive) {
    const ref = doc(context.firestore(), p);
    await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { ownerUid: identity })); await assertFails(updateDoc(ref, { admin: true })); await assertFails(deleteDoc(ref));
  }
  await assertFails(getDocs(collection(context.firestore(), 'questionBank')));
});
test('Admin SDK bypasses rules, while backend admin/owner boundaries remain enforced', async () => {
  await seed(db);
  await auth(request(app).post('/api/admin/questions')).send(require('../../fixtures/question-bank.json')[0]).expect(403);
  await auth(request(app).post('/api/admin/questions'), 'admin').send(require('../../fixtures/question-bank.json')[0]).expect(201);
  const created = (await auth(request(app).post('/api/interviews')).send(require('../../fixtures/interview-start.json')).expect(201)).body;
  await auth(request(app).get(`/api/interviews/${created.id}`), 'bob').expect(404);
  await auth(request(app).get(`/api/interviews/${created.id}`), 'admin').expect(404);
  const raw = await db.collection('interviewSessions').doc(created.id).get(); assert.equal(raw.data().ownerUid, 'alice');
  const answered = (await auth(request(app).post(`/api/interviews/${created.id}/answers`)).send({ questionId: 'sample-13', text: 'GET', requestId: 'emulator-answer', version: created.version }).expect(200)).body;
  await auth(request(app).post(`/api/interviews/${created.id}/complete`)).send({ version: answered.version }).expect(200);
  assert.equal((await db.collection('users').doc('alice').collection('progress').doc('InterviewPractice').collection('attempts').doc(created.id).get()).exists, true);
  await auth(request(app).get(`/api/interviews/${created.id}/review`), 'bob').expect(404);
});
test('real Firestore emulator executes combined bank filters, cursor pagination and archived filtering', async () => {
  await seed(db);
  const filters = ['', '?q=node', '?category=technical', '?difficulty=easy', '?q=node&category=technical', '?q=node&difficulty=easy', '?category=technical&difficulty=easy', '?q=node&category=technical&difficulty=easy'];
  for (const filter of filters) await auth(request(app).get('/api/questions' + filter)).expect(200);
  let cursor, ids = [];
  do { const r = await auth(request(app).get(`/api/questions?pageSize=4${cursor ? '&after=' + cursor : ''}`)).expect(200); ids.push(...r.body.items.map(q => q.id)); cursor = r.body.nextCursor; } while (cursor);
  assert.equal(ids.length, 13); assert.equal(new Set(ids).size, 13);
  await auth(request(app).post('/api/admin/questions/sample-01/archive'), 'admin').send({ revision: 1 }).expect(200);
  await auth(request(app).get('/api/questions/sample-01')).expect(404);
  await auth(request(app).post('/api/interviews')).send({ questionIds: ['sample-01'] }).expect(400);
});
test('index manifest contains every supported indexed search/session query shape', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../firebase.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../' + config.firestore.indexes)));
  assert.equal(config.firestore.rules, 'firestore.rules');
  const shapes = new Set(manifest.indexes.filter(i => i.collectionGroup === 'questionBank').map(i => i.fields.filter(f => !['archived', 'createdAt', 'id'].includes(f.fieldPath)).map(f => f.fieldPath).sort().join(',')));
  assert.equal(shapes.size, 8);
  for (const i of manifest.indexes) { assert.ok(i.fields.length >= 2); assert.ok(i.fields.every(f => f.fieldPath && (!!f.order !== !!f.arrayConfig))); }
  for (const shape of [['ownerUid', 'createdAt', 'id'], ['ownerUid', 'status', 'createdAt', 'id']]) assert.ok(manifest.indexes.some(i => i.collectionGroup === 'interviewSessions' && JSON.stringify(i.fields.map(f => f.fieldPath)) === JSON.stringify(shape)));
  for (const fields of [['createdAt', 'id'], ['resumeId', 'createdAt', 'id'], ['resumeId', 'resumeVersionId', 'createdAt', 'id']]) assert.ok(manifest.indexes.some(i => i.collectionGroup === 'resumeMatches' && JSON.stringify(i.fields.map(f => f.fieldPath)) === JSON.stringify(fields)));
  // The emulator accepts these queries but does NOT enforce production composite indexes.
});

test('real emulator preserves private resume version history and rejects stale/cross-user changes', async () => {
  const original = (await auth(request(app).post('/api/resumes')).send(require('../../fixtures/resume-version.json')).expect(201)).body;
  const saved = (await auth(request(app).post(`/api/resumes/${original.resume.id}/versions`)).send({ text: 'Improved SQL experience', expectedRevision: 1, requestId: 'emulator-version-two' }).expect(201)).body;
  assert.equal(saved.version.number, 2);
  await auth(request(app).post(`/api/resumes/${original.resume.id}/versions`)).send({ text: 'Stale version', expectedRevision: 1 }).expect(409);
  await auth(request(app).get(`/api/resumes/${original.resume.id}/versions/${original.version.id}`), 'bob').expect(404);
  const preserved = (await auth(request(app).get(`/api/resumes/${original.resume.id}/versions/${original.version.id}`)).expect(200)).body;
  assert.equal(preserved.text, require('../../fixtures/resume-version.json').text);
  const versions = (await auth(request(app).get(`/api/resumes/${original.resume.id}/versions?pageSize=1`)).expect(200)).body;
  assert.equal(versions.items[0].number, 2); assert.ok(versions.nextCursor);
});

test('real emulator persists owner-only matching history, indexed filters and comparisons', async () => {
  const source = (await auth(request(app).post('/api/resumes')).send(require('../../fixtures/resume-version.json')).expect(201)).body;
  const body = { resumeId: source.resume.id, resumeVersionId: source.version.id, jobTitle: 'Engineer', jobDescription: 'SQL role', requestId: 'match-a' };
  await auth(request(app).post('/api/resume-matches')).send(body).expect(201);
  await auth(request(app).post('/api/resume-matches')).send({ ...body, requestId: 'match-b' }).expect(201);
  await auth(request(app).post('/api/resume-matches'), 'bob').send(body).expect(404);
  await auth(request(app).get('/api/resume-matches/match-a'), 'admin').expect(404);
  const list = (await auth(request(app).get(`/api/resume-matches?resumeId=${body.resumeId}&resumeVersionId=${body.resumeVersionId}&pageSize=1`)).expect(200)).body;
  assert.ok(list.nextCursor);
  await auth(request(app).get(`/api/resume-matches?resumeId=${body.resumeId}&after=${list.nextCursor}`)).expect(200);
  const comparison = (await auth(request(app).post('/api/resume-matches/compare')).send({ firstId: 'match-a', secondId: 'match-b' }).expect(200)).body;
  assert.equal(comparison.scoreChange, 0);
  assert.equal((await db.doc('users/alice/resumeMatches/match-a').get()).data().status, 'completed');
});
