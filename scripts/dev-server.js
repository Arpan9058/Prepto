const { boundPort } = require('../utils/boundPort');
const http = require('node:http');
const path = require('node:path');
async function start({ demo = false, env = process.env } = {}) {
  const server = http.createServer();
  const vite = await (
    await import('vite')
  ).createServer({
    configFile: path.join(__dirname, '../frontend/vite.config.mjs'),
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server } },
  });
  try {
    const app = demo
      ? (await require('../demo/app').createDemoApp({ env, frontend: { vite } })).app
      : require('../app').createApp({ env, frontend: { vite } });
    server.on('request', app);
    server.listen(Number(env.PORT || 8080), demo ? '127.0.0.1' : env.HOST || '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    console.log(
      `Prepto React development listening on port ${boundPort(server)}${demo ? ' (isolated synthetic data)' : ''}`,
    );
    const close = async () => {
      server.close();
      server.closeAllConnections();
      await vite.close();
    };
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => close().then(() => process.exit(0)));
    return { server, vite, close };
  } catch (e) {
    await vite.close();
    throw e;
  }
}
if (require.main === module && !process.argv.includes('--demo'))
  require('dotenv').config({ quiet: true });
if (require.main === module)
  start({ demo: process.argv.includes('--demo') }).catch(() => {
    console.error('Development server failed; check configuration and port availability.');
    process.exitCode = 1;
  });
module.exports = { start };
