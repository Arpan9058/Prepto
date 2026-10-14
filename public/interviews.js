(() => {
  const { request, element, state, label } = window.Prepto;
  let cursor = null, questionCursor = null;
  const picked = new Set(), questionIds = new Set();
  const preselected = new URLSearchParams(window.location.search).get('question');
  async function questions() {
    const data = await request(`/api/questions?pageSize=12${questionCursor ? '&after=' + questionCursor : ''}`);
    questionCursor = data.nextCursor;
    if (preselected && !questionIds.has(preselected) && !document.querySelector('#question-picker input')) {
      try { const q = await request(`/api/questions/${encodeURIComponent(preselected)}`); renderQuestion(q); } catch (e) { state(e.message, true); }
    }
    for (const q of data.items) if (!questionIds.has(q.id)) renderQuestion(q);
    document.getElementById('more-questions').hidden = !questionCursor;
  }
  function renderQuestion(q) {
    questionIds.add(q.id);
    const card = element('label', undefined, 'card'); const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.value = q.id;
    checkbox.checked = q.id === preselected; if (checkbox.checked) picked.add(q.id);
    checkbox.onchange = () => { if (checkbox.checked) picked.add(q.id); else picked.delete(q.id); };
    card.append(checkbox, element('strong', q.title), element('span', `${label(q.difficulty)} · ${q.skills.join(', ')}`, 'subtle')); document.getElementById('question-picker').append(card);
  }
  async function sessions(append = false) {
    state('Loading interviews…');
    const status = document.getElementById('session-status').value;
    const data = await request(`/api/interviews?pageSize=6${status ? '&status=' + status : ''}${append && cursor ? '&after=' + cursor : ''}`);
    cursor = data.nextCursor;
    const container = document.getElementById('sessions'); if (!append) container.replaceChildren();
    for (const session of data.items) {
      const card = element('article', undefined, 'card'); const link = element('a', session.status === 'completed' ? 'Review answers' : session.status === 'paused' ? 'Resume interview' : 'Continue interview', 'button'); link.href = `/interviews/${session.id}`;
      card.append(element('span', label(session.status), 'badge'), element('h2', session.title), element('p', `${session.answeredCount}/${session.questionCount} answers saved${session.score !== null ? ' · ' + session.score + '%' : ''}`), link); container.append(card);
    }
    document.getElementById('more-sessions').hidden = !cursor;
    state(container.children.length ? '' : 'No sessions yet. Choose a few questions to start your first interview.');
  }
  const safely = fn => async () => { try { await fn(); } catch (e) { state(`${e.message} Use Refresh to retry.`, true); } };
  document.getElementById('refresh-sessions').onclick = safely(() => sessions());
  document.getElementById('session-status').onchange = safely(() => sessions());
  document.getElementById('more-sessions').onclick = safely(() => sessions(true));
  document.getElementById('more-questions').onclick = safely(questions);
  document.getElementById('start-interview').onsubmit = async e => {
    e.preventDefault(); const button = e.target.querySelector('[type=submit]'); button.disabled = true;
    try { if (picked.size < 1 || picked.size > 10) throw new Error('Choose 1–10 questions.'); const result = await request('/api/interviews', { method: 'POST', body: JSON.stringify({ title: e.target.elements.title.value, questionIds: [...picked] }) }); window.location.assign(`/interviews/${result.id}`); }
    catch (error) { state(error.message, true); button.disabled = false; }
  };
  safely(async () => { await questions(); await sessions(); })();
})();
