const { boundPort } = require('../utils/boundPort');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const puppeteer = require('puppeteer-core');
const pino = require('pino');
const { createDemoApp } = require('../demo/app');
const { createApp } = require('../app');
const { chromiumPath } = require('../resumeGenerator');
async function capture() {
  const demo = await createDemoApp({ env: {} });
  const publicApp = createApp({
    env: { SESSION_SECRET: randomBytes(48).toString('hex') },
    firebase: {
      auth: () => {
        throw new Error('No live auth in screenshot capture');
      },
      firestore: () => {
        throw new Error('No live database in screenshot capture');
      },
    },
    gemini: {
      model: 'offline-screenshot-no-provider',
      generate: () => {
        throw new Error('No live AI in screenshot capture');
      },
    },
    logger: pino({ level: 'silent' }),
  });
  const servers = [publicApp.listen(0, '127.0.0.1'), demo.app.listen(0, '127.0.0.1')];
  await Promise.all(servers.map((s) => new Promise((r) => s.once('listening', r))));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromiumPath(process.env),
      headless: true,
      args:
        process.env.CHROMIUM_NO_SANDBOX === 'true'
          ? ['--no-sandbox', '--disable-setuid-sandbox']
          : [],
    });
    const page = await browser.newPage(),
      directory = path.join(__dirname, '../docs/design');
    fs.mkdirSync(directory, { recursive: true });
    const base = `http://127.0.0.1:${boundPort(servers[1])}`;
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`http://127.0.0.1:${boundPort(servers[0])}`);
    await page.waitForSelector('.landing-hero');
    await page.screenshot({ path: path.join(directory, 'react-landing.png'), fullPage: true });
    await page.goto(base + '/demo');
    await page.waitForSelector('form[action="/demo/start"]');
    await Promise.all([page.waitForNavigation(), page.click('form[action="/demo/start"] button')]);
    await page.waitForSelector('.session-feature');
    await page.screenshot({ path: path.join(directory, 'react-dashboard.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.click('[aria-label="Open navigation"]');
    await page.screenshot({
      path: path.join(directory, 'react-mobile-navigation.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    for (const [route, selector, name] of [
      ['/coding-practice', '.cards-grid button', 'coding'],
      ['/resumes', '.cards-grid a', 'resumes'],
      ['/progress', 'input[name=skill]', 'progress'],
    ]) {
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(base + route);
      await page.waitForSelector(selector);
      await page.screenshot({ path: path.join(directory, `react-${name}.png`), fullPage: true });
    }
    console.log('Captured 6 real React browser screenshots; all signed-in data is synthetic.');
  } finally {
    await browser?.close();
    await Promise.all(
      servers.map(
        (s) =>
          new Promise((r) => {
            s.close(r);
            s.closeAllConnections();
          }),
      ),
    );
  }
}
if (require.main === module)
  capture().catch(() => {
    console.error('React screenshot capture failed');
    process.exitCode = 1;
  });
module.exports = { capture };
