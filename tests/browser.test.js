const puppeteer = require('puppeteer-core');
const pino = require('pino');
const { createApp } = require('../app');
const { chromiumPath } = require('../resumeGenerator');
const { createFirebaseDouble, createGeminiDouble } = require('./doubles');
const { seed } = require('../scripts/seed-question-bank');
let browser, server, page, base, store, gemini;
beforeAll(async () => { browser = await puppeteer.launch({ executablePath: chromiumPath(process.env), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); });
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  store = createFirebaseDouble(); await seed(store.db);
  gemini = createGeminiDouble();
  const app = createApp({ env: { SESSION_SECRET: 'offline-browser-tests-session-secret' }, firebase: store.firebase, gemini, logger: pino({ level: 'silent' }) });
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
  await page.click('#questions .row button:nth-of-type(2)'); await page.waitForFunction(() => document.getElementById('editor').open);
  await page.$eval('#question-form [name=title]', node => { node.value = 'Browser edited question'; });
  await page.click('#question-form [type=submit]'); await page.waitForFunction(() => !document.getElementById('editor').open); await settled();
  expect(await page.$eval('#questions h2', n => n.textContent)).toBe('Browser edited question');
  page.on('dialog', dialog => dialog.accept()); await page.click('#questions .danger'); await page.waitForFunction(() => !document.querySelector('#questions article'));
  await page.click('#archived'); await settled(); expect(await page.$eval('#questions h2', n => n.textContent)).toBe('Browser edited question');
}, 20000);
test('browser interview start, pause/resume, reload, completion and private review work', async () => {
  await page.goto(base + '/interviews?question=sample-13'); await settled();
  expect(await page.$eval('#question-picker input[value="sample-13"]', n => n.checked)).toBe(true);
  await Promise.all([page.waitForNavigation(), page.click('#start-interview [type=submit]')]); await settled();
  const sessionUrl = page.url();
  await page.click('#pause'); await page.waitForFunction(() => document.getElementById('session-meta').textContent.startsWith('paused'));
  await page.reload(); await settled(); expect(await page.$eval('#status', n => n.textContent)).toContain('paused');
  await page.click('#resume'); await page.waitForFunction(() => document.getElementById('session-meta').textContent.startsWith('active'));
  await page.select('#choice-answer select', 'GET'); await page.click('#answer-form [type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('#answers article').length === 1);
  expect(await page.$eval('#answers', n => n.textContent)).toContain('Score 100%');
  await page.click('#complete'); await page.waitForFunction(() => document.getElementById('session-meta').textContent.startsWith('completed'));
  await page.reload(); await settled(); await page.click('#answers details summary');
  expect(await page.$eval('#answers', n => n.textContent)).toContain('Correct option: GET');
  await page.setCookie({ name: 'session_token', value: 'bob', url: base, httpOnly: true }); await page.goto(sessionUrl); await settled();
  expect(await page.$eval('#status', n => n.textContent)).toContain('Interview not found');
  expect(await page.$$eval('#answers article', n => n.length)).toBe(0);
}, 20000);
test('open-ended browser feedback is saved after reload', async () => {
  await page.goto(base + '/interviews?question=sample-01'); await settled();
  await Promise.all([page.waitForNavigation(), page.click('#start-interview [type=submit]')]); await settled();
  await page.type('#text-answer textarea', 'An event loop processes asynchronous callbacks.'); await page.click('#answer-form [type=submit]');
  await page.waitForFunction(() => document.querySelectorAll('#answers article').length === 1);
  await page.reload(); await settled(); expect(await page.$eval('#answers', n => n.textContent)).toContain('Good explanation with a clear example.');
  expect(await page.$eval('#answers', n => n.textContent)).toContain('An event loop');
}, 20000);

test('browser can refresh and retry the same answer after provider failure', async () => {
  gemini.generate.mockRejectedValueOnce(new Error('provider unavailable'));
  await page.goto(base + '/interviews?question=sample-01'); await settled();
  await Promise.all([page.waitForNavigation(), page.click('#start-interview [type=submit]')]); await settled();
  await page.type('#text-answer textarea', 'My saved answer attempt'); await page.click('#answer-form [type=submit]');
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
  await page.click('#refresh'); await settled();
  expect(await page.$eval('#text-answer textarea', node => node.value)).toBe('My saved answer attempt');
  await page.click('#answer-form [type=submit]'); await page.waitForFunction(() => document.querySelectorAll('#answers article').length === 1);
  expect(await page.$eval('#answers', node => node.textContent)).toContain('My saved answer attempt');
}, 20000);
function seedBrowserProgress() {
  for (const sample of require('../fixtures/progress-history.json')) store.records.set(`users/alice/progress/${sample.type}/attempts/${sample.id}`, { ...sample.raw, title: sample.title, submittedAt: new Date(Date.now() - sample.daysAgo * 86400000) });
}
test('progress browser shows trends, comparisons, history and persisted editable study goals', async () => {
  seedBrowserProgress(); await page.goto(base + '/progress'); await settled();
  expect(await page.$$eval('#history tr', n => n.length)).toBe(3);
  expect(await page.$eval('#skills', n => n.textContent)).toContain('Node.js');
  expect(await page.$eval('#comparisons', n => n.textContent)).toContain('+15 points');
  expect(await page.$eval('#skills [role=img]', n => n.getAttribute('aria-label'))).toContain('score history');
  await page.type('#goal-form [name=skill]', 'Node.js'); await page.$eval('#goal-form [name=targetScore]', n => { n.value = '90'; });
  await page.click('#goal-form [type=submit]'); await page.waitForFunction(() => !!document.querySelector('#goals [data-goal-id]')); await settled();
  expect(await page.$eval('#goals', n => n.textContent)).toContain('10 points to your target');
  await page.reload(); await settled(); expect(await page.$eval('#goals', n => n.textContent)).toContain('Node.js');
  await page.click('#goals button'); await page.$eval('#goal-form [name=targetScore]', n => { n.value = '75'; }); await page.click('#goal-form [type=submit]');
  await page.waitForFunction(() => document.getElementById('goals').textContent.includes('Goal met'));
  await page.select('#history-type', 'HRInterview'); await page.waitForFunction(() => document.getElementById('history').children.length === 0); expect(await page.$eval('#history-empty', n => n.hidden)).toBe(false);
  await page.setViewport({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}, 20000);
test('progress browser renders loading, empty, recoverable errors and safe user text', async () => {
  await page.setRequestInterception(true);
  let held, signal; const intercepted = new Promise(resolve => { signal = resolve; });
  const intercept = req => { if (req.url().includes('/api/progress/overview')) { held = req; signal(); } else req.continue(); };
  page.on('request', intercept);
  await page.goto(base + '/progress'); await intercepted;
  expect(await page.$eval('#status', n => n.textContent)).toContain('Loading progress');
  expect(await page.$eval('#refresh-progress', n => n.disabled)).toBe(true);
  await held.respond({ status: 500, contentType: 'application/json', body: '{"error":"Progress temporarily unavailable"}' });
  await settled(); expect(await page.$eval('#status', n => n.textContent)).toContain('Progress temporarily unavailable');
  page.off('request', intercept); page.on('request', req => req.continue());
  await page.click('#refresh-progress'); await settled(); expect(await page.$eval('#status', n => n.textContent)).toContain('Your progress starts');
  await page.type('#goal-form [name=skill]', '<img src=x onerror=alert(1)>'); await page.click('#goal-form [type=submit]');
  await page.waitForFunction(() => !!document.querySelector('#goals [data-goal-id]'));
  expect(await page.$('#goals img')).toBeNull(); expect(await page.$eval('#goals', n => n.textContent)).toContain('<img');
});
test('resume browser preserves versions, changes the current pointer and keeps other users out', async () => {
  await page.goto(base + '/resumes'); await settled();
  expect(await page.$eval('#status', n => n.textContent)).toContain('No saved resumes');
  await page.type('#create-resume [name=title]', 'Backend engineer'); await page.type('#create-resume [name=text]', 'Original Node.js experience');
  await Promise.all([page.waitForNavigation(), page.click('#create-resume [type=submit]')]); await settled();
  const resumeUrl = page.url(); expect(await page.$eval('#resume-preview', n => n.textContent)).toBe('Original Node.js experience');
  await page.$eval('#new-version [name=text]', n => { n.value = 'Improved Node.js and SQL experience'; }); await page.type('#new-version [name=label]', 'SQL role');
  await page.click('#new-version [type=submit]'); await page.waitForFunction(() => document.getElementById('selected-label').textContent.startsWith('Version 2'));
  await page.reload(); await settled(); expect(await page.$$eval('#versions article', n => n.length)).toBe(2);
  await page.click('#versions article:nth-child(2) button'); await page.waitForFunction(() => document.getElementById('selected-label').textContent.startsWith('Version 1'));
  expect(await page.$eval('#resume-preview', n => n.textContent)).toBe('Original Node.js experience');
  await page.click('#make-current'); await page.waitForFunction(() => document.getElementById('make-current').hidden); await page.reload(); await settled();
  expect(await page.$eval('#selected-label', n => n.textContent)).toContain('Version 1');
  await page.setViewport({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setCookie({ name: 'session_token', value: 'bob', url: base, httpOnly: true }); await page.goto(resumeUrl); await settled();
  expect(await page.$eval('#status', n => n.textContent)).toContain('Resume not found'); expect(await page.$eval('#resume-preview', n => n.textContent)).toBe('');
}, 20000);
test('resume browser shows validation errors and safely renders uploaded/typed content', async () => {
  await page.goto(base + '/resumes'); await settled(); await page.type('#create-resume [name=title]', 'My resume');
  await page.click('#create-resume [type=submit]'); await page.waitForFunction(() => document.getElementById('status').classList.contains('error'));
  await page.type('#create-resume [name=text]', '<img src=x onerror=alert(1)> Safe text');
  await Promise.all([page.waitForNavigation(), page.click('#create-resume [type=submit]')]); await settled();
  expect(await page.$('#resume-preview img')).toBeNull(); expect(await page.$eval('#resume-preview', n => n.textContent)).toContain('<img');
});
