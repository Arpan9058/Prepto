(() => {
  const { request, element, state, label } = window.Prepto;
  const isAdmin = document.body.dataset.admin === 'true';
  let cursor = null, next = null, history = [], saved = false, archived = false, generation = 0;
  const filters = document.getElementById('filters');
  async function load() {
    const current = ++generation;
    state('Loading questions…');
    document.getElementById('questions').replaceChildren();
    const params = new URLSearchParams({ pageSize: '6' });
    for (const key of ['category', 'difficulty']) if (document.getElementById(key).value) params.set(key, document.getElementById(key).value);
    if (document.getElementById('search').value.trim()) params.set('q', document.getElementById('search').value.trim());
    if (cursor) params.set('after', cursor);
    if (archived) params.set('archived', 'true');
    try {
      const data = await request(`/api/${saved ? 'bookmarks' : 'questions'}?${params}`);
      if (current !== generation) return;
      next = data.nextCursor;
      for (const question of data.items) render(question);
      state(data.items.length ? '' : saved ? 'No saved questions on this page. Explore the bank and bookmark a question.' : 'No questions found. Try another keyword or reset the filters.');
    } catch (error) { if (current !== generation) return; next = null; state(`${error.message} Use Find questions to retry.`, true); }
    document.getElementById('previous').disabled = !history.length;
    document.getElementById('next').disabled = !next;
    document.getElementById('page-label').textContent = `Page ${history.length + 1}${saved ? ' · Saved' : archived ? ' · Archived' : ''}`;
  }
  function render(q) {
    const card = element('article', undefined, 'card'); card.dataset.questionId = q.id;
    const badges = element('div'); for (const value of [q.category, q.difficulty, ...q.skills]) badges.append(element('span', label(value), 'badge'));
    card.append(badges, element('h2', q.title), element('p', q.prompt));
    const actions = element('div', undefined, 'row');
    const bookmark = element('button', q.bookmarked ? 'Unsave question' : 'Save question', 'secondary'); bookmark.setAttribute('aria-pressed', String(q.bookmarked));
    bookmark.onclick = async () => { bookmark.disabled = true; try { await request(`/api/questions/${q.id}/bookmark`, { method: q.bookmarked ? 'DELETE' : 'PUT' }); q.bookmarked = !q.bookmarked; bookmark.textContent = q.bookmarked ? 'Unsave question' : 'Save question'; bookmark.setAttribute('aria-pressed', String(q.bookmarked)); if (saved) await load(); } catch (e) { state(e.message, true); } finally { bookmark.disabled = false; } };
    const practice = element('a', 'Practice', 'button'); practice.href = `/interviews?question=${q.id}`; if (!q.archived) actions.append(practice);
    actions.append(bookmark);
    if (isAdmin) {
      const edit = element('button', 'Edit', 'secondary'); edit.onclick = () => openEditor(q); actions.append(edit);
      if (!q.archived) { const archive = element('button', 'Archive', 'danger'); archive.onclick = async () => { if (!window.confirm('Archive this question? Existing interview snapshots will be preserved.')) return; archive.disabled = true; try { await request(`/api/admin/questions/${q.id}/archive`, { method: 'POST', body: JSON.stringify({ revision: q.revision }) }); await load(); } catch (e) { state(e.message, true); archive.disabled = false; } }; actions.append(archive); }
    }
    card.append(actions); document.getElementById('questions').append(card);
  }
  filters.onsubmit = e => { e.preventDefault(); saved = false; cursor = null; history = []; load(); };
  document.getElementById('bookmarks').onclick = () => { saved = !saved; archived = false; cursor = null; history = []; load(); };
  document.getElementById('next').onclick = () => { history.push(cursor); cursor = next; load(); };
  document.getElementById('previous').onclick = () => { cursor = history.pop(); load(); };
  let editing;
  function openEditor(q) {
    editing = q;
    const form = document.getElementById('question-form'); form.reset();
    document.getElementById('editor-title').textContent = q ? 'Edit question' : 'Create question';
    document.getElementById('editor-error').textContent = '';
    if (q) for (const key of ['title', 'prompt', 'category', 'difficulty', 'type', 'skills', 'options', 'answer', 'explanation']) form.elements[key].value = Array.isArray(q[key]) ? q[key].join(key === 'skills' ? ', ' : '\n') : q[key];
    document.getElementById('editor').showModal();
  }
  if (isAdmin) {
    document.getElementById('new-question').onclick = () => openEditor(null);
    document.getElementById('close-editor').onclick = () => document.getElementById('editor').close();
    document.getElementById('archived').onclick = () => { archived = !archived; saved = false; cursor = null; history = []; load(); };
    document.getElementById('question-form').onsubmit = async e => {
      e.preventDefault(); const form = e.target, body = {};
      for (const key of ['title', 'prompt', 'category', 'difficulty', 'type', 'answer', 'explanation']) body[key] = form.elements[key].value;
      body.skills = form.elements.skills.value.split(',').map(s => s.trim()).filter(Boolean);
      body.options = form.elements.options.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (editing) body.revision = editing.revision;
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      try { await request(`/api/admin/questions${editing ? '/' + editing.id : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }); document.getElementById('editor').close(); cursor = null; history = []; await load(); }
      catch (error) { document.getElementById('editor-error').textContent = error.message; }
      finally { submit.disabled = false; }
    };
  }
  load();
})();
