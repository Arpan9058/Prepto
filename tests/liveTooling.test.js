const { verify, passwordLogin, cleanupCreated } = require('../scripts/verify-live');
test('live validation requires deliberate opt-in and rejects incomplete/emulator bindings before SDK calls', async () => {
  expect((await verify()).checks[0]).toMatchObject({ status: 'unrun' });
  expect((await verify({ enabled: true, env: {} })).checks[0]).toMatchObject({ status: 'unrun' });
  expect((await verify({ enabled: true, env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085' } })).checks[0].reason).toContain('emulator');
});
test('cleanup attempts every registered resource after failures without touching anything else', async () => {
  const calls = []; const result = await cleanupCreated([async () => calls.push('created-user'), async () => { calls.push('created-data'); throw new Error('private'); }, async () => calls.push('created-question')]);
  expect(result).toBe(false); expect(calls).toEqual(['created-question', 'created-data', 'created-user']);
});
test('password login transport returns only a token and masks provider errors', async () => {
  const transport = jest.fn(async () => ({ ok: true, json: async () => ({ idToken: 'synthetic-token' }) }));
  await expect(passwordLogin('public-test-key', 'synthetic@example.test', 'synthetic-password', transport)).resolves.toBe('synthetic-token');
  expect(JSON.parse(transport.mock.calls[0][1].body).returnSecureToken).toBe(true);
  await expect(passwordLogin('public', 'synthetic', 'synthetic', async () => ({ ok: false, text: () => 'private-provider-detail' }))).rejects.toThrow('Isolated Firebase password sign-in failed');
});
