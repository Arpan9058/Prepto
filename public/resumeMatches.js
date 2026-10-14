(() => {
  const { request, element, state } = window.Prepto;
  let cursor = null; const selected = new Set();
  async function detail(matchId) {
    const match = await request(`/api/resume-matches/${matchId}`); const container = document.getElementById('detail-content'); container.replaceChildren();
    document.getElementById('match-detail').hidden = false; document.getElementById('detail-title').textContent = `${match.jobTitle} · ${match.resumeTitle} · Version ${match.versionNumber}`;
    container.append(element('p', `Status: ${match.status} · Model: ${match.modelId}`), element('h3', 'Saved job description'), element('p', match.jobDescription));
    if (match.result) {
      container.append(element('strong', `Compatibility estimate: ${match.result.score}%`), element('p', match.result.summary));
      for (const [key, title] of [['matchedSkills', 'Matched skills'], ['missingSkills', 'Skill gaps'], ['recommendations', 'Next improvements']]) { const list = element('ul'); for (const item of match.result[key]) list.append(element('li', item)); container.append(element('h3', title), list); }
    }
    if (match.failure) container.append(element('p', match.failure));
    if (match.canRetry) {
      const retry = element('button', 'Retry this match'); retry.onclick = safely(async () => { retry.disabled = true; try { await request('/api/resume-matches', { method: 'POST', body: JSON.stringify({ resumeId: match.resumeId, resumeVersionId: match.resumeVersionId, jobTitle: match.jobTitle, jobDescription: match.jobDescription, requestId: match.id }) }); await load(); await detail(match.id); } finally { retry.disabled = false; } }); container.append(retry);
    }
  }
  async function load(append = false) {
    state('Loading matching history…');
    const data = await request(`/api/resume-matches?pageSize=6${append && cursor ? '&after=' + cursor : ''}`); cursor = data.nextCursor;
    const container = document.getElementById('matches'); if (!append) { container.replaceChildren(); selected.clear(); document.getElementById('comparison').hidden = true; }
    for (const match of data.items) {
      const card = element('article', undefined, 'card'); card.dataset.matchId = match.id;
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.value = match.id; checkbox.disabled = match.status !== 'completed'; checkbox.setAttribute('aria-label', `Compare ${match.jobTitle}, version ${match.versionNumber}`); checkbox.onchange = () => { if (checkbox.checked) selected.add(match.id); else selected.delete(match.id); };
      const button = element('button', 'Review match', 'secondary'); button.onclick = safely(() => detail(match.id));
      card.append(checkbox, element('h2', match.jobTitle), element('p', `${match.resumeTitle} · Version ${match.versionNumber} · ${match.versionLabel}`), element('span', match.score === null ? match.status : `${match.score}% estimate`, 'badge'), element('p', match.summary || (match.status === 'failed' ? 'Matching failed. Open the record to retry.' : 'Processing. Refresh shortly.')), button); container.append(card);
    }
    document.getElementById('more-matches').hidden = !cursor;
    state(container.children.length ? '' : 'No saved matches yet. Open a resume version and add a job description.');
  }
  const safely = fn => async () => { try { await fn(); } catch (error) { state(`${error.message} Refresh to retry.`, true); } };
  document.getElementById('refresh-matches').onclick = safely(() => load()); document.getElementById('more-matches').onclick = safely(() => load(true));
  document.getElementById('compare-matches').onclick = safely(async () => {
    if (selected.size !== 2) throw new Error('Select exactly two completed matches for the same job description.');
    const [firstId, secondId] = [...selected]; const result = await request('/api/resume-matches/compare', { method: 'POST', body: JSON.stringify({ firstId, secondId }) });
    const box = document.getElementById('comparison'); box.replaceChildren(); box.hidden = false;
    box.append(element('h2', `${result.first.jobTitle}: version ${result.first.versionNumber} → ${result.second.versionNumber}`), element('p', `${result.first.score}% → ${result.second.score}% (${result.scoreChange >= 0 ? '+' : ''}${result.scoreChange} points)`), element('p', `Newly matched: ${result.newlyMatchedSkills.join(', ') || 'No new matched skills'}`), element('p', `Remaining gaps: ${result.remainingMissingSkills.join(', ') || 'No reported gaps'}`));
  });
  safely(load)();
})();
