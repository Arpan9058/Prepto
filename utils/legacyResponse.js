// Explicit negotiation retains EJS compatibility while React uses the same guarded handlers.
function renderResponse(req, res, view, data) {
  return req.get('accept')?.includes('application/json') ? res.json({ view, ...data }) : res.render(view, data);
}
function redirectResponse(req, res, redirect) {
  return req.get('accept')?.includes('application/json') ? res.json({ redirect }) : res.redirect(redirect);
}
module.exports = { renderResponse, redirectResponse };
