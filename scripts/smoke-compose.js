// Exercise the actual Compose service using only this run's generated local config.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
async function smoke() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'prepto-compose-'));
  const project = 'prepto-check-' + randomUUID();
  const config = path.join(temporary, 'compose.yaml');
  const environment = path.join(temporary, 'synthetic.env');
  const args = ['compose', '--env-file', environment, '--project-name', project, '--file', config];
  function run(command, capture = false) {
    const result = spawnSync('docker', [...args, ...command], {
      encoding: 'utf8',
      stdio: capture ? 'pipe' : 'inherit',
      timeout: 120000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Compose ${command[0]} failed (${result.status})`);
    return result.stdout?.trim();
  }
  try {
    await fs.writeFile(environment, 'SESSION_SECRET=' + randomBytes(48).toString('hex') + '\n', {
      mode: 0o600,
    });
    const source = await fs.readFile(path.resolve(__dirname, '../compose.yaml'), 'utf8');
    // Preserve the real service/security/health settings. Override only build/image,
    // generated env-file path and host port so concurrent runs cannot collide.
    const configText = source
      .replace(
        'build: .',
        `build: ${JSON.stringify(path.resolve(__dirname, '..'))}\n    image: prepto:smoke`,
      )
      .replace('env_file: .env', `env_file: ${JSON.stringify(environment)}`)
      .replace('127.0.0.1:8080:8080', '127.0.0.1::8080');
    assert.notEqual(configText, source);
    await fs.writeFile(config, configText, { mode: 0o600 });
    run(['config', '--quiet']); // Never print resolved environment values.
    run(['up', '--detach', '--no-build', '--wait', '--wait-timeout', '60']);
    const address = run(['port', 'app', '8080'], true);
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    const base = `http://${address}`;
    const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal(
      (await fetch(base + '/api/session', { signal: AbortSignal.timeout(5000) })).status,
      401,
    );
    const privatePage = await fetch(base + '/dashboard', {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(privatePage.status, 302);
    assert.equal(privatePage.headers.get('location'), '/login');
    assert.equal((await fetch(base, { signal: AbortSignal.timeout(5000) })).status, 200);
    console.log(
      'PASS Compose healthy startup, published loopback HTTP, public page and auth boundaries; generated local bindings only',
    );
  } finally {
    try {
      run(['down', '--remove-orphans', '--timeout', '5']);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
}
smoke().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
