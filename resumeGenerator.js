const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
function chromiumPath(env) {
  if (env.CHROMIUM_EXECUTABLE_PATH) return env.CHROMIUM_EXECUTABLE_PATH;
  return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find((p) =>
    fs.existsSync(p),
  );
}
async function exportPdf(html, { launcher = puppeteer, env = process.env } = {}) {
  const executablePath = chromiumPath(env);
  if (!executablePath) throw new Error('Install Chromium or set CHROMIUM_EXECUTABLE_PATH');
  // Chromium crash reporting/configuration also needs writable storage on a read-only
  // container. Keep it private to this export instead of relying on the user's home.
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prepto-chromium-'));
  let browser;
  try {
    browser = await launcher.launch({
      executablePath,
      headless: true,
      userDataDir: path.join(temporary, 'profile'),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(temporary, 'config'),
        XDG_CACHE_HOME: path.join(temporary, 'cache'),
      },
      args: env.CHROMIUM_NO_SANDBOX === 'true' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    const page = await browser.newPage();
    // Resume HTML has no external dependencies; block network and file requests.
    await page.setRequestInterception(true);
    page.on('request', (request) => request.abort());
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    try {
      await browser?.close();
    } finally {
      await fs.promises.rm(temporary, { recursive: true, force: true });
    }
  }
}
module.exports = { exportPdf, chromiumPath };
