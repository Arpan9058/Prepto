(() => {
  const { request, element, state } = window.Prepto;
  const resumeId = document.body.dataset.resumeId, root = `/api/resumes/${resumeId}`;
  let resume, selected, cursor, versionRequest = null, matchRequest = null, matchVersionId = null;
  async function choose(versionId) {
    matchRequest = null;
    selected = await request(`${root}/versions/${versionId}`);
    document.getElementById('selected-label').textContent = `Version ${selected.number} · ${selected.label}`;
    document.getElementById('version-meta').textContent = `${selected.characterCount} characters · ${selected.source.kind} · ${new Date(selected.createdAt).toLocaleDateString()}`;
    document.getElementById('resume-preview').textContent = selected.text; document.getElementById('new-version').elements.text.value = selected.text;
    const download = document.getElementById('download-version'); download.hidden = false; download.href = `${root}/versions/${selected.id}/pdf`;
    document.getElementById('make-current').hidden = selected.id === resume.currentVersionId;
    versionRequest = null;
  }
  async function versions(append = false) {
    const data = await request(`${root}/versions?pageSize=6${append && cursor ? '&after=' + cursor : ''}`); cursor = data.nextCursor;
    const container = document.getElementById('versions'); if (!append) container.replaceChildren();
    for (const version of data.items) {
      const card = element('article', undefined, 'card'), button = element('button', 'Preview version', 'secondary'); card.dataset.versionId = version.id;
      card.append(element('h3', `Version ${version.number} · ${version.label}`), element('p', `${version.characterCount} characters${version.id === resume.currentVersionId ? ' · Current' : ''}`));
      button.onclick = safely(() => choose(version.id)); card.append(button); container.append(card);
    }
    document.getElementById('more-versions').hidden = !cursor;
  }
  async function refresh() { state('Loading versions…'); resume = await request(root); document.getElementById('resume-title').textContent = resume.title; await versions(); await choose(resume.currentVersionId); state(''); }
  const safely = fn => async () => { try { await fn(); } catch (error) { state(`${error.message} Refresh to retry.`, true); } };
  document.getElementById('refresh-versions').onclick = safely(refresh); document.getElementById('more-versions').onclick = safely(() => versions(true));
  document.getElementById('make-current').onclick = safely(async () => { resume = await request(root + '/current', { method: 'PUT', body: JSON.stringify({ versionId: selected.id, expectedRevision: resume.revision }) }); await versions(); await choose(selected.id); });
  const form = document.getElementById('new-version');
  form.addEventListener('input', () => { versionRequest = null; });
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true; versionRequest ||= window.crypto.randomUUID();
    try {
      let options;
      if (form.elements.resume.files.length) { const data = new FormData(form); data.delete('text'); data.set('requestId', versionRequest); data.set('expectedRevision', resume.revision); options = { method: 'POST', body: data }; }
      else options = { method: 'POST', body: JSON.stringify({ text: form.elements.text.value, label: form.elements.label.value, requestId: versionRequest, expectedRevision: resume.revision }) };
      const result = await request(root + '/versions', options); resume = result.resume; versionRequest = null; form.elements.resume.value = ''; form.elements.label.value = ''; await versions(); await choose(result.version.id); state('New version saved. Your original is preserved.');
    } catch (error) { state(error.message, true); } finally { button.disabled = false; }
  };
  const matchForm = document.getElementById('match-version');
  matchForm.addEventListener('input', () => { matchRequest = null; });
  matchForm.onsubmit = async e => {
    e.preventDefault(); const button = matchForm.querySelector('[type=submit]'); button.disabled = true;
    if (!selected) { state('Load a resume version first.', true); button.disabled = false; return; }
    matchRequest ||= window.crypto.randomUUID(); matchVersionId = selected.id; state('Matching selected version…');
    try {
      const value = await request('/api/resume-matches', { method: 'POST', body: JSON.stringify({ resumeId, resumeVersionId: matchVersionId, jobTitle: matchForm.elements.jobTitle.value, jobDescription: matchForm.elements.jobDescription.value, requestId: matchRequest }) });
      const result = document.getElementById('match-result'); result.replaceChildren(); result.hidden = false;
      result.append(element('h3', `Version ${value.match.versionNumber}: ${value.match.result.score}% compatibility estimate`), element('p', value.match.result.summary));
      for (const step of value.match.result.recommendations) result.append(element('p', step));
      matchRequest = null; state('Match saved privately. Open matching history for skill gaps and comparison.');
    } catch (error) { state(`${error.message} Matching history retains failures and offers a retry.`, true); }
    finally { button.disabled = false; }
  };
  safely(refresh)();
})();
