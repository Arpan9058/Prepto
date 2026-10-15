const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isolatedEnv, verifyArtifact, jar } = require('../scripts/test-emulator');
test('emulator subprocess strips live bindings and pins a loopback demo project', () => {
  const env = isolatedEnv({ GEMINI_API_KEY: 'synthetic', FIREBASE_SERVICE_ACCOUNT_JSON: 'synthetic', GOOGLE_APPLICATION_CREDENTIALS: 'synthetic', FIRESTORE_EMULATOR_HOST: 'remote:123', PATH: '/bin' });
  expect(env.GEMINI_API_KEY).toBeUndefined(); expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined(); expect(env.FIREBASE_SERVICE_ACCOUNT_JSON).toBeUndefined();
  expect(env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8089'); expect(env.GCLOUD_PROJECT).toBe('demo-prepto'); expect(env.PATH).toBe('/bin');
});
test('emulator verification rejects tampered and truncated cached artifacts before executing them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepto-integrity-')); const file = path.join(root, 'artifact');
  const bytes = Buffer.from('synthetic emulator fixture'); const expected = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  try { await fs.writeFile(file, bytes); await expect(verifyArtifact(file, expected)).resolves.toBeUndefined(); await fs.writeFile(file, Buffer.from('tampered')); await expect(verifyArtifact(file, expected)).rejects.toThrow('integrity'); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('failed official download never publishes an executable cache entry and removes temporary files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepto-download-'));
  try { await expect(jar(root, async () => new Response('not a jar'))).rejects.toThrow('integrity'); expect(await fs.readdir(root)).toEqual([]); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
});
