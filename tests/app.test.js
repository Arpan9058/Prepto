const request = require('supertest');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const secret = 'offline-only-session-secret-32-characters';
let app, store, gemini, pdf;
function auth(req, uid = 'alice') { return req.set('Authorization', `Bearer ${uid}`); }
async function pdfFixture() {
  const doc = new PDFDocument({ compress: false });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.text('Alice software engineer Node.js PostgreSQL'); doc.end();
  return done;
}
async function docxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alice software engineer Node.js PostgreSQL</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}
beforeEach(() => {
  store = createFirebaseDouble({ 'questions/aptitude/data/q1': { question: 'Two plus two?', options: ['4', '5'], answer: '4' }, 'questions/aptitude/data/q2': { question: '<script>attack()</script>Three plus two?', options: ['4', '5'], answer: '5' } });
  gemini = createGeminiDouble();
  pdf = jest.fn(async () => Buffer.from('%PDF-offline-double'));
  app = createApp({ frontend: false, env: { SESSION_SECRET: secret, NODE_ENV: 'test' }, firebase: store.firebase, gemini, pdf, logger: pino({ level: 'silent' }) });
});
test('factory imports without credentials and requires an explicit strong secret', async () => {
  expect(() => createApp({ frontend: false, env: {} })).toThrow('SESSION_SECRET');
  expect(() => createApp({ frontend: false, env: { SESSION_SECRET: 'short' } })).toThrow('SESSION_SECRET');
  await request(app).get('/health').expect(200, { status: 'ok' });
  await request(app).get('/').expect(200);
  expect(store.verifyIdToken).not.toHaveBeenCalled();
  expect(process.env.SESSION_SECRET).toBeUndefined();
  expect(process.env.GEMINI_API_KEY).toBeUndefined();
  expect(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).toBeUndefined();
});
test('auth denies missing/invalid credentials and accepts verified identity', async () => {
  await request(app).get('/dashboard').expect(302).expect('Location', '/login');
  await request(app).post('/api/sessions').send({ category: 'aptitude' }).expect(401);
  await auth(request(app).get('/dashboard'), 'bad').expect(401);
  await auth(request(app).get('/dashboard')).expect(200);
  expect(store.verifyIdToken).toHaveBeenLastCalledWith('alice', true);
});
test('token login uses HttpOnly cookies, rotates session and logout clears them', async () => {
  const agent = request.agent(app);
  const login = await auth(agent.post('/api/set-token')).expect(200);
  expect(login.headers['set-cookie'].join(';')).toContain('HttpOnly');
  await agent.get('/dashboard').expect(200);
  await agent.get('/logout').expect(302);
  await agent.get('/dashboard').expect(302);
});
test('profile creation uses verified UID, not body UID, and is idempotent', async () => {
  await auth(request(app).post('/api/store-user')).send({ uid: 'bob', fullName: 'Alice', mobile: '123' }).expect(200);
  await auth(request(app).post('/api/store-user')).send({ fullName: 'Changed', mobile: '456' }).expect(200);
  expect(store.records.get('users/alice').fullName).toBe('Alice');
  expect(store.records.has('users/bob')).toBe(false);
  await auth(request(app).post('/api/store-user')).send({}).expect(400);
});
test.each([['pdf', pdfFixture], ['docx', docxFixture]])('ATS performs real %s extraction and sanitizes model HTML', async (extension, fixture) => {
  const response = await auth(request(app).post('/analyze')).field('jobDescription', 'Node.js engineer').attach('resume', await fixture(), `resume.${extension}`).expect(200);
  expect(gemini.generate.mock.calls[0][0]).toContain('Alice software engineer Node.js PostgreSQL');
  expect(response.text).toContain('Useful result');
  expect(response.text).not.toContain('<script>alert("x")</script>');
});
test('uploads reject absent, unsupported, malformed and oversized resumes', async () => {
  await auth(request(app).post('/analyze')).send({ jobDescription: 'Engineer' }).expect(400);
  await auth(request(app).post('/analyze')).field('jobDescription', 'Engineer').attach('resume', Buffer.from('text'), 'resume.doc').expect(415);
  await auth(request(app).post('/analyze')).field('jobDescription', 'Engineer').attach('resume', Buffer.from('not a pdf'), 'resume.pdf').expect(400);
  await auth(request(app).post('/analyze')).field('jobDescription', 'Engineer').attach('resume', Buffer.alloc(5 * 1024 * 1024 + 1), 'resume.pdf').expect(413);
  await auth(request(app).post('/analyze')).attach('resume', await pdfFixture(), 'resume.pdf').expect(400);
});
test('resume questions and career guidance share injected Gemini adapter', async () => {
  await auth(request(app).post('/resume-interview')).attach('resume', await docxFixture(), 'resume.docx').expect(200);
  await auth(request(app).post('/career-guidance')).send({ skills: 'Node.js' }).expect(200);
  await auth(request(app).post('/career-guidance')).send({}).expect(400);
  expect(gemini.generate).toHaveBeenCalledTimes(2);
});
test('mock sessions hide answers, enforce owner, grade saved questions, reject repeat submissions', async () => {
  const start = await auth(request(app).post('/api/sessions')).send({ category: 'aptitude' }).expect(200);
  expect(start.body.questions).toHaveLength(2);
  for (const q of start.body.questions) expect(Object.keys(q).sort()).toEqual(['_id', 'options', 'question']);
  expect(store.records.get(`sessions/${start.body.sessionId}`).ownerUid).toBe('alice');
  await auth(request(app).post('/api/sessions/submit'), 'bob').send({ sessionId: start.body.sessionId, answers: {} }).expect(403);
  store.records.set('questions/aptitude/data/q1', { question: 'Changed', options: ['4', '5'], answer: '5' });
  const submission = { sessionId: start.body.sessionId, answers: { q1: '4', q2: '5' } };
  const result = await auth(request(app).post('/api/sessions/submit')).send(submission).expect(200);
  expect(result.body).toMatchObject({ score: 2, total: 2 });
  await auth(request(app).post('/api/sessions/submit')).send(submission).expect(409);
  const saved = store.records.get(`users/alice/progress/MockTest/aptitude/${start.body.sessionId}`);
  expect(saved.fullReport).not.toContain('<script>');
  expect(saved.answers[0].question).not.toBe('Changed');
});
test('concurrent mock submissions commit exactly one report', async () => {
  const start = await auth(request(app).post('/api/sessions')).send({ category: 'aptitude' });
  const responses = await Promise.all([1, 2].map(() => auth(request(app).post('/api/sessions/submit')).send({ sessionId: start.body.sessionId, answers: { q1: '4' } })));
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect([...store.records.keys()].filter(p => p.startsWith('users/alice/progress/'))).toHaveLength(1);
});
test('invalid mock requests never complete sessions or create reports', async () => {
  await auth(request(app).post('/api/sessions')).send({ category: '../../users' }).expect(400);
  await auth(request(app).post('/api/sessions')).send({ category: 'reasoning' }).expect(404);
  await auth(request(app).post('/api/sessions/submit')).send({ sessionId: 'missing', answers: {} }).expect(404);
  await auth(request(app).post('/api/sessions/submit')).send({ sessionId: '../bad', answers: {} }).expect(400);
  const start = await auth(request(app).post('/api/sessions')).send({ category: 'aptitude' });
  for (const answers of [{ unexpected: '4' }, { q1: 'forged' }, []]) {
    await auth(request(app).post('/api/sessions/submit')).send({ sessionId: start.body.sessionId, answers }).expect(400);
  }
  expect(store.records.get(`sessions/${start.body.sessionId}`).completed).toBe(false);
});
test('reports, downloads and progress are owned and sanitized, including technical attempts', async () => {
  store.records.set('users/alice/progress/TechnicalInterview/attempts/r1', { totalScore: 24, fullReport: '<h2>Owned report</h2><script>attack()</script><img src=x onerror=attack()>', submittedAt: new Date() });
  store.records.set('users/bob/progress/HRInterview/attempts/r2', { totalScore: 5, fullReport: 'Bob private data', submittedAt: new Date() });
  const list = await auth(request(app).get('/reports')).expect(200);
  expect(list.text).toContain('TechnicalInterview'); expect(list.text).not.toContain('Bob private data');
  const report = await auth(request(app).get('/reports/view/r1?type=TechnicalInterview')).expect(200);
  expect(report.text).toContain('Owned report'); expect(report.text).not.toContain('attack()');
  const download = await auth(request(app).get('/reports/download/r1?type=TechnicalInterview&data=forged')).expect(200);
  expect(download.body.fullReport).toBe('<h2>Owned report</h2>');
  await auth(request(app).get('/reports/view/r1?type=TechnicalInterview'), 'bob').expect(404);
  await auth(request(app).get('/reports/view/r2?type=HRInterview')).expect(404);
  await auth(request(app).get('/reports/view/r1?type=bad')).expect(400);
  await auth(request(app).get('/reports/view/r1?type=MockTest&sub=bad')).expect(400);
  const progress = await auth(request(app).get('/progress/legacy')).expect(200);
  expect(progress.text).toContain('TechnicalInterview'); expect(progress.text).toContain('24');
});
test('HR interview uses server questions and saves one report after all questions', async () => {
  const agent = request.agent(app);
  await auth(agent.get('/hr-round/initial-question')).expect(200);
  for (let i = 0; i < require('../HRQuestions.json').length; i++) {
    const r = await auth(agent.post('/hr-round/analyze-text')).send({ text: '<script>attack()</script>My answer', question: 'forged', questionCounter: i }).expect(200);
    expect(r.body.analysis.score).toBe(4);
  }
  await auth(agent.post('/hr-round/analyze-text')).send({ text: 'Again' }).expect(409);
  const reports = [...store.records.entries()].filter(([p]) => p.includes('/HRInterview/attempts/'));
  expect(reports).toHaveLength(1); expect(reports[0][1].totalScore).toBe(36);
  expect(reports[0][1].fullReport).not.toContain('<script>');
  expect(gemini.generate.mock.calls[0][0]).toContain('Tell me about yourself.');
  expect(gemini.generate.mock.calls[0][0]).not.toContain('forged');
});
test('HR interview denies missing state and out-of-sequence answers', async () => {
  const agent = request.agent(app);
  await auth(agent.post('/hr-round/analyze-text')).send({ text: 'Answer' }).expect(409);
  await auth(agent.get('/hr-round')).expect(200);
  await auth(agent.post('/hr-round/analyze-text')).send({ text: 'Answer', questionCounter: 9 }).expect(409);
  await auth(agent.post('/hr-round/analyze-text')).send({}).expect(400);
});
test('technical interview ignores forged frontend scores and persists server scores', async () => {
  const agent = request.agent(app);
  await auth(agent.get('/technical-round')).expect(200);
  const start = await auth(agent.post('/technical-round/analyze-text')).send({ text: 'I use Node and SQL', questionCounter: 1 }).expect(200);
  expect(start.body.extractedSkills).toEqual(['Node.js', 'SQL', 'JavaScript']);
  for (let i = 0; i < 18; i++) {
    const r = await auth(agent.post('/technical-round/analyze-text')).send({ text: 'A tradeoff', skillScores: [1000, 1000, 1000], totalQuestions: 100, question: 'forged' }).expect(200);
    if (i === 17) { expect(r.body.interviewComplete).toBe(true); expect(r.body.analysis.totalScore).toBe(8); expect(r.body.analysis.followUpQuestion).toContain('Interview complete'); }
  }
  await auth(agent.post('/technical-round/analyze-text')).send({ text: 'Again' }).expect(409);
  const reports = [...store.records.entries()].filter(([p]) => p.includes('/TechnicalInterview/attempts/'));
  expect(reports).toHaveLength(1); expect(reports[0][1].totalScore).toBe(144);
  expect(reports[0][1].skillScores).toEqual([48, 48, 48]);
});
test('coding test evaluates through shared adapter and persists once without host execution', async () => {
  const agent = request.agent(app);
  await auth(agent.get('/coding-test')).expect(200);
  await auth(agent.post('/coding-test/start-test')).send({ language: 'shell' }).expect(400);
  await auth(agent.post('/coding-test/start-test')).send({ language: 'Python' }).expect(302);
  await auth(agent.get('/coding-test/question/1')).expect(200);
  await auth(agent.post('/coding-test/submit-answer/1')).send({ code: 'return [0, 1]', earlySubmit: 'true' }).expect(302);
  await auth(agent.post('/coding-test/submit-answer/1')).send({ code: 'repeat' }).expect(409);
  await auth(agent.get('/coding-test/results')).expect(200);
  await auth(agent.get('/coding-test/results')).expect(200);
  expect([...store.records.keys()].filter(p => p.includes('/CodingTest/attempts/'))).toHaveLength(1);
});
test('resume export stays in owning session and never accepts client paths', async () => {
  const agent = request.agent(app);
  await auth(agent.get('/download-resume')).set('Cookie', 'resume_file=../../private_key.pem').expect(400);
  await auth(agent.post('/generate-resume')).send({ fullName: 'Alice', education: '<script>attack()</script>' }).expect(200);
  const download = await auth(agent.get('/download-resume')).expect(200).expect('Content-Type', /application\/pdf/);
  expect(download.body.toString()).toContain('%PDF');
  expect(pdf.mock.calls[0][0]).toContain('&lt;script&gt;');
  await auth(request(app).get('/download-resume'), 'bob').expect(400);
  await auth(agent.get('/download-resume'), 'bob').expect(400);
});
test('shared error handling hides SDK secrets and rejects cross-origin requests', async () => {
  gemini.generate.mockRejectedValue(new Error('private-secret-do-not-show'));
  const r = await auth(request(app).post('/career-guidance')).send({ skills: 'Node' }).expect(500);
  expect(r.body).toEqual({ error: 'Internal server error' });
  await request(app).post('/api/set-token').set('Origin', 'https://attacker.test').expect(403);
  await request(app).post('/api/set-token').set('Sec-Fetch-Site', 'cross-site').expect(403);
  await request(app).get('/unknown').expect(404);
});
module.exports = { pdfFixture };
test('question sampling is bounded at five and never exposes answer metadata', async () => {
  for (let i = 3; i <= 12; i++) store.records.set(`questions/aptitude/data/q${i}`, { question: `Question ${i}`, options: ['A', 'B'], answer: 'A', explanation: 'Private explanation' });
  const r = await auth(request(app).post('/api/sessions')).send({ category: 'aptitude' }).expect(200);
  expect(r.body.questions).toHaveLength(5);
  expect(new Set(r.body.questions.map(q => q._id)).size).toBe(5);
  expect(JSON.stringify(r.body)).not.toContain('explanation');
});
test('invalid AI scores fail without advancing HR state', async () => {
  const agent = request.agent(app);
  await auth(agent.get('/hr-round/initial-question'));
  gemini.generate.mockResolvedValueOnce({ score: 999, analysis: 'forged' });
  await auth(agent.post('/hr-round/analyze-text')).send({ text: 'answer', questionCounter: 0 }).expect(500);
  await auth(agent.post('/hr-round/analyze-text')).send({ text: 'answer', questionCounter: 0 }).expect(200);
});
test('technical interview ends after a failed skill and rejects invalid model skills', async () => {
  const agent = request.agent(app);
  gemini.generate.mockResolvedValueOnce(['Node']);
  await auth(agent.post('/technical-round/analyze-text')).send({ text: 'intro' }).expect(500);
  await auth(agent.post('/technical-round/analyze-text')).send({ text: 'intro' }).expect(200);
  gemini.generate.mockResolvedValue({ totalScore: 0, analysis: 'Improve', recommendation: 'Study' });
  for (let i = 0; i < 6; i++) {
    const r = await auth(agent.post('/technical-round/analyze-text')).send({ text: 'answer' }).expect(200);
    if (i === 5) expect(r.body.interviewComplete).toBe(true);
  }
  expect([...store.records.values()].find(d => d.extractedSkills)?.totalScore).toBe(0);
});
test('production cookies are Secure behind an explicitly trusted TLS proxy', async () => {
  const session = require('express-session');
  const production = createApp({ frontend: false, env: { SESSION_SECRET: secret, NODE_ENV: 'production', TRUST_PROXY: 'true' }, firebase: store.firebase, gemini, sessionStore: new session.MemoryStore(), logger: pino({ level: 'silent' }) });
  const r = await auth(request(production).post('/api/set-token')).set('X-Forwarded-Proto', 'https').expect(200);
  for (const cookie of r.headers['set-cookie']) expect(cookie).toContain('Secure');
});
test('resume validation and renderer failures do not expose internal information', async () => {
  const agent = request.agent(app);
  await auth(agent.post('/generate-resume')).send({}).expect(400);
  await auth(agent.post('/generate-resume')).send({ fullName: 'Alice' }).expect(200);
  pdf.mockRejectedValueOnce(new Error('private-chromium-path'));
  const r = await auth(agent.get('/download-resume')).expect(500);
  expect(r.body).toEqual({ error: 'Internal server error' });
});
