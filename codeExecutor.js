async function executeCode() {
  throw new Error('Host code execution is disabled; use an isolated execution service');
}
module.exports = { executeCode };
