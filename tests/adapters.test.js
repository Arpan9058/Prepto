const { createGemini } = require('../adapters/gemini');
const { exportPdf } = require('../resumeGenerator');
const { extractTextFromFile } = require('../ats');
const { FirestoreSessionStore } = require('../adapters/sessionStore');
const { Writable } = require('node:stream');
const pino = require('pino');
const request = require('supertest');
const { createApp } = require('../app');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
test('Gemini fetch transport uses headers, timeout and structured content', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"score":4}' }] } }] }) }));
  const gemini = createGemini({ env: { GEMINI_API_KEY: 'offline-test-key', GEMINI_MODEL: 'model' }, fetchImpl });
  expect(await gemini.generate('prompt', { json: true })).toEqual({ score: 4 });
  expect(fetchImpl.mock.calls[0][0]).not.toContain('offline-test-key');
  const options = fetchImpl.mock.calls[0][1];
  expect(options.headers['x-goog-api-key']).toBe('offline-test-key');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json');
  await expect(createGemini({ env: {}, fetchImpl }).generate('x')).rejects.toThrow('GEMINI_API_KEY');
});
test('Gemini errors do not expose provider body or credential', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 403, text: async () => 'secret' }));
  await expect(createGemini({ env: { GEMINI_API_KEY: 'test-key' }, fetchImpl }).generate('x')).rejects.toThrow('Gemini request failed (403)');
  const emptyFetch = async () => ({ ok: true, json: async () => ({ candidates: [] }) });
  await expect(createGemini({ env: { GEMINI_API_KEY: 'test-key' }, fetchImpl: emptyFetch }).generate('x')).rejects.toThrow('no content');
});
test('Firebase initialization is lazy and configures HTTP and gRPC proxy', () => {
  jest.isolateModules(() => {
    const cert = jest.fn(() => 'credential');
    const initializeApp = jest.fn();
    jest.doMock('firebase-admin/app', () => ({ getApps: () => [], cert, initializeApp }));
    const { getFirebase } = require('../adapters/firebase');
    expect(initializeApp).not.toHaveBeenCalled();
    const env = { HTTPS_PROXY: 'http://proxy.example.test:8080', FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"offline"}' };
    getFirebase(env);
    expect(env.grpc_proxy).toBe(env.HTTPS_PROXY);
    expect(cert.mock.calls[0][0]).toEqual({ project_id: 'offline' });
    expect(initializeApp.mock.calls[0][0].httpAgent).toBeDefined();
    getFirebase(env);
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
  jest.dontMock('firebase-admin/app');
});
test('Firebase uses ADC and preserves an existing grpc_proxy', () => {
  jest.isolateModules(() => {
    const applicationDefault = jest.fn(() => 'adc');
    const initializeApp = jest.fn();
    jest.doMock('firebase-admin/app', () => ({ getApps: () => [], applicationDefault, initializeApp }));
    const { getFirebase } = require('../adapters/firebase');
    const env = { HTTP_PROXY: 'http://proxy.example.test', grpc_proxy: 'http://grpc.example.test' };
    getFirebase(env);
    expect(applicationDefault).toHaveBeenCalled();
    expect(env.grpc_proxy).toBe('http://grpc.example.test');
  });
  jest.dontMock('firebase-admin/app');
});
function browserDouble(error) {
  const page = { setRequestInterception: jest.fn(), on: jest.fn(), setJavaScriptEnabled: jest.fn(), setContent: jest.fn(), pdf: jest.fn(async () => { if (error) throw error; return Buffer.from('%PDF-double'); }) };
  const browser = { newPage: jest.fn(async () => page), close: jest.fn() };
  return { page, browser, launcher: { launch: jest.fn(async () => browser) } };
}
test('PDF export is portable, blocks external requests and always closes Chromium', async () => {
  const double = browserDouble();
  await exportPdf('<h1>Resume</h1>', { launcher: double.launcher, env: { CHROMIUM_EXECUTABLE_PATH: '/portable/chrome' } });
  expect(double.launcher.launch.mock.calls[0][0].executablePath).toBe('/portable/chrome');
  expect(double.launcher.launch.mock.calls[0][0].args).toEqual([]);
  expect(double.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
  const abort = jest.fn(); double.page.on.mock.calls[0][1]({ abort }); expect(abort).toHaveBeenCalled();
  expect(double.browser.close).toHaveBeenCalledTimes(1);
  const failure = browserDouble(new Error('PDF failed'));
  await expect(exportPdf('x', { launcher: failure.launcher, env: { CHROMIUM_EXECUTABLE_PATH: '/portable/chrome', CHROMIUM_NO_SANDBOX: 'true' } })).rejects.toThrow('PDF failed');
  expect(failure.browser.close).toHaveBeenCalledTimes(1);
});
test('invalid DOCX and incomplete PDF files fail cleanly', async () => {
  await expect(extractTextFromFile({ originalname: 'a.docx', buffer: Buffer.from('not zip') })).rejects.toMatchObject({ status: 400 });
  await expect(extractTextFromFile({ originalname: 'a.pdf', buffer: Buffer.from('%PDF-invalid') })).rejects.toMatchObject({ status: 400 });
  await expect(extractTextFromFile({ originalname: 'a.txt', buffer: Buffer.from('text') })).rejects.toMatchObject({ status: 415 });
});
test('Firestore session store honors expiration and destroys sessions', async () => {
  const values = new Map();
  const firebase = { firestore: () => ({ collection: () => ({ doc: sid => ({
    set: async data => values.set(sid, data), delete: async () => values.delete(sid),
    get: async () => ({ exists: values.has(sid), data: () => { const d = values.get(sid); return { ...d, expiresAt: { toDate: () => d.expiresAt } }; } })
  }) }) }) };
  const store = new FirestoreSessionStore(firebase);
  const call = (method, ...args) => new Promise((resolve, reject) => store[method](...args, (err, value) => err ? reject(err) : resolve(value)));
  const value = { ownerUid: 'alice', cookie: { expires: new Date(Date.now() + 100000).toISOString() } };
  await call('set', 'sid', value);
  expect(await call('get', 'sid')).toEqual(value);
  await call('touch', 'sid', { ...value, ownerUid: 'bob' });
  expect((await call('get', 'sid')).ownerUid).toBe('bob');
  await call('destroy', 'sid'); expect(await call('get', 'sid')).toBeNull();
  await call('set', 'sid', { cookie: { expires: new Date(0).toISOString() } });
  expect(await call('get', 'sid')).toBeNull();
});
test('Pino request logs omit bearer, cookies, query secrets and SDK messages', async () => {
  let output = '';
  const sink = new Writable({ write(chunk, _enc, cb) { output += chunk.toString(); cb(); } });
  const store = createFirebaseDouble();
  const gemini = createGeminiDouble();
  gemini.generate.mockRejectedValue(new Error('private-sdk-secret'));
  const app = createApp({ frontend: false, env: { SESSION_SECRET: 'offline-test-session-secret-32-chars' }, firebase: store.firebase, gemini, logger: pino(sink) });
  await request(app).post('/career-guidance?key=private-query-secret').set('Authorization', 'Bearer alice').set('Cookie', 'session_token=private-cookie-secret').send({ skills: 'private-body-secret' }).expect(500);
  expect(output).toContain('Request failed');
  for (const value of ['Bearer alice', 'private-sdk-secret', 'private-query-secret', 'private-cookie-secret', 'private-body-secret']) expect(output).not.toContain(value);
});
test('shared legacy AI entry points use the same injected transport', async () => {
  const gemini = createGeminiDouble();
  const { geminianalysis } = require('../services/geminiService');
  const { extractSkills } = require('../services/skillExtractorService');
  await geminianalysis('answer', 'question', 2, 'job', gemini);
  expect(await extractSkills('intro', 'job', gemini)).toHaveLength(3);
  gemini.generate.mockResolvedValueOnce('bad');
  await expect(extractSkills('intro', 'job', gemini)).rejects.toThrow('Invalid skills');
});
test('real Firebase Admin modular SDK can construct adapters without a credential file or network call', () => {
  const { execFileSync } = require('node:child_process');
  const code = `const assert = require('node:assert/strict'); const { getFirebase } = require('./adapters/firebase'); const firebase = getFirebase(); assert.equal(typeof firebase.auth().verifyIdToken, 'function'); assert.equal(typeof firebase.firestore().runTransaction, 'function'); console.log('modular-sdk-ok');`;
  const output = execFileSync(process.execPath, ['-e', code], { cwd: require('node:path').join(__dirname, '..'), timeout: 10000, env: process.env, encoding: 'utf8' });
  expect(output.trim()).toBe('modular-sdk-ok');
});
test('PDF export uses disposable writable Chromium state and removes it when launch/close fails', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const launch = jest.fn(async () => { throw new Error('Launch failed'); });
  await expect(exportPdf('synthetic', { launcher: { launch }, env: { CHROMIUM_EXECUTABLE_PATH: '/synthetic/chrome' } })).rejects.toThrow('Launch failed');
  const options = launch.mock.calls[0][0], root = path.dirname(options.userDataDir);
  expect(options.env.XDG_CONFIG_HOME).toBe(path.join(root, 'config')); expect(options.env.XDG_CACHE_HOME).toBe(path.join(root, 'cache'));
  expect(fs.existsSync(root)).toBe(false);
  const double = browserDouble(); double.browser.close.mockRejectedValueOnce(new Error('Close failed'));
  await expect(exportPdf('synthetic', { launcher: double.launcher, env: { CHROMIUM_EXECUTABLE_PATH: '/synthetic/chrome' } })).rejects.toThrow('Close failed');
  expect(fs.existsSync(path.dirname(double.launcher.launch.mock.calls[0][0].userDataDir))).toBe(false);
});
