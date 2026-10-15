(() => {
  const { request, element, state } = window.Prepto;
  let selected, revision = 0, libraryCursor, submissionCursor, requestId, busy = false, previousLanguage = 'javascript';
  const editor = document.getElementById('code-editor'), language = document.getElementById('code-language');
  const safe = fn => async () => { try { await fn(); } catch (e) { state(`${e.message} Reload to retry.`, true); } };
  async function library(append = false) {
    state('Loading problems…'); const query = new URLSearchParams(new FormData(document.getElementById('problem-filters'))); query.set('pageSize', 2); if (append) query.set('after', libraryCursor);
    const data = await request('/api/coding/problems?' + query); libraryCursor = data.nextCursor;
    for (const [name, values] of [['category', data.filters.categories], ['topic', data.filters.topics]]) { const select = document.querySelector(`#problem-filters [name=${name}]`), previous = select.value; select.replaceChildren(new Option(`All ${name === 'category' ? 'categories' : 'topics'}`, '')); for (const value of values) select.add(new Option(value, value)); select.value = previous; }
    const box = document.getElementById('problems'); if (!append) box.replaceChildren();
    for (const p of data.items) { const card = element('article', undefined, 'card'), open = element('button', 'Open problem'); card.append(element('h2', p.title), element('p', `${p.category} · ${p.difficulty}`), open); open.onclick = safe(async () => { if (busy) return; if (selected && !window.confirm('Open another problem? Save your draft first to preserve edits.')) return; selected = p; document.getElementById('workspace').hidden = false; document.getElementById('problem-title').textContent = p.title; document.getElementById('problem-prompt').textContent = p.prompt; document.getElementById('problem-examples').textContent = p.examples.join('\n'); const edges = document.getElementById('problem-edge-cases'); edges.replaceChildren(...p.edgeCases.map(value => element('li', value))); await loadDraft(); }); box.append(card); }
    document.getElementById('more-problems').hidden = !libraryCursor; state(box.children.length ? '' : 'No problems match these filters.');
  }
  async function loadDraft() { const draft = await request(`/api/coding/drafts/${selected.id}?language=${language.value}`); editor.value = draft.revision ? draft.code : selected.starter[language.value]; revision = draft.revision; requestId = null; document.getElementById('draft-note').textContent = revision ? `Saved draft revision ${revision}` : 'New draft; save to keep your work.'; }
  async function review(id) {
    const value = await request('/api/coding/submissions/' + id), box = document.getElementById('review-content'); box.replaceChildren(); document.getElementById('coding-review').hidden = false;
    box.append(element('h3', `${value.problem.title} · ${value.language}`), element('p', 'Execution disabled. No executable tests were run.'), element('pre', value.code));
    if (value.feedback) { box.append(element('h3', `AI estimate: ${value.feedback.score}%`), element('p', value.feedback.summary)); for (const next of value.feedback.improvements) box.append(element('p', next)); box.append(element('h3', 'Reference approach'), element('p', value.problem.solution)); }
    else box.append(element('p', `${value.status}: feedback is not available.`));
    if (value.canRetry) { const retry = element('button', 'Retry AI feedback'); retry.onclick = safe(async () => { retry.disabled = true; try { await request('/api/coding/submissions', { method: 'POST', body: JSON.stringify({ problemId: value.problemId, language: value.language, code: value.code, requestId: value.id }) }); await history(); await review(value.id); } finally { retry.disabled = false; } }); box.append(retry); }
    for (const pre of box.querySelectorAll('pre')) { pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere'; } state('');
  }
  async function history(append = false) {
    const data = await request('/api/coding/submissions?pageSize=6' + (append && submissionCursor ? '&after=' + submissionCursor : '')); submissionCursor = data.nextCursor;
    const box = document.getElementById('coding-submissions'); if (!append) box.replaceChildren();
    for (const v of data.items) { const card = element('article', undefined, 'card'), button = element('button', 'Review submission'); card.append(element('h3', v.problem.title), element('p', `${v.language} · ${v.status} · ${v.feedback ? 'AI estimate ' + v.feedback.score + '%' : 'No AI feedback yet'} · Execution disabled`), button); button.onclick = safe(() => review(v.id)); box.append(card); }
    if (!box.children.length) box.append(element('p', 'No submissions yet. Save a solution and request AI review.')); document.getElementById('more-submissions').hidden = !submissionCursor;
  }
  document.getElementById('problem-filters').onsubmit = e => { e.preventDefault(); safe(() => library())(); };
  document.getElementById('more-problems').onclick = safe(() => library(true)); document.getElementById('more-submissions').onclick = safe(() => history(true)); document.getElementById('refresh-submissions').onclick = safe(() => history());
  document.getElementById('reload-code').onclick = safe(async () => { if (!busy && window.confirm('Replace unsaved edits with your saved draft?')) await loadDraft(); });
  language.onchange = safe(async () => { if (busy || !selected) return; if (!window.confirm('Switch language? Save your draft first to preserve edits.')) { language.value = previousLanguage; return; } previousLanguage = language.value; await loadDraft(); }); editor.oninput = () => { requestId = null; document.getElementById('draft-note').textContent = 'Unsaved edits'; };
  async function mutate(submit) {
    if (!selected || busy) return; busy = true;
    for (const id of ['save-code', 'submit-code', 'reload-code']) document.getElementById(id).disabled = true; language.disabled = true; editor.disabled = true;
    try {
      const body = { problemId: selected.id, language: language.value, code: editor.value, revision };
      if (submit) { requestId ||= window.crypto.randomUUID(); body.requestId = requestId; state('Requesting AI feedback…'); const value = await request('/api/coding/submissions', { method: 'POST', body: JSON.stringify(body) }); requestId = null; await history(); await review(value.submission.id); }
      else { const value = await request('/api/coding/drafts/' + selected.id, { method: 'PUT', body: JSON.stringify(body) }); revision = value.revision; document.getElementById('draft-note').textContent = `Saved draft revision ${revision}`; state('Draft saved privately.'); }
    } catch (e) { state(e.message + ' Saved submissions retain failed AI reviews for retry.', true); }
    finally { busy = false; for (const id of ['save-code', 'submit-code', 'reload-code']) document.getElementById(id).disabled = false; language.disabled = false; editor.disabled = false; }
  }
  document.getElementById('save-code').onclick = () => mutate(false); document.getElementById('submit-code').onclick = () => mutate(true);
  safe(async () => { await library(); await history(); })();
})();
