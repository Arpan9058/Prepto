(() => {
  const { request, element, state, label } = window.Prepto;
  let data, cursor = null, loading = false;
  const percent = value => value === null ? 'Not scored yet' : `${value}%`;
  const change = value => value === null ? 'First scored attempt' : `${value >= 0 ? '+' : ''}${value} points vs previous`;
  async function refresh() {
    if (loading) return; loading = true; state('Loading progress…');
    document.getElementById('refresh-progress').disabled = true;
    try { data = await request('/api/progress/overview'); render(); await history(); state(data.summary.attempts ? '' : 'Your progress starts with one session. Complete a practice interview to see feedback and skill trends.'); }
    catch (error) { state(`${error.message} Use Refresh progress to retry.`, true); }
    finally { loading = false; document.getElementById('refresh-progress').disabled = false; }
  }
  function cards(containerId, entries, renderCard) { const container = document.getElementById(containerId); container.replaceChildren(); for (const entry of entries) container.append(renderCard(entry)); }
  function render() {
    document.getElementById('window-note').textContent = `${data.window.description}${data.window.truncated ? ' This account has older records outside this window.' : ''} Scores can vary with question difficulty.`;
    cards('metrics', [['Recent attempts', data.summary.attempts], ['Average score in this window', percent(data.summary.averageScore)], ['Completed in 7 days', data.summary.sessionsLast7Days]], ([title, value]) => { const card = element('article', undefined, 'card'); card.append(element('p', title, 'subtle'), element('div', value, 'metric')); return card; });
    document.getElementById('coding-progress-note').textContent = `${data.codingPractice.attempts} reviews. ${data.codingPractice.description}`;
    cards('coding-trends', data.codingPractice.skills, s => { const card = element('article', undefined, 'card'); card.append(element('h3', s.skill), element('p', `Latest AI estimate ${percent(s.latest)} · Previous ${percent(s.previous)} · ${s.sampleCount} reviews`)); return card; });
    cards('skills', data.skills, s => {
      const card = element('article', undefined, 'card'); card.append(element('h3', s.skill), element('div', percent(s.latest), 'metric'), element('p', change(s.delta)), element('p', `${s.sampleCount} scored attempts`, 'subtle'));
      const chart = element('div', undefined, 'chart-bars'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', `${s.skill} score history: ${s.history.map(h => h.score + '%').join(', ')}`);
      for (const point of s.history) { const bar = element('div'); bar.style.height = `${Math.max(point.score, 2)}%`; bar.title = `${point.score}% · ${point.submittedAt ? new Date(point.submittedAt).toLocaleDateString() : 'Unknown date'}`; chart.append(bar); }
      card.append(chart); return card;
    });
    if (!data.skills.length) document.getElementById('skills').append(element('p', 'Skill trends will appear after a session with skill feedback.', 'subtle'));
    cards('comparisons', data.comparisons, c => { const card = element('article', undefined, 'card'); card.append(element('h3', label(c.type)), element('p', `Latest ${percent(c.latest)} · Previous ${percent(c.previous)}`), element('strong', change(c.delta))); return card; });
    if (!data.comparisons.length) document.getElementById('comparisons').append(element('p', 'Complete scored attempts to compare your progress. Historic attempts without a known score scale remain in history.', 'subtle'));
    cards('recommendations', data.recommendations, r => { const card = element('article', undefined, 'card'), link = element('a', 'Find practice questions', 'button'); link.href = r.questionBankUrl; card.append(element('h3', r.skill || 'Start with a focused session'), element('p', r.message)); if (r.nextStep) card.append(element('p', r.nextStep, 'subtle')); card.append(link); return card; });
    cards('goals', data.goals, g => {
      const card = element('article', undefined, 'card'); card.dataset.goalId = g.id;
      card.append(element('h3', g.skill), element('p', `Target ${g.targetScore}% · Current ${percent(g.currentScore)}`), element('p', `${g.weekCompleted}/${g.weeklySessions} sessions completed in 7 days`), element('p', g.achieved ? 'Goal met in this window. Set your next challenge.' : g.scoreGap === null ? 'Complete a session to establish your starting score.' : `${g.scoreGap} points to your target. Review feedback, practice, then reassess.`));
      const actions = element('div', undefined, 'row'), edit = element('button', 'Edit goal', 'secondary'), remove = element('button', 'Remove goal', 'secondary');
      edit.onclick = () => { const form = document.getElementById('goal-form'); for (const key of ['skill', 'targetScore', 'weeklySessions']) form.elements[key].value = g[key]; form.elements.skill.focus(); };
      remove.onclick = async () => { remove.disabled = true; try { await request(`/api/progress/goals/${g.id}`, { method: 'DELETE', body: JSON.stringify({ revision: g.revision }) }); await refresh(); } catch (e) { state(e.message, true); remove.disabled = false; } };
      actions.append(edit, remove); card.append(actions); return card;
    });
    if (!data.goals.length) document.getElementById('goals').append(element('p', 'Choose a skill and an achievable weekly practice target.', 'subtle'));
    const options = document.getElementById('known-skills'); options.replaceChildren(); for (const skill of data.skills) { const option = element('option'); option.value = skill.skill; options.append(option); }
  }
  async function history(append = false) {
    const type = document.getElementById('history-type').value;
    const result = await request(`/api/progress/attempts?pageSize=10${type ? '&type=' + type : ''}${append && cursor ? '&after=' + cursor : ''}`);
    cursor = result.nextCursor;
    const body = document.getElementById('history'); if (!append) body.replaceChildren();
    for (const attempt of result.items) {
      const row = element('tr'), cell = element('td'), link = element('a', 'View report'); link.href = attempt.reportUrl; cell.append(link);
      row.append(element('td', attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString() : 'Unknown date'), element('td', attempt.title), element('td', attempt.aiScore !== null ? `AI estimate ${attempt.aiScore}% · execution disabled` : attempt.score === null ? `${attempt.points ?? '—'} points · scale unavailable` : percent(attempt.score)), cell); body.append(row);
    }
    document.getElementById('history-empty').hidden = !!body.children.length;
    document.getElementById('more-history').hidden = !cursor;
  }
  document.getElementById('refresh-progress').onclick = refresh;
  document.getElementById('history-type').onchange = async () => { try { await history(); } catch (e) { state(e.message, true); } };
  document.getElementById('more-history').onclick = async () => { const button = document.getElementById('more-history'); button.disabled = true; try { await history(true); } catch (e) { state(e.message, true); } finally { button.disabled = false; } };
  document.getElementById('goal-form').onsubmit = async e => {
    e.preventDefault(); const form = e.target, button = form.querySelector('[type=submit]'); button.disabled = true;
    const body = { skill: form.elements.skill.value.trim(), targetScore: Number(form.elements.targetScore.value), weeklySessions: Number(form.elements.weeklySessions.value) };
    const existing = data?.goals.find(g => g.skill.toLowerCase() === body.skill.toLowerCase()); if (existing) body.revision = existing.revision;
    try { await request('/api/progress/goals', { method: 'PUT', body: JSON.stringify(body) }); document.getElementById('goal-error').textContent = ''; await refresh(); }
    catch (error) { document.getElementById('goal-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  refresh();
})();
