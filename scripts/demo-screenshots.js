const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { chromiumPath } = require('../resumeGenerator');
const { createDemoApp } = require('../demo/app');
async function capture() {
  const { app } = await createDemoApp({ env: {} });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chromiumPath(process.env), headless: true, args: process.env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] });
    const page = await browser.newPage(), base = `http://127.0.0.1:${server.address().port}`, external = [];
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', r => { if (new URL(r.url()).origin !== base) { external.push(r.url()); r.abort(); } else r.continue(); });
    const directory = path.resolve(__dirname, '../docs/screenshots'); fs.mkdirSync(directory, { recursive: true });
    const settle = () => page.waitForFunction(() => { const n = document.getElementById('status'); return !n || !n.textContent.startsWith('Loading'); });
    const shot = async name => { await page.screenshot({ path: path.join(directory, name), fullPage: true }); console.log(`Captured synthetic demo: ${name}`); };
    await page.goto(base + '/demo'); await Promise.all([page.waitForNavigation(), page.click('form[action="/demo/start"] button')]);
    await shot('dashboard-desktop.png');
    await page.goto(base + '/coding-practice'); await settle();
    await page.select('#problem-filters [name=category]', 'graphs'); await page.select('#problem-filters [name=topic]', 'Topological sort'); await page.click('#problem-filters button'); await settle();
    await page.click('#problems button'); await page.waitForFunction(() => document.getElementById('code-editor').value.includes('workshopOrder'));
    await shot('coding-desktop.png');
    await page.goto(base + '/resumes'); await settle(); await page.waitForSelector('#resumes a'); await Promise.all([page.waitForNavigation(), page.click('#resumes a')]); await settle();
    await shot('resume-versions.png');
    await page.goto(base + '/progress'); await settle(); await shot('progress-desktop.png');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await page.goto(base + '/dashboard'); await shot('dashboard-mobile.png');
    if (external.length) throw new Error('Screenshot journey attempted external requests');
  } finally { await browser?.close(); await new Promise(r => { server.close(r); server.closeAllConnections(); }); }
}
if (require.main === module) capture().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { capture };
