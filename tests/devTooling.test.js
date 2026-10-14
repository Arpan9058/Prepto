const net = require('node:net');
const path = require('node:path');
test('patched FTP transport still authenticates against an isolated local protocol fixture', async () => {
  const cliRoot = path.dirname(require.resolve('firebase-tools/package.json'));
  const uriRoot = path.dirname(require.resolve('get-uri', { paths: [cliRoot] }));
  const { Client } = require(require.resolve('basic-ftp', { paths: [uriRoot] }));
  const sockets = new Set(), commands = [];
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.write('220 Local offline fixture\r\n');
    let buffer = '';
    socket.on('data', data => { buffer += data; let end; while ((end = buffer.indexOf('\r\n')) >= 0) { const command = buffer.slice(0, end).split(' ')[0]; commands.push(command); buffer = buffer.slice(end + 2); socket.write(command === 'USER' ? '331 Password required\r\n' : command === 'PASS' ? '230 Logged in\r\n' : command === 'FEAT' ? '211 No features\r\n' : '200 OK\r\n'); } });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const client = new Client(2000);
  try { expect((await client.access({ host: '127.0.0.1', port: server.address().port, user: 'offline', password: 'fixture-only' })).code).toBe(220); expect(commands).toEqual(expect.arrayContaining(['USER', 'PASS'])); expect((await client.send('NOOP')).code).toBe(200); }
  finally { client.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
});
