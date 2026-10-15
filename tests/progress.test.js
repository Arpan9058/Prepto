const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { normalize, summarize } = require('../services/progress');
const fixtures = require('../fixtures/progress-history.json');
let app, store;
const auth = (req, uid = 'alice') => req.set('Authorization', `Bearer ${uid}`);
function seedHistory(uid = 'alice') {
  for (const sample of fixtures) store.records.set(`users/${uid}/progress/${sample.type}/attempts/${sample.id}`, { ...sample.raw, title: sample.title, submittedAt: new Date(Date.now() - sample.daysAgo * 86400000) });
}
beforeEach(() => { store = createFirebaseDouble(); app = createApp({ frontend: false, env: { SESSION_SECRET: 'offline-progress-tests-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) }); });
test('normalization respects known scales and never invents historical coding denominators', () => {
  const row = (type, raw) => ({ id: 'r1', type, subTest: null, submittedAt: '2026-10-10T12:00:00.000Z', raw });
  expect(normalize(row('MockTest', { score: 3, total: 5 })).score).toBe(60);
  expect(normalize(row('HRInterview', { totalScore: 36, avgScore: 4 })).score).toBe(80);
  expect(normalize(row('TechnicalInterview', { totalScore: 24, avgScore: 8 })).score).toBe(80);
  expect(normalize(row('CodingTest', { score: 80 })).score).toBeNull();
  expect(normalize(row('CodingTest', { score: 160, maxScore: 200 })).score).toBe(80);
  expect(normalize(row('MockTest', { score: 9, total: 5 })).score).toBeNull();
});
test('skill trends use per-attempt averages, correct chronology and same-type comparisons', () => {
  const rows = fixtures.map(sample => normalize({ ...sample, subTest: null, submittedAt: new Date(Date.UTC(2026, 9, 15) - sample.daysAgo * 86400000).toISOString() }));
  const summary = summarize(rows, new Date(Date.UTC(2026, 9, 15)));
  expect(summary.summary).toMatchObject({ attempts: 3, gradedAttempts: 3, averageScore: 61.7, sessionsLast7Days: 3 });
  const node = summary.skills.find(s => s.skill === 'Node.js');
  expect(node).toMatchObject({ latest: 80, previous: 65, delta: 15, sampleCount: 3 });
  expect(node.history.map(h => h.score)).toEqual([40, 65, 80]);
  expect(summary.recommendations[0].skill).toBe('SQL');
  expect(summary.comparisons[0]).toMatchObject({ type: 'InterviewPractice', latest: 80, previous: 65, delta: 15 });
  const combined = normalize({ id: 'r1', type: 'InterviewPractice', subTest: null, submittedAt: '2026-10-14T00:00:00Z', raw: { score: 70, maxScore: 100, skillResults: [{ skill: 'SQL', score: 40 }, { skill: 'SQL', score: 80 }] } });
  expect(combined.skills[0].score).toBe(60);
});
test('owned overview and paginated history exclude other users and private raw data', async () => {
  seedHistory(); seedHistory('bob');
  store.records.set('users/bob/progress/HRInterview/attempts/private', { totalScore: 5, avgScore: 5, fullReport: 'Bob private report', submittedAt: new Date() });
  const overview = (await auth(request(app).get('/api/progress/overview')).expect(200)).body;
  expect(overview.summary.attempts).toBe(3); expect(overview.skills[0].skill).toBe('SQL');
  const first = (await auth(request(app).get('/api/progress/attempts?pageSize=2')).expect(200)).body;
  expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
  const next = (await auth(request(app).get(`/api/progress/attempts?pageSize=2&after=${first.nextCursor}`)).expect(200)).body;
  expect(next.items).toHaveLength(1); expect(next.nextCursor).toBeNull();
  expect(new Set([...first.items, ...next.items].map(r => r.id)).size).toBe(3);
  expect(JSON.stringify(first)).not.toContain('raw'); expect(JSON.stringify(first)).not.toContain('Bob private');
  await request(app).get('/api/progress/overview').expect(401);
});
test('goals persist privately, enforce revisions and calculate score gap and seven-day activity', async () => {
  seedHistory();
  const created = (await auth(request(app).put('/api/progress/goals')).send({ skill: 'Node.js', targetScore: 90, weeklySessions: 3, ownerUid: 'bob' }).expect(200)).body;
  expect(store.records.has(`users/alice/studyGoals/${created.id}`)).toBe(true);
  expect(store.records.has(`users/bob/studyGoals/${created.id}`)).toBe(false);
  let overview = (await auth(request(app).get('/api/progress/overview'))).body;
  expect(overview.goals[0]).toMatchObject({ currentScore: 80, scoreGap: 10, weekCompleted: 3, achieved: false });
  expect((await auth(request(app).get('/api/progress/overview'), 'bob')).body.goals).toEqual([]);
  await auth(request(app).delete(`/api/progress/goals/${created.id}`), 'bob').send({ revision: created.revision }).expect(404);
  await auth(request(app).put('/api/progress/goals')).send({ skill: 'node.js', targetScore: 75, weeklySessions: 2 }).expect(409);
  const updated = (await auth(request(app).put('/api/progress/goals')).send({ skill: 'node.js', targetScore: 75, weeklySessions: 2, revision: 1 }).expect(200)).body;
  overview = (await auth(request(app).get('/api/progress/overview'))).body;
  expect(overview.goals[0].achieved).toBe(true);
  await auth(request(app).delete(`/api/progress/goals/${created.id}`)).send({ revision: 1 }).expect(409);
  await auth(request(app).delete(`/api/progress/goals/${created.id}`)).send({ revision: updated.revision }).expect(200);
});
test('empty and unscored history produce honest starter states, including unknown skill goals', async () => {
  let response = (await auth(request(app).get('/api/progress/overview')).expect(200)).body;
  expect(response.summary.averageScore).toBeNull(); expect(response.skills).toEqual([]); expect(response.recommendations[0].message).toContain('Complete');
  await auth(request(app).put('/api/progress/goals')).send({ skill: 'New skill', targetScore: 80, weeklySessions: 2 }).expect(200);
  store.records.set('users/alice/progress/CodingTest/attempts/old', { score: 80, submittedAt: new Date() });
  response = (await auth(request(app).get('/api/progress/overview'))).body;
  expect(response.summary).toMatchObject({ attempts: 1, gradedAttempts: 0, averageScore: null });
  expect(response.goals[0]).toMatchObject({ currentScore: null, scoreGap: null, weekCompleted: 0 });
  expect((await auth(request(app).get('/api/progress/attempts'))).body.items[0]).toMatchObject({ points: 80, score: null });
});
test('analytics discloses its bounded window and filters history types', async () => {
  for (let i = 0; i < 205; i++) store.records.set(`users/alice/progress/CodingTest/attempts/r${i}`, { score: 80, maxScore: 100, submittedAt: new Date(Date.now() - i * 1000) });
  const overview = (await auth(request(app).get('/api/progress/overview'))).body;
  expect(overview.summary.attempts).toBe(200); expect(overview.window).toMatchObject({ perSource: 200, truncated: true, scope: 'recent-attempts-per-source' });
  expect((await auth(request(app).get('/api/progress/attempts?type=HRInterview'))).body.items).toEqual([]);
});
test('invalid goals and query parameters are rejected', async () => {
  for (const body of [{ skill: '', targetScore: 80, weeklySessions: 2 }, { skill: 'Node', targetScore: 101, weeklySessions: 2 }, { skill: 'Node', targetScore: 80, weeklySessions: 0 }, { skill: 'Node', targetScore: 80.5, weeklySessions: 2 }]) await auth(request(app).put('/api/progress/goals')).send(body).expect(400);
  for (const url of ['/api/progress/attempts?type=bad', '/api/progress/attempts?pageSize=999', '/api/progress/attempts?after=missing']) await auth(request(app).get(url)).expect(400);
});
