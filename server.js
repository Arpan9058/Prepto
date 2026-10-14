// npm start activates Node's native fetch proxy before any application imports.
require('dotenv').config({ quiet: true });
const { createApp } = require('./app');
function start(env = process.env) {
  const app = createApp({ env });
  const server = app.listen(Number(env.PORT || 8080), env.HOST || '0.0.0.0', () => app.locals.logger.info({ port: server.address().port }, 'Prepto started'));
  server.on('error', err => { app.locals.logger.error({ code: err.code }, 'Server startup failed'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
  return server;
}
if (require.main === module) start();
module.exports = { start };
