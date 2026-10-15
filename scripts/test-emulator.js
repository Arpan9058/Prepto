const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash, randomUUID } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const artifact = require('../config/firestore-emulator.json');
function isolatedEnv(input) {
  const env = { ...input };
  for (const name of Object.keys(env))
    if (
      /^(FIREBASE_|FIRESTORE_|GEMINI_|SESSION_SECRET$|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CLOUD_PROJECT$|GCLOUD_PROJECT$)/.test(
        name,
      )
    )
      delete env[name];
  return {
    ...env,
    CI: 'true',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089',
    GCLOUD_PROJECT: 'demo-prepto',
    no_grpc_proxy: '127.0.0.1,localhost',
  };
}
async function verifyArtifact(file, expected = artifact) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (size !== expected.size || hash.digest('hex') !== expected.sha256)
    throw new Error('Firestore emulator integrity check failed');
}
/** @param {ReadableStream<Uint8Array>} body */
async function* responseChunks(body) {
  const reader = body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
async function jar(cache = path.resolve('.cache/firebase-emulators'), fetcher = fetch) {
  await fs.promises.mkdir(cache, { recursive: true });
  const file = path.join(cache, `cloud-firestore-emulator-v${artifact.version}.jar`);
  if (fs.existsSync(file)) {
    await verifyArtifact(file);
    return file;
  }
  const temporary = file + '.' + randomUUID() + '.download';
  try {
    const response = await fetcher(artifact.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body)
      throw new Error('Unable to download official Firestore emulator');
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, next) {
        bytes += chunk.length;
        next(
          bytes > artifact.size ? new Error('Emulator download exceeds pinned size') : null,
          chunk,
        );
      },
    });
    await pipeline(
      Readable.from(responseChunks(response.body)),
      limit,
      fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
    );
    await verifyArtifact(temporary);
    await fs.promises.rename(temporary, file);
    return file;
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}
function exited(child) {
  return new Promise((resolve) => child.once('close', (code) => resolve(code ?? 1)));
}
async function stop(child, completion) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await completion;
  } finally {
    clearTimeout(timeout);
  }
}
async function run() {
  const file = await jar();
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(8089, '127.0.0.1', () => resolve(undefined));
  });
  await new Promise((resolve) => probe.close(resolve)); // Never reuse or clean another process's emulator.
  const env = isolatedEnv(process.env);
  const emulator = spawn(
    'java',
    [
      '-Duser.language=en',
      '-jar',
      file,
      '--host',
      '127.0.0.1',
      '--port',
      '8089',
      '--project_id',
      'demo-prepto',
      '--single_project_mode',
      'true',
      '--rules',
      path.resolve('firestore.rules'),
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const completion = exited(emulator);
  let startupError;
  emulator.once('error', () => {
    startupError = new Error('Unable to start Java 21 Firestore emulator');
  });
  emulator.stdout.on('data', (chunk) => process.stdout.write(chunk));
  emulator.stderr.on('data', (chunk) => process.stderr.write(chunk));
  let testChild, testExit;
  const interrupt = () => {
    testChild?.kill('SIGTERM');
    emulator.kill('SIGTERM');
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (startupError) throw startupError;
      if (emulator.exitCode !== null || emulator.signalCode)
        throw new Error('Firestore emulator exited before readiness');
      ready = await new Promise((resolve) => {
        const socket = net.connect(8089, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Firestore emulator startup timed out');
    testChild = spawn(process.execPath, ['--test', 'tests/emulator/firestore.test.js'], {
      env,
      stdio: 'inherit',
    });
    testExit = exited(testChild);
    testChild.once('error', () => {
      console.error('Unable to start emulator test process');
    });
    return await testExit;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (testChild && testExit) await stop(testChild, testExit);
    await stop(emulator, completion);
  }
}
if (require.main === module)
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { isolatedEnv, verifyArtifact, jar };
