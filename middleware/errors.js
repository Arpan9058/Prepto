/** @param {import("express").RequestHandler} fn
 * @returns {import("express").RequestHandler} */
function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
}
/** @param {number} status @param {string} message */
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
/**
 * @param {Error & {code?: string, status?: number}} err
 * @param {import('express').Request & {log?: import('pino').Logger, id?: string | number}} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, req, res, _next) {
  const status =
    err.code === 'LIMIT_FILE_SIZE'
      ? 413
      : err.name === 'MulterError'
        ? 400
        : typeof err.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : 500;
  // Never log SDK error messages, request bodies, tokens, or credentials.
  req.log?.error({ status, errorType: err.name }, 'Request failed');
  if (status >= 500 && typeof req.app.locals.reportError === 'function') {
    // Deliberately exclude error messages/stacks, URLs, headers, bodies and identities.
    const requestId = String(req.id ?? '');
    const event = Object.freeze({
      kind: 'http.server_error',
      status,
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)
        ? req.method
        : 'OTHER',
      ...(/^[A-Za-z0-9_-]{1,80}$/.test(requestId) ? { requestId } : {}),
    });
    // A slow or broken telemetry sink must not delay/change the HTTP response.
    void Promise.resolve()
      .then(() => req.app.locals.reportError(event))
      .catch(() => req.log?.warn({ reporterFailed: true }, 'Error reporter failed'));
  }
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}
module.exports = { asyncHandler, httpError, errorHandler };
