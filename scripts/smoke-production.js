// Runs the built production frontend, isolated demo APIs and real Chromium PDF.
// No live Firebase/Gemini bindings or user data are used.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createApp } = require('../app');
const { createDemoApp } = require('../demo/app');
const { exportPdf } = require('../resumeGenerator');
const pino = require('pino');
async function smoke() {
  const publicApp = createApp({
    env: { NODE_ENV: 'production', SESSION_SECRET: randomBytes(48).toString('hex') },
    logger: pino({ level: 'silent' }),
  });
  const demo = await createDemoApp({
    env: {
      CHROMIUM_EXECUTABLE_PATH: process.env.CHROMIUM_EXECUTABLE_PATH,
      CHROMIUM_NO_SANDBOX: process.env.CHROMIUM_NO_SANDBOX,
    },
  });
  const servers = [publicApp.listen(0, '127.0.0.1'), demo.app.listen(0, '127.0.0.1')];
  try {
    await Promise.all(servers.map((s) => new Promise((r) => s.once('listening', r))));
    const base = `http://127.0.0.1:${servers[0].address().port}`,
      isolated = `http://127.0.0.1:${servers[1].address().port}`;
    assert.equal((await fetch(base + '/health')).status, 200);
    const html = await (await fetch(base)).text();
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)[1];
    const js = await fetch(base + asset);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.match(js.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(base + '/assets/does-not-exist.js')).status, 404);
    for (const route of ['/dashboard', '/interviews/private', '/resumes/private', '/progress']) {
      const r = await fetch(base + route, { redirect: 'manual' });
      assert.equal(r.status, 302);
      assert.equal(r.headers.get('location'), '/login');
    }
    assert.equal((await fetch(base + '/api/session')).status, 401);
    assert.equal((await fetch(base + '/api/resumes/private')).status, 401);
    const login = await fetch(isolated + '/demo/start', { method: 'POST', redirect: 'manual' });
    assert.equal(login.status, 302);
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    for (const route of [
      '/dashboard',
      '/question-bank',
      '/interviews',
      '/resumes',
      '/resume-matches',
      '/coding-practice',
      '/progress',
      '/reports',
    ]) {
      const r = await fetch(isolated + route, { headers: { cookie } });
      assert.equal(r.status, 200);
      assert.match(await r.text(), /id="root"/);
      assert.match(r.headers.get('cache-control'), /no-store/);
    }
    assert.equal((await fetch(base + '/api/session', { headers: { cookie } })).status, 401);
    const rows = await (await fetch(isolated + '/api/resumes', { headers: { cookie } })).json();
    assert.ok(rows.items.length);
    const id = rows.items[0].id;
    const detail = await (
      await fetch(isolated + `/api/resumes/${id}`, { headers: { cookie } })
    ).json();
    const version = detail.currentVersionId;
    // Run the renderer directly before HTTP export so launch failures remain diagnosable.
    const real = await exportPdf(
      '<!doctype html><html><body><h1>Synthetic production PDF smoke</h1></body></html>',
    );
    assert.equal(real.subarray(0, 4).toString(), '%PDF');
    assert.ok(real.length > 1000);
    const pdf = await fetch(isolated + `/api/resumes/${id}/versions/${version}/pdf`, {
      headers: { cookie },
    });
    assert.equal(pdf.status, 200, 'Private resume PDF HTTP export failed');
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.ok((await pdf.arrayBuffer()).byteLength > 100);
    console.log(
      'PASS production HTTP/static/deep-link/auth/demo-isolation/download checks and real Chromium PDF export',
    );
  } finally {
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
  smoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { smoke };
