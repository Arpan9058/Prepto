const { boundPort } = require('../utils/boundPort');
const { createDemoApp, loopback } = require('../demo/app');
async function start(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  if (!loopback(host) || host === '::ffff:127.0.0.1' || host === '[::1]')
    throw new Error('Offline demo HOST must be 127.0.0.1, localhost or ::1');
  const { app } = await createDemoApp({ env });
  const server = app.listen(Number(env.PORT || 8080), host);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(
    `Prepto OFFLINE DEMO listening on loopback port ${boundPort(server)}; synthetic data only. Stop with Ctrl+C; restart resets data.`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      server.close(() => process.exit(0));
      server.closeAllConnections();
    });
  return server;
}
if (require.main === module)
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { start };
