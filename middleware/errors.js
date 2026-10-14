function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function errorHandler(err, req, res, _next) {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 :
    err.name === 'MulterError' ? 400 : (err.status >= 400 && err.status < 600 ? err.status : 500);
  // Never log SDK error messages, request bodies, tokens, or credentials.
  req.log.error({ status, errorType: err.name }, 'Request failed');
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}
module.exports = { asyncHandler, httpError, errorHandler };
