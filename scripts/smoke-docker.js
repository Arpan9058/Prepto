const { spawnSync } = require('node:child_process');
const dns = require('node:dns').promises;
const { randomBytes, randomUUID } = require('node:crypto');
function run(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed (${result.status})`);
}
async function smoke() {
  const build = ['build', '-t', 'prepto:smoke'];
  // Optional build-only networking/trust; no credential values or global settings.
  if (process.env.PREPTO_DOCKER_BUILD_NETWORK)
    build.push('--network', process.env.PREPTO_DOCKER_BUILD_NETWORK);
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'])
    if (process.env[name]) build.push('--build-arg', name);
  if (process.env.NODE_EXTRA_CA_CERTS)
    build.push('--secret', `id=build_ca,src=${process.env.NODE_EXTRA_CA_CERTS}`);
  if (process.env.PREPTO_DOCKER_RESOLVE_PROXY === '1') {
    for (const host of new Set(
      ['HTTPS_PROXY', 'HTTP_PROXY']
        .filter((n) => process.env[n])
        .map((n) => new URL(process.env[n]).hostname),
    )) {
      const { address } = await dns.lookup(host);
      build.push('--add-host', `${host}:${address}`);
    }
  }
  run([...build, '.']);
  const name = 'prepto-smoke-' + randomUUID();
  try {
    run([
      'run',
      '-d',
      '--name',
      name,
      '--network=none',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=512m',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '-e',
      'SESSION_SECRET=' + randomBytes(48).toString('hex'),
      'prepto:smoke',
    ]);
    run([
      'exec',
      name,
      'node',
      '-e',
      `
      (async () => {
        for(let attempt=0;attempt<40;attempt++) {
          try {
            const base='http://127.0.0.1:8080';
            const health=await fetch(base+'/health'); if(!health.ok)throw Error('health');
            if(!(await (await fetch(base)).text()).includes('id="root"'))throw Error('React HTML');
            if((await fetch(base+'/api/session')).status!==401)throw Error('API boundary');
            if((await fetch(base+'/dashboard',{redirect:'manual'})).status!==302)throw Error('deep-link boundary');
            console.log('PASS Docker default npm start, production landing/health/API/auth guards');return;
          } catch { await new Promise(r=>setTimeout(r,250)); }
        }
        process.exitCode=1;
      })();
    `,
    ]);
  } catch (error) {
    spawnSync('docker', ['logs', name], { stdio: 'inherit', env: process.env });
    throw error;
  } finally {
    run(['rm', '-f', name]);
  }
  run([
    'run',
    '--rm',
    '--network=none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=512m',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    'prepto:smoke',
    'node',
    'scripts/smoke-production.js',
  ]);
}
if (require.main === module)
  smoke().catch((error) => {
    console.error(error.message);
    console.error('Docker smoke failed; see build/runtime diagnostics above');
    process.exitCode = 1;
  });
module.exports = { smoke };
