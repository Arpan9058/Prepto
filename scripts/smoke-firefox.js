// Optional Firefox smoke against built React assets and isolated synthetic providers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createDemoApp } = require('../demo/app');
async function smoke() {
  const fixture = await createDemoApp({ env: {} });
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + require('../utils/boundPort').boundPort(server);
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prepto-firefox-'));
  let browser;
  try {
    browser = await puppeteer.launch({
      browser: 'firefox',
      executablePath: process.env.FIREFOX_EXECUTABLE_PATH || '/usr/bin/firefox-esr',
      headless: true,
      env: {
        ...process.env,
        MOZ_DISABLE_CONTENT_SANDBOX: '1',
        XDG_CONFIG_HOME: path.join(temporary, 'config'),
        XDG_CACHE_HOME: path.join(temporary, 'cache'),
      },
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 800 });
    async function login(p) {
      await p.goto(base + '/demo');
      await p.waitForSelector('form[action="/demo/start"]');
      await Promise.all([p.waitForNavigation(), p.click('form[action="/demo/start"] button')]);
      await p.waitForSelector('.session-feature');
    }
    await login(page);
    assert.match(await page.$eval('.demo-notice', (n) => n.textContent), /OFFLINE DEMO/);
    await page.click('[aria-label="Open navigation"]');
    await page.waitForFunction(() => document.activeElement.getAttribute('href') === '/dashboard');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.activeElement.getAttribute('aria-label') === 'Open navigation',
    );
    const screens = [
      ['/dashboard', '.session-feature'],
      ['/question-bank', '.cards-grid article'],
      ['/interviews', 'a[href^="/interviews/"]'],
      ['/resumes', 'a[href^="/resumes/"]'],
      ['/resume-matches', '.cards-grid article'],
      ['/coding-practice', '.cards-grid button'],
      ['/progress', '.trend-chart'],
      ['/reports', 'a[href^="/reports/view/"]'],
    ];
    for (const [route, ready] of screens) {
      console.log('Checking ' + route);
      await page.goto(base + route);
      await page.waitForSelector(ready);
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'Overflow: ' + route,
      );
      await page.reload();
      await page.waitForSelector(ready);
    }
    await page.goto(base + '/resumes');
    await page.waitForSelector('a[href^="/resumes/"]');
    await Promise.all([page.waitForNavigation(), page.click('a[href^="/resumes/"]')]);
    await page.waitForSelector('a[href$="/pdf"]');
    const ownerId = await page.evaluate(async () => {
      const r = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Unique Firefox ownership fixture',
          text: 'Synthetic candidate with JavaScript experience',
          requestId: crypto.randomUUID(),
        }),
      });
      if (r.status !== 201) throw new Error('Resume create: ' + r.status);
      return (await r.json()).resume.id;
    });
    console.log('Created private resume');
    const other = await browser.createBrowserContext();
    const otherPage = await other.newPage();
    await login(otherPage);
    const denied = await otherPage.evaluate(
      async (id) => (await fetch('/api/resumes/' + id)).status,
      ownerId,
    );
    assert.equal(denied, 404);
    await other.close();
    console.log('Ownership passed');
    await page.goto(base + '/coding-practice');
    await page.waitForSelector('.cards-grid button');
    await page.click('.cards-grid button');
    await page.waitForSelector('.code-editor');
    await page.waitForSelector('.code-editor:not([disabled])');
    console.log('Editor ready');
    const beforeRevision = await page.$eval('main', (n) =>
      Number(n.textContent.match(/Saved draft revision (\d+)/)[1]),
    );
    await page.type('.code-editor', '\n// Synthetic Firefox draft');
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save draft').click(),
    );
    await page.waitForFunction(
      (revision) => document.body.textContent.includes('Saved draft revision ' + revision),
      {},
      beforeRevision + 1,
    );
    assert.match(await page.$eval('main', (n) => n.textContent), /execution is disabled/i);
    console.log(
      'PASS ' +
        (await browser.version()) +
        ': eight populated mobile/deep-link pages, keyboard focus/Escape, private resume denial and saved coding draft; synthetic providers only',
    );
  } finally {
    await browser?.close();
    await fs.promises.rm(temporary, { recursive: true, force: true });
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
  }
}
smoke().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
