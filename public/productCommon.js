window.Prepto = {
  async request(url, options = {}) {
    const response = await window.fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof window.FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
    let data;
    try { data = await response.json(); } catch { throw new Error('The service returned an unreadable response. Try again.'); }
    if (!response.ok) throw new Error(response.status === 401 ? 'Your login expired. Please sign in again.' : data.error || 'Request failed');
    return data;
  },
  element(tag, content, className) { const node = document.createElement(tag); if (content !== undefined) node.textContent = String(content); if (className) node.className = className; return node; },
  state(message, error = false) { const node = document.getElementById('status'); node.textContent = message; node.className = error ? 'state error' : 'state'; node.hidden = !message; node.setAttribute('role', error ? 'alert' : 'status'); const main = document.querySelector('main'); if (main) main.setAttribute('aria-busy', String(/^(Loading|Matching|Requesting)/.test(message) && !error)); },
  label(value) { return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }
};

// Keep the skip link useful for keyboard users, including browsers without native focus transfer.
document.querySelector('.skip-link')?.addEventListener('click', () => document.getElementById('main-content')?.focus());
