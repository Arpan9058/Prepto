const puppeteer = require('puppeteer-core');
const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../app');
const { chromiumPath } = require('../resumeGenerator');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
let browser, page, server, base, app, store;
beforeAll(async () => { browser = await puppeteer.launch({ executablePath: chromiumPath(process.env), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); });
afterAll(async () => { await browser.close(); });
beforeEach(async () => {
  store = createFirebaseDouble(); app = createApp({ env: { SESSION_SECRET: 'react-browser-offline-only-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), pdf: async () => Buffer.from('%PDF-offline-private-export'), logger: pino({ level: 'silent' }) });
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
  page = await browser.newPage(); await page.setCookie({ name: 'session_token', value: 'alice', url: base, httpOnly: true });
});
afterEach(async () => { await page.close(); await new Promise(r => { server.close(r); server.closeAllConnections(); }); });
test('React production landing and authenticated dashboard render real empty data and preserve mobile keyboard navigation', async () => {
  await page.goto(base); await page.waitForSelector('.landing-hero'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); expect(await page.evaluate(() => document.activeElement.id)).toBe('main-content'); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto'); expect(await page.$eval('h1', n => n.textContent)).toContain('Better answers');
  await page.goto(base + '/dashboard'); await page.waitForSelector('.empty-state');
  expect(await page.$eval('.progress-facts strong', n => n.textContent)).toBe('0');
  expect(await page.$eval('main', n => n.textContent)).toContain('Your first session belongs here');
  await page.setViewport({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.click('[aria-label="Open navigation"]'); await page.waitForFunction(() => document.activeElement.getAttribute('href') === '/dashboard');
  await page.keyboard.press('Escape'); expect(await page.$eval('[aria-label="Open navigation"]', n => n.getAttribute('aria-expanded'))).toBe('false');
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe('Open navigation');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('React loading, malformed response, retry and expired-session states are recoverable', async () => {
  await page.setRequestInterception(true); let failed = true;
  page.on('request', r => { if (r.url().includes('/api/progress/overview') && failed) r.respond({ status: 502, contentType: 'text/html', body: 'Gateway error' }); else r.continue(); });
  await page.goto(base + '/dashboard'); await page.waitForSelector('[role=alert]'); expect(await page.$eval('[role=alert]', n => n.textContent)).toContain('unreadable response');
  failed = false; await page.click('.text-button'); await page.waitForSelector('.empty-state');
  await page.deleteCookie({ name: 'session_token', url: base }); await page.click('.legacy-tools summary');
  const status = await page.evaluate(async () => (await fetch('/api/session')).status); expect(status).toBe(401);
});
test('React shell remains server guarded; JSON profile/report operations retain owner and CSRF boundaries', async () => {
  await request(app).get('/dashboard').expect(302).expect('Location', '/login'); await request(app).get('/api/session').expect(401);
  await request(app).put('/api/profile').set('Authorization', 'Bearer alice').send({ fullName: 'Alice', mobile: '', admin: true, uid: 'bob' }).expect(200);
  const bob = await request(app).get('/api/profile').set('Authorization', 'Bearer bob').expect(200); expect(bob.body.fullName).toBe('');
  await request(app).put('/api/profile').set('Cookie', 'session_token=alice').set('Origin', 'https://untrusted.example').send({ fullName: 'Forged' }).expect(403);
  const me = await request(app).get('/api/session').set('Authorization', 'Bearer alice').expect(200); expect(me.body.admin).toBe(false); expect(me.body.email).toBeUndefined();
  expect(store.records.get('users/alice').admin).toBeUndefined(); expect(store.records.get('users/alice').email).toBe('alice@example.test');
  const unsafe = createApp({ env: { SESSION_SECRET: 'react-runtime-leak-test-session-secret', FIREBASE_WEB_CONFIG_JSON: '{"private_key":"synthetic-never-reflect"}' }, firebase: store.firebase, logger: pino({ level: 'silent' }) });
  const runtime = await request(unsafe).get('/api/runtime'); expect(runtime.body.firebase).toBeNull(); expect(runtime.text).not.toContain('synthetic-never-reflect');
});
test('React interview journey saves snapshots, pause/resume, grading, completion and private review', async () => {
  await require('../scripts/seed-question-bank').seed(store.db);
  await page.goto(base + '/interviews?question=sample-13'); await page.waitForSelector('.question-picker input:checked');
  await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]);
  await page.waitForSelector('select[name=choice]'); const url = page.url();
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Pause interview').click());
  await page.waitForFunction(() => document.querySelector('.screen-intro').textContent.includes('paused'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Resume interview').click()); await page.waitForSelector('select[name=choice]');
  await page.select('select[name=choice]', 'GET'); await page.click('form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('Score 100%'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Complete interview').click());
  await page.waitForFunction(() => document.querySelector('.screen-intro').textContent.includes('completed')); await page.reload(); await page.waitForSelector('details summary');
  expect(await page.$eval('main', n => n.textContent)).toContain('GET');
  await page.setCookie({ name: 'session_token', value: 'bob', url: base, httpOnly: true }); await page.goto(url); await page.waitForSelector('[role=alert]'); expect(await page.$eval('[role=alert]', n => n.textContent)).toContain('Interview not found');
}, 20000);
test('React resume upload/version history, matching, PDF and report downloads use owner-scoped backend paths', async () => {
  await page.goto(base + '/resumes'); await page.waitForSelector('input[name=title]');
  await page.type('input[name=title]', 'React private resume'); await page.type('textarea[name=text]', 'Synthetic Node.js SQL experience');
  await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]); await page.waitForFunction(() => document.body.textContent.includes('Version 1'));
  const url = page.url(); await page.waitForSelector('textarea[name=text]');
  await page.$eval('textarea[name=text]', n => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(n, 'Version two SQL evidence'); n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('input[name=label]', 'SQL role'); await page.click('form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('Version 2'));
  await page.waitForSelector('input[name=jobTitle]'); await page.type('input[name=jobTitle]', 'Backend role'); await page.type('textarea[name=jobDescription]', 'Node.js SQL TypeScript');
  const forms = await page.$$('form'); await forms.at(-1).$eval('button[type=submit]', n => n.click()); await page.waitForFunction(() => document.body.textContent.includes('76% AI compatibility estimate'));
  const pdf = await page.$eval('a[href$="/pdf"]', async n => { const r = await fetch(n.href); return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }; }); expect(pdf).toMatchObject({ status: 200, type: 'application/pdf' }); expect(pdf.bytes).toBeGreaterThan(10);
  await page.goto(base + '/resume-matches'); await page.waitForFunction(() => document.body.textContent.includes('Backend role')); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Review match').click()); await page.waitForFunction(() => document.body.textContent.includes('TypeScript'));
  await page.setCookie({ name: 'session_token', value: 'bob', url: base, httpOnly: true }); await page.goto(url); await page.waitForSelector('[role=alert]'); expect(await page.$eval('[role=alert]', n => n.textContent)).toContain('Resume not found');
}, 25000);
test('React coding preserves drafts and AI-only reviews; progress goals and saved report JSON remain usable', async () => {
  await page.goto(base + '/coding-practice'); await page.waitForSelector('.cards-grid button'); await page.click('.cards-grid button'); await page.waitForSelector('.code-editor');
  await page.$eval('.code-editor', n => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(n, '// Synthetic <img src=x onerror=alert(1)>'); n.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save draft').click()); await page.waitForFunction(() => document.body.textContent.includes('Saved draft revision 1'));
  await page.click('.coding-workspace form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('AI estimate: 75%'));
  expect(await page.$('main img')).toBeNull(); expect(await page.$eval('pre', n => n.textContent)).toContain('<img src=x'); expect(await page.$eval('main', n => n.textContent)).toContain('No executable tests were run');
  await page.goto(base + '/progress'); await page.waitForSelector('input[name=skill]'); await page.type('input[name=skill]', 'Node.js'); await page.click('form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('Target 80%'));
  expect(await page.$eval('main', n => n.textContent)).toContain('AI estimate 75%');
  await page.goto(base + '/reports'); await page.waitForSelector('a[href^="/reports/download/"]');
  const downloaded = await page.$eval('a[href^="/reports/download/"]', async n => { const r = await fetch(n.href); return { status: r.status, disposition: r.headers.get('content-disposition'), body: await r.json() }; });
  expect(downloaded.status).toBe(200); expect(downloaded.disposition).toContain('attachment'); expect(downloaded.body.execution.executed).toBe(false);
  await Promise.all([page.waitForNavigation(), page.click('a[href^="/reports/view/"]')]); await page.waitForSelector('.report-html'); expect(await page.$eval('.report-html', n => n.textContent)).toContain('not executed');
}, 25000);
test('React isolated demo keeps distinct auth, synthetic labels and working mobile navigation', async () => {
  const { app: demo } = await require('../demo/app').createDemoApp({ env: {} });
  const local = demo.listen(0, '127.0.0.1'); await new Promise(r => local.once('listening', r)); const origin = `http://127.0.0.1:${local.address().port}`;
  try {
    await page.goto(origin + '/demo'); await page.waitForSelector('form[action="/demo/start"]'); await Promise.all([page.waitForNavigation(), page.click('form[action="/demo/start"] button')]); await page.waitForSelector('.session-feature');
    expect(await page.$eval('.demo-notice', n => n.textContent)).toContain('Fixed simulated feedback'); await page.setViewport({ width: 390, height: 844 }); await page.click('[aria-label="Open navigation"]');
    await Promise.all([page.waitForNavigation(), page.click('#workspace-nav a[href="/coding-practice"]')]); await page.waitForSelector('.cards-grid button');
    expect(await page.$eval('main', n => n.textContent)).toContain('Code execution is disabled');
    await page.goto(origin + '/demo'); await page.waitForSelector('form[action="/demo/exit"]'); await Promise.all([page.waitForNavigation(), page.click('form[action="/demo/exit"] button')]); expect(await page.evaluate(async () => (await fetch('/api/session')).status)).toBe(401);
  } finally { await new Promise(r => { local.close(r); local.closeAllConnections(); }); }
}, 20000);
test('React registration validates mismatched passwords without contacting Firebase', async () => {
  const external = []; await page.setRequestInterception(true); page.on('request', r => { if (new URL(r.url()).origin !== base) { external.push(r.url()); r.abort(); } else r.continue(); });
  await page.goto(base + '/onboarding'); await page.waitForSelector('input[name=fullName]'); await page.type('input[name=fullName]', 'Synthetic onboarding'); await page.click('button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('Saved successfully')); expect(store.records.get('users/alice').fullName).toBe('Synthetic onboarding');
  await page.goto(base + '/register'); await page.waitForSelector('input[name=confirm]'); await page.type('input[name=fullName]', 'Synthetic person'); await page.type('input[name=email]', 'person@example.test'); await page.type('input[name=password]', 'offline-example-one'); await page.type('input[name=confirm]', 'offline-example-two'); await page.click('button[type=submit]'); await page.waitForSelector('[role=alert]');
  expect(await page.$eval('[role=alert]', n => n.textContent)).toContain('Passwords do not match'); expect(external).toEqual([]); expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});
test('same-origin Vite development and built production preserve demo auth and React navigation behavior', async () => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['scripts/dev-server.js', '--demo'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'development', PORT: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise(r => child.once('close', r)); let timer;
  try {
    const port = await new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Vite startup timed out')), 20000); child.once('error', reject); child.stdout.on('data', b => { const m = b.toString().match(/listening on port (\d+)/); if (m) resolve(m[1]); }); child.once('exit', code => { if (code) reject(new Error('Vite development failed')); }); }); clearTimeout(timer);
    const origin = `http://127.0.0.1:${port}`;
    await page.goto(origin + '/demo'); await page.waitForSelector('form[action="/demo/start"]'); await Promise.all([page.waitForNavigation(), page.click('form[action="/demo/start"] button')]); await page.waitForSelector('.session-feature');
    expect(await page.$eval('h1', n => n.textContent)).toContain('session count');
    expect(await page.evaluate(async () => (await fetch('/api/session')).status)).toBe(200);
    await page.goto(origin + '/coding-practice'); await page.waitForSelector('.cards-grid button'); expect(await page.$eval('.screen-intro', n => n.textContent)).toContain('execution is disabled');
    const cookie = (await page.cookies()).filter(c => c.name === 'prepto_demo_token').map(c => c.name + '=' + c.value).join('; ');
    expect((await fetch(origin + '/api/profile', { method: 'PUT', headers: { Cookie: cookie, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
    expect(await page.evaluate(async () => (await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)).toBe(400);
  } finally { clearTimeout(timer); try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ } await closed; }
}, 35000);
test('React admin editor creates and archives questions while learner UI and backend deny admin writes', async () => {
  await page.setCookie({ name: 'session_token', value: 'admin', url: base, httpOnly: true }); await page.goto(base + '/question-bank'); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Create question'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Create question').click()); await page.waitForSelector('input[name=title]');
  await page.type('input[name=title]', 'React admin question'); await page.type('textarea[name=prompt]', 'Explain a useful tradeoff'); await page.type('input[name=skills]', 'Node.js'); await page.type('textarea[name=explanation]', 'Discuss one concrete example.');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save question').click()); await page.waitForFunction(() => document.body.textContent.includes('React admin question') && !document.getElementById('editor-title'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Edit question').click()); await page.waitForSelector('input[name=title]'); await page.$eval('input[name=title]', n => n.select()); await page.keyboard.type('React edited question'); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save question').click()); await page.waitForFunction(() => document.body.textContent.includes('React edited question') && !document.getElementById('editor-title'));
  page.once('dialog', d => d.accept()); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Archive').click()); await page.waitForFunction(() => !document.body.textContent.includes('React edited question'));
  await page.setCookie({ name: 'session_token', value: 'alice', url: base, httpOnly: true }); await page.reload(); await page.waitForSelector('form'); expect(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Create question'))).toBe(false);
  expect(await page.evaluate(async () => (await fetch('/api/admin/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: true }) })).status)).toBe(403);
});
test('React guided HR, legacy coding, mock tests and resume builder retain their session-bound behavior', async () => {
  await page.goto(base + '/hr-round'); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Start or restart round'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start or restart round').click()); await page.waitForSelector('textarea[name=text]'); await page.type('textarea[name=text]', 'A synthetic example with a clear outcome.'); await page.click('form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('AI score: 4'));
  await page.goto(base + '/coding-test'); await page.waitForSelector('select[name=language]'); await page.select('select[name=language]', 'Python'); await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]); await page.waitForSelector('textarea[name=code]'); await page.click('input[name=finish]'); await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]); await page.waitForFunction(() => document.body.textContent.includes('Saved AI review')); expect(await page.$eval('main', n => n.textContent)).toContain('Execution disabled');
  store.records.set('questions/aptitude/data/offline-q1', { question: 'Synthetic choice?', options: ['Yes', 'No'], answer: 'Yes' });
  await page.goto(base + '/api/mockTest'); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Start mock test')); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start mock test').click()); await page.waitForSelector('input[type=radio]'); await page.click('input[value=Yes]'); await page.click('form button[type=submit]'); await page.waitForFunction(() => document.body.textContent.includes('Saved score: 1/1'));
  await page.goto(base + '/resume-builder'); await page.waitForSelector('input[name=fullName]'); await page.type('input[name=fullName]', 'Synthetic Resume Person'); await page.click('form button[type=submit]'); await page.waitForSelector('a[href="/download-resume"]'); expect(await page.$eval('.report-html', n => n.textContent)).toContain('Synthetic Resume Person');
  await page.goto(base + '/careerguidance'); await page.waitForSelector('textarea[name=skills]'); await page.type('textarea[name=skills]', 'Node.js SQL'); await page.click('form button[type=submit]'); await page.waitForSelector('.report-html'); expect(await page.$('.report-html script')).toBeNull();
}, 30000);
test('React Firebase SDK uses mocked provider responses and exchanges the token into an HttpOnly cookie without localStorage', async () => {
  await page.deleteCookie(...await page.cookies());
  const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'alice', user_id: 'alice', iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'password', identities: {} } })}.offline`;
  store.verifyIdToken.mockImplementation(async t => { if (t !== token) throw new Error('Invalid offline provider token'); return { uid: 'alice', email: 'alice@example.test', admin: false }; });
  const providerCalls = []; await page.setRequestInterception(true); page.on('request', r => {
    const u = new URL(r.url()); if (u.origin === base) return r.continue();
    providerCalls.push(u.pathname);
    const body = u.pathname.includes('accounts:lookup') ? { users: [{ localId: 'alice', email: 'alice@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'password', email: 'alice@example.test' }] }] } : u.pathname.includes('signInWithPassword') ? { localId: 'alice', email: 'alice@example.test', idToken: token, refreshToken: 'offline-refresh-only', expiresIn: '3600', registered: true } : {};
    r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(body) });
  });
  await page.goto(base + '/login'); await page.waitForSelector('input[name=password]'); await page.type('input[name=email]', 'alice@example.test'); await page.type('input[name=password]', 'synthetic-password');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]); await page.waitForSelector('.session-feature');
  expect(providerCalls.some(p => p.includes('signInWithPassword'))).toBe(true); expect((await page.cookies()).find(c => c.name === 'session_token').httpOnly).toBe(true); expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
}, 20000);
test('React real PDF upload extracts text and matching comparison uses saved same-job records', async () => {
  const fs = require('node:fs'), file = `/tmp/prepto-react-upload-${require('node:crypto').randomUUID()}.pdf`;
  fs.writeFileSync(file, await require('./documentFixtures').pdf('Synthetic uploaded Node.js experience'));
  try {
    await page.goto(base + '/resumes'); await page.waitForSelector('input[name=title]'); await page.type('input[name=title]', 'PDF import'); await (await page.$('input[type=file]')).uploadFile(file); await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]); await page.waitForSelector('pre'); expect(await page.$eval('pre', n => n.textContent)).toContain('Synthetic uploaded Node.js experience');
    await page.evaluate(async () => {
      const post = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('Setup API failed'); return r.json(); };
      const source = await post('/api/resumes', { title: 'Comparison', text: 'Synthetic SQL experience' });
      const data = { resumeId: source.resume.id, resumeVersionId: source.version.id, jobTitle: 'Same synthetic job', jobDescription: 'Node.js SQL' };
      await post('/api/resume-matches', { ...data, requestId: 'match-one' }); await post('/api/resume-matches', { ...data, requestId: 'match-two' });
    });
    await page.goto(base + '/analyze'); await page.waitForSelector('input[type=file]'); await (await page.$('input[type=file]')).uploadFile(file); await page.type('textarea[name=jobDescription]', 'Synthetic Node.js role'); await page.click('form button[type=submit]'); await page.waitForSelector('.report-html'); expect(await page.$eval('.report-html', n => n.textContent)).toContain('Useful result'); expect(await page.$('.report-html script')).toBeNull();
    await page.goto(base + '/resume-matches'); await page.waitForSelector('input[type=checkbox]'); for (const input of await page.$$('input[type=checkbox]')) await input.click();
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Compare selected matches').click()); await page.waitForFunction(() => document.body.textContent.includes('+0 points'));
  } finally { fs.unlinkSync(file); }
}, 20000);
test('React guided dictation remains opt-in, writes transcript into the answer and preserves the stopped transcript', async () => {
  await page.evaluateOnNewDocument(() => { window.SpeechRecognition = class { start() { window.speechStarted = (window.speechStarted || 0) + 1; this.onresult({ results: [[{ transcript: 'Synthetic spoken answer' }]] }); } stop() { this.onend?.(); } abort() { window.speechStopped = true; } }; });
  await page.goto(base + '/hr-round'); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Start or restart round')); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start or restart round').click()); await page.waitForSelector('textarea[name=text]');
  expect(await page.evaluate(() => window.speechStarted || 0)).toBe(0);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Start voice input').click()); await page.waitForFunction(() => document.querySelector('textarea[name=text]').value === 'Synthetic spoken answer');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Stop voice input').click()); expect(await page.$eval('textarea[name=text]', n => n.value)).toBe('Synthetic spoken answer');
});
test('React legacy coding retains its per-question countdown and automatic submit without executing code', async () => {
  await page.goto(base + '/coding-test'); await page.waitForSelector('select[name=language]'); await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]); await page.waitForSelector('.coding-timer');
  expect(await page.$eval('.coding-timer', n => n.textContent)).toContain('automatically');
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 901000; });
  await page.waitForFunction(() => location.pathname === '/coding-test/question/2'); await page.waitForSelector('.code-editor');
  expect(await page.$eval('.screen-intro', n => n.textContent)).toContain('Code is never executed');
}, 15000);
