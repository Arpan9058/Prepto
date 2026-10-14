(() => {
  const { request, element, state } = window.Prepto;
  const id = document.body.dataset.sessionId, url = `/api/interviews/${id}`;
  let session, submission;
  const form = document.getElementById('answer-form');
  async function refresh() {
    state('Loading interview…');
    session = await request(url);
    if (session.status === 'completed') session = await request(url + '/review');
    render();
  }
  function render() {
    document.getElementById('session-title').textContent = session.title;
    document.getElementById('session-meta').textContent = `${session.status} · ${session.answeredCount}/${session.questionCount} answers saved${session.score !== null ? ' · Score ' + session.score + '%' : ''}`;
    document.getElementById('pause').hidden = session.status !== 'active';
    document.getElementById('resume').hidden = session.status !== 'paused';
    document.getElementById('complete').hidden = session.status !== 'active' || session.answeredCount !== session.questionCount;
    for (const button of document.querySelectorAll('.toolbar button')) button.disabled = session.busy && button.id !== 'refresh';
    const question = session.questions.find(q => q.id === session.currentQuestionId);
    document.getElementById('current-question').hidden = session.status !== 'active' || !question;
    if (question) {
      document.getElementById('question-number').textContent = `Question ${session.answeredCount + 1} of ${session.questionCount}`;
      document.getElementById('question-title').textContent = question.title; document.getElementById('question-prompt').textContent = question.prompt;
      const multiple = question.type === 'multipleChoice';
      document.getElementById('text-answer').hidden = multiple; form.elements.text.required = !multiple;
      document.getElementById('choice-answer').hidden = !multiple;
      form.elements.choice.replaceChildren(); for (const option of question.options) { const node = element('option', option); node.value = option; form.elements.choice.append(node); }
      if (submission?.questionId !== question.id) { submission = null; form.elements.text.value = ''; }
      if (submission) submission.version = session.version;
      form.querySelector('[type=submit]').disabled = session.busy;
    }
    const answers = document.getElementById('answers'); answers.replaceChildren();
    for (const answer of session.answers) {
      const q = session.questions.find(q => q.id === answer.questionId), card = element('article', undefined, 'card');
      card.append(element('h3', q.title), element('p', 'Your answer: ' + answer.text), element('span', `Score ${answer.score}%`, 'badge'), element('p', answer.feedback), element('p', 'Next step: ' + answer.nextStep));
      if (q.explanation) { const details = element('details'), summary = element('summary', 'Model answer and explanation'); details.append(summary, element('p', q.explanation)); if (q.correctAnswer !== null) details.append(element('p', 'Correct option: ' + q.correctAnswer)); card.append(details); }
      answers.append(card);
    }
    if (!session.answers.length) answers.append(element('p', 'Your saved feedback will appear here after your first answer.', 'subtle'));
    state(session.status === 'paused' ? 'Session paused. Your answers are saved. Resume whenever you are ready.' : session.busy ? 'An answer is being evaluated. Refresh shortly to see saved feedback.' : session.status === 'completed' ? 'Interview complete. Your report and feedback are saved.' : '');
  }
  const safely = fn => async () => { try { await fn(); } catch (e) { state(`${e.message} Refresh to retry.`, true); } };
  document.getElementById('refresh').onclick = safely(refresh);
  for (const action of ['pause', 'resume', 'complete']) document.getElementById(action).onclick = safely(async () => { await request(`${url}/${action}`, { method: 'POST', body: JSON.stringify({ version: session.version }) }); await refresh(); });
  form.onsubmit = async e => {
    e.preventDefault(); const question = session.questions.find(q => q.id === session.currentQuestionId);
    const answer = question.type === 'multipleChoice' ? form.elements.choice.value : form.elements.text.value;
    if (!submission || submission.text !== answer) submission = { questionId: question.id, text: answer, requestId: window.crypto.randomUUID(), version: session.version };
    const button = form.querySelector('[type=submit]'); button.disabled = true; state('Evaluating and saving your answer…');
    try { await request(url + '/answers', { method: 'POST', body: JSON.stringify(submission) }); submission = null; await refresh(); }
    catch (error) { state(`${error.message} Refresh to check saved progress before retrying.`, true); button.disabled = false; }
  };
  safely(refresh)();
})();
