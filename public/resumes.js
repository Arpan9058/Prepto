(() => {
  const { request, element, state } = window.Prepto;
  let cursor = null, createId = null;
  async function load(append = false) {
    state('Loading resumes…');
    try {
      const data = await request(`/api/resumes?pageSize=6${append && cursor ? '&after=' + cursor : ''}`); cursor = data.nextCursor;
      const container = document.getElementById('resumes'); if (!append) container.replaceChildren();
      for (const resume of data.items) { const card = element('article', undefined, 'card'), link = element('a', 'Open versions', 'button'); link.href = `/resumes/${resume.id}`; card.append(element('h3', resume.title), element('p', `${resume.versionCount} saved version${resume.versionCount === 1 ? '' : 's'}`), link); container.append(card); }
      document.getElementById('more-resumes').hidden = !cursor;
      state(container.children.length ? '' : 'No saved resumes yet. Paste your text or upload a resume to start.');
    } catch (error) { state(`${error.message} Use Refresh to retry.`, true); }
  }
  document.getElementById('refresh-resumes').onclick = () => load(); document.getElementById('more-resumes').onclick = () => load(true);
  document.getElementById('create-resume').onsubmit = async e => {
    e.preventDefault(); const form = e.target, button = form.querySelector('[type=submit]'); button.disabled = true;
    createId ||= window.crypto.randomUUID();
    try {
      let options;
      if (form.elements.resume.files.length) { const data = new FormData(form); data.delete('text'); data.set('requestId', createId); options = { method: 'POST', body: data }; }
      else options = { method: 'POST', body: JSON.stringify({ title: form.elements.title.value, text: form.elements.text.value, label: form.elements.label.value, requestId: createId }) };
      const result = await request('/api/resumes', options); createId = null; window.location.assign(`/resumes/${result.resume.id}`);
    } catch (error) { state(error.message, true); button.disabled = false; }
  };
  document.getElementById('create-resume').addEventListener('input', () => { createId = null; });
  load();
})();
