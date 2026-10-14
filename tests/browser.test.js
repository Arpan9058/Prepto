const puppeteer = require('puppeteer-core');
const pino = require('pino');
const { createApp } = require('../app');
const { chromiumPath } = require('../resumeGenerator');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { seed } = require('../scripts/seed-question-bank');
let browser, server, page, base, store;
beforeAll(async () => { browser = await puppeteer.launch({ executablePath: chromiumPath(process.env), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  store = createFirebaseDouble(); await seed(store.db);
  const app = createApp({ env: { SESSION_SECRET: 'offline-browser-tests-session-secret' }, firebase: store.firebase, gemini: createGeminiDouble(), logger: pino({ level: 'silent' }) });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  page = await browser.newPage(); await page.setCookie({ name: 'session_token', value: 'alice', url: base, httpOnly: true });
});
afterEach(async () => { await page?.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
async function settled() { await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('Loading')); }
test('learner browser searches, paginates, bookmarks and survives reload', async () => {
  await page.goto(base + '/question-bank'); await settled();
  expect(await page.$$eval('#questions article', nodes => nodes.length)).toBe(6);
  await page.click('#next'); await page.waitForFunction(() => document.getElementById('page-label').textContent.startsWith('Page 2')); await settled();
  await page.click('#previous'); await page.waitForFunction(() => document.getElementById('page-label').textContent.startsWith('Page 1')); await settled();
  await page.type('#search', 'node'); await page.select('#category', 'technical'); await page.click('#filters [type=submit]'); await settled();
  expect(await page.$$eval('#questions h2', n => n.map(x => x.textContent))).toEqual(expect.arrayContaining(['Node event loop', 'Async error handling']));
  await page.click('#questions button'); await page.waitForFunction(() => document.querySelector('#questions button').textContent === 'Unsave question');
  await page.reload(); await settled(); await page.click('#bookmarks'); await settled();
  expect(await page.$$eval('#questions article', n => n.length)).toBe(1);
  expect(await page.$('#new-question')).toBeNull();
  await page.setViewport({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('question bank browser displays loading, empty and recoverable error states', async () => {
  await page.setRequestInterception(true);
  const intercept = req => { if (req.url().includes('/api/questions')) req.respond({ status: 500, contentType: 'application/json', body: '{"error":"Service unavailable"}' }); else req.continue(); };
  page.on('request', intercept);
  await page.goto(base + '/question-bank'); await settled(); expect(await page.$eval('#status', n => n.textContent)).toContain('Service unavailable');
  page.off('request', intercept); page.on('request', req => req.continue());
  await page.click('#filters [type=submit]'); await settled(); expect(await page.$$eval('#questions article', n => n.length)).toBe(6);
  await page.type('#search', 'unmatched'); await page.click('#filters [type=submit]'); await settled(); expect(await page.$eval('#status', n => n.textContent)).toContain('No questions found');
});
test('admin browser creates, edits and archives with accessible controls', async () => {
  await page.setCookie({ name: 'session_token', value: 'admin', url: base, httpOnly: true });
  await page.goto(base + '/question-bank'); await settled(); await page.click('#new-question');
  const values = { title: 'Browser created question', prompt: 'How do you handle a production incident?', skills: 'Communication', explanation: 'Explain impact, mitigation and follow-up.' };
  for (const [name, value] of Object.entries(values)) await page.type(`#question-form [name=${name}]`, value);
  await page.click('#question-form [type=submit]'); await page.waitForFunction(() => !document.getElementById('editor').open); await settled();
  await page.type('#search', 'browser'); await page.click('#filters [type=submit]'); await settled(); expect(await page.$$eval('#questions article', n => n.length)).toBe(1);
  await page.click('#questions button:nth-child(2)'); await page.waitForFunction(() => document.getElementById('editor').open);
  await page.$eval('#question-form [name=title]', node => { node.value = 'Browser edited question'; });
  await page.click('#question-form [type=submit]'); await page.waitForFunction(() => !document.getElementById('editor').open); await settled();
  expect(await page.$eval('#questions h2', n => n.textContent)).toBe('Browser edited question');
  page.on('dialog', dialog => dialog.accept()); await page.click('#questions .danger'); await page.waitForFunction(() => !document.querySelector('#questions article'));
  await page.click('#archived'); await settled(); expect(await page.$eval('#questions h2', n => n.textContent)).toBe('Browser edited question');
}, 20000);
