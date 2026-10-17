import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Root } from '../src/App';
import { reply, mockFetch } from './journeySetup';
it('a saved interview deep link loads private completion review and reference answers through the root shell', async () => {
  window.history.replaceState({}, '', '/interviews/saved');
  const session = {
    id: 'saved',
    title: 'SQL review',
    status: 'completed',
    version: 4,
    answeredCount: 1,
    questionCount: 1,
    currentQuestionId: null,
    score: 80,
    questions: [
      {
        id: 'q',
        title: 'Join explanation',
        prompt: 'Explain joins',
        type: 'openEnded',
        options: [],
        explanation: 'Relate keys',
        correctAnswer: null,
      },
    ],
    answers: [
      {
        questionId: 'q',
        text: 'Use a key relation',
        score: 80,
        feedback: 'Clear explanation',
        nextStep: 'Explain a left join',
      },
    ],
  };
  mockFetch(async (url) =>
    reply(
      url === '/api/runtime'
        ? { demo: false }
        : url === '/api/session'
          ? { uid: 'alice', admin: false }
          : session,
    ),
  );
  render(<Root />);
  await screen.findByText('Clear explanation');
  expect(screen.getByText('Next step: Explain a left join')).toBeTruthy();
  await userEvent.click(screen.getByText('Reference answer and explanation'));
  expect(screen.getByText('Relate keys')).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/interviews/saved/review')).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Save answer and feedback' })).toBeNull();
});
it('unexpected render failures are contained without exposing API data in the root error screen', async () => {
  window.history.replaceState({}, '', '/dashboard');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  mockFetch(async (url) =>
    reply(
      url === '/api/runtime'
        ? { demo: false }
        : url === '/api/session'
          ? { uid: 'alice', admin: false }
          : {},
    ),
  );
  try {
    render(<Root />);
    await screen.findByText(/Something interrupted/);
    expect(screen.getByRole('link', { name: 'Reload this page' }).getAttribute('href')).toBe(
      '/dashboard',
    );
    expect(errors).toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});
it('progress deep link preserves populated skill history, AI labels and goal revision on edits', async () => {
  window.history.replaceState({}, '', '/progress');
  const goal = {
    id: 'g',
    skill: 'SQL',
    targetScore: 80,
    weeklySessions: 2,
    revision: 3,
    currentScore: 75,
    weekCompleted: 1,
    achieved: false,
  };
  const overview = {
    window: { description: 'Bounded window' },
    summary: { attempts: 2, averageScore: 75, sessionsLast7Days: 1 },
    skills: [
      {
        skill: 'SQL',
        latest: 75,
        previous: 60,
        sampleCount: 2,
        history: [
          { score: 60, submittedAt: '2026-01-01' },
          { score: 75, submittedAt: '2026-01-02' },
        ],
        nextStep: 'Practice joins',
      },
    ],
    comparisons: [{ type: 'InterviewPractice', previous: 60, latest: 75, delta: 15 }],
    codingPractice: {
      description: 'AI estimates only',
      skills: [
        {
          skill: 'Maps',
          latest: 70,
          previous: null,
          sampleCount: 1,
          history: [{ score: 70, submittedAt: '2026-01-02' }],
        },
      ],
    },
    recommendations: [{ skill: 'SQL', message: 'Review joins', nextStep: 'Try an example' }],
    goals: [goal],
  };
  mockFetch(async (url, init) =>
    reply(
      init?.method
        ? { saved: true }
        : url === '/api/runtime'
          ? { demo: false }
          : url === '/api/session'
            ? { uid: 'alice', admin: false }
            : url.includes('overview')
              ? overview
              : {
                  items: [
                    {
                      key: 'a',
                      title: 'Saved SQL interview',
                      score: 75,
                      submittedAt: '2026-01-02',
                      reportUrl: '/reports/view/a?type=InterviewPractice',
                    },
                  ],
                  nextCursor: null,
                },
    ),
  );
  render(<Root />);
  await screen.findByText('Practice joins');
  expect(screen.getByRole('img', { name: 'SQL score history: 60%, 75%' })).toBeTruthy();
  expect(screen.getByText('AI estimate 70% · Previous Not scored')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Edit goal' }));
  fireEvent.change(screen.getByLabelText('Target score (%)'), { target: { value: '90' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save goal' }));
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, init]) =>
            url === '/api/progress/goals' &&
            JSON.parse(String(init?.body)).revision === 3 &&
            JSON.parse(String(init?.body)).targetScore === 90,
        ),
    ).toBe(true),
  );
});
