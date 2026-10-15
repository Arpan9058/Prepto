/** Return a listening TCP server's actual port, including when port 0 was requested.
 * @param {import('node:net').Server} server
 * @returns {number}
 */
function boundPort(server) {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a listening TCP server');
  return address.port;
}
module.exports = { boundPort };
