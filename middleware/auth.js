const { asyncHandler } = require('./errors');
const verified = Symbol('preptoVerifiedIdentity');
const ensureAuthenticated = asyncHandler(async (req, res, next) => {
  if (req[verified]) {
    req.user = req[verified];
    return next();
  }
  const token =
    req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ||
    req.cookies[req.app.locals.authCookieName || 'session_token'];
  if (!token) return unauthorized(req, res);
  let decoded;
  try {
    decoded = await req.app.locals.firebase.auth().verifyIdToken(token, true);
  } catch {
    return unauthorized(req, res);
  }
  if (
    typeof decoded?.uid !== 'string' ||
    !decoded.uid ||
    decoded.uid.length > 128 ||
    decoded.uid.includes('/')
  )
    return unauthorized(req, res);
  req[verified] = decoded;
  req.user = decoded;
  // A browser session cannot be reused for another Firebase identity.
  if (req.session.ownerUid && req.session.ownerUid !== decoded.uid) {
    for (const key of Object.keys(req.session)) if (key !== 'cookie') delete req.session[key];
  }
  req.session.ownerUid = decoded.uid;
  next();
});
function unauthorized(req, res) {
  if (req.originalUrl.startsWith('/api/') || req.headers.authorization || req.method !== 'GET')
    return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/login');
}
module.exports = { ensureAuthenticated };
