const fs = require('node:fs');
const puppeteer = require('puppeteer-core');
function chromiumPath(env) {
  if (env.CHROMIUM_EXECUTABLE_PATH) return env.CHROMIUM_EXECUTABLE_PATH;
  return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
}
async function exportPdf(html, { launcher = puppeteer, env = process.env } = {}) {
  const executablePath = chromiumPath(env);
  if (!executablePath) throw new Error('Install Chromium or set CHROMIUM_EXECUTABLE_PATH');
  const browser = await launcher.launch({ executablePath, headless: true,
    args: env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    // Resume HTML has no external dependencies; block network and file requests.
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally { await browser.close(); }
}
module.exports = { exportPdf, chromiumPath };
