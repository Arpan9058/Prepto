window.Prepto = {
  async request(url, options = {}) {
    const response = await window.fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof window.FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Your login expired. Please sign in again.' : data.error || 'Request failed');
    return data;
  },
  element(tag, content, className) { const node = document.createElement(tag); if (content !== undefined) node.textContent = String(content); if (className) node.className = className; return node; },
  state(message, error = false) { const node = document.getElementById('status'); node.textContent = message; node.className = error ? 'state error' : 'state'; node.hidden = !message; },
  label(value) { return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }
};
