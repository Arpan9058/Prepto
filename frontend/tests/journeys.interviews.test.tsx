import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Interviews, InterviewSession } from '../src/Interviews';
import { reply, mockFetch } from './journeySetup';
it('interview picker sends only selected saved questions and preserves selection after API failure', async () => {
  const questions = [
    { id: 'q1', title: 'First saved question', difficulty: 'easy' },
    { id: 'q2', title: 'Second saved question', difficulty: 'hard' },
  ];
  mockFetch(async (url, init) =>
    init?.method === 'POST'
      ? reply({ error: 'Refresh question selection' }, 409)
      : url.startsWith('/api/interviews')
        ? reply({ items: [], nextCursor: null })
        : url.includes('/api/questions?')
          ? reply({ items: questions, nextCursor: null })
          : reply(questions[0]),
  );
  render(<Interviews />);
  await screen.findByLabelText(/First saved question/);
  await userEvent.click(screen.getByLabelText(/Second saved question/));
  await userEvent.type(screen.getByLabelText('Session title'), 'System design prep');
  await userEvent.click(screen.getByRole('button', { name: 'Start interview' }));
  await screen.findByRole('alert');
  const sent = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
    title: 'System design prep',
    questionIds: ['q2'],
  });
  expect((screen.getByLabelText(/Second saved question/) as HTMLInputElement).checked).toBe(true);
});
it('active interview saves the current answer with a stable request id, then completes and loads its private reference review', async () => {
  let status = 'active',
    version = 1,
    answers: unknown[] = [];
  const question = {
    id: 'q',
    title: 'Saved join question',
    prompt: 'Explain a left join',
    type: 'openEnded',
    options: [],
    explanation: 'Include missing right-hand rows',
  };
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      expect(body.version).toBe(version);
      version++;
      if (url.endsWith('/answers')) {
        expect(body.questionId).toBe('q');
        expect(body.text).toBe('Keep every left row');
        expect(typeof body.requestId).toBe('string');
        answers = [
          {
            questionId: 'q',
            text: body.text,
            score: 80,
            feedback: 'Clear answer',
            nextStep: 'Try a missing key',
          },
        ];
      }
      if (url.endsWith('/complete')) status = 'completed';
    }
    return reply({
      id: 's',
      title: 'Private join practice',
      status,
      version,
      answeredCount: answers.length,
      questionCount: 1,
      currentQuestionId: answers.length ? null : 'q',
      questions: [question],
      answers,
      score: status === 'completed' ? 80 : null,
    });
  });
  render(<InterviewSession id="s" />);
  await userEvent.type(await screen.findByLabelText('Your answer'), 'Keep every left row');
  await userEvent.click(screen.getByRole('button', { name: 'Save answer and feedback' }));
  await screen.findByText('Clear answer');
  expect(screen.queryByText('Reference answer and explanation')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Complete interview' }));
  await screen.findByText('Reference answer and explanation');
  await userEvent.click(screen.getByText('Reference answer and explanation'));
  expect(screen.getByText('Include missing right-hand rows')).toBeTruthy();
  expect(status).toBe('completed');
});
