const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let app;
beforeEach(() => { app = createApp({ env: { SESSION_SECRET: 'navigation-offline-only-session-secret' }, firebase: createFirebaseDouble().firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) }); });
test.each(['/dashboard', '/question-bank', '/interviews', '/resumes', '/resume-matches', '/coding-practice', '/progress', '/reports'])('%s has the same accessible navigation, active link and skip target', async path => {
  const r = await request(app).get(path).set('Authorization', 'Bearer alice').expect(200);
  for (const href of ['/dashboard', '/question-bank', '/interviews', '/resumes', '/resume-matches', '/coding-practice', '/progress', '/reports']) expect(r.text).toContain(`href="${href}"`);
  expect(r.text).toContain(`href="${path}" aria-current="page"`); expect(r.text).toContain('id="main-content" tabindex="-1"'); expect(r.text).toContain('Skip to main content');
  expect(r.text).not.toContain('OFFLINE DEMO');
});
test('dashboard retains working legacy routes behind clearly labeled tool groups', async () => {
  const r = await request(app).get('/dashboard').set('Authorization', 'Bearer alice').expect(200);
  for (const path of ['/mock-interviews', '/coding-test', '/resume-builder', '/analyze', '/resume-interview', '/careerguidance', '/progress/legacy']) expect(r.text).toContain(`href="${path}"`);
  await request(app).get('/dashboard').expect(302).expect('Location', '/login');
});
