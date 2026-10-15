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
  await page.goto(base); await page.waitForSelector('.landing-hero'); expect(await page.$eval('h1', n => n.textContent)).toContain('Better answers');
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
  expect(store.records.get('users/alice').admin).toBeUndefined();
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
  expect(await page.$('#coding-review img')).toBeNull(); expect(await page.$eval('main', n => n.textContent)).toContain('No executable tests were run');
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
    expect(await page.evaluate(async () => (await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)).toBe(400);
  } finally { clearTimeout(timer); try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ } await closed; }
}, 35000);
