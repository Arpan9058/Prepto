import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Root } from '../src/App';
import { Auth } from '../src/Auth';
import { GuidedRound, LegacyCoding, MockTests, OneOffTool } from '../src/Legacy';
import { Dictation } from '../src/Dictation';
import { ResumeVersions, Matching } from '../src/Resumes';
const sdk = vi.hoisted(() => ({
  reset: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  initialize: vi.fn(() => ({})),
}));
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  initializeAuth: sdk.initialize,
  inMemoryPersistence: 'memory-only',
  sendPasswordResetEmail: sdk.reset,
  signInWithEmailAndPassword: sdk.login,
  createUserWithEmailAndPassword: sdk.register,
}));
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const mockFetch = (fn: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((u: string, i?: RequestInit) => fn(u, i)),
  );
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('application bootstrap reports network failure, retries and renders usable public navigation', async () => {
  vi.mocked(fetch)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(reply({ demo: false }));
  render(<Root />);
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
  await screen.findByText(/Better answers/);
  expect(screen.getAllByRole('link', { name: /Build your practice/ }).length).toBeGreaterThan(0);
});
it('isolated demo entry exposes a labelled synthetic session start without production login', async () => {
  window.history.replaceState({}, '', '/demo');
  vi.mocked(fetch).mockResolvedValue(reply({ demo: true }));
  render(<Root />);
  await screen.findByText(/Fixed simulated feedback/);
  expect(document.querySelector('form[action="/demo/start"]')).toBeTruthy();
  expect(document.querySelector('input[type=password]')).toBeNull();
});
it('private route bootstrap preserves a failed identity boundary and offers retry', async () => {
  window.history.replaceState({}, '', '/question-bank/');
  mockFetch(async (url) =>
    reply(url === '/api/runtime' ? { demo: false } : {}, url === '/api/runtime' ? 200 : 401),
  );
  render(<Root />);
  await screen.findByRole('alert');
  expect(screen.getByText(/session has ended/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Create question' })).toBeNull();
});
it.each(['login', 'register', 'forgot-password'])(
  'public route %s never renders a private navigation shell',
  async (route) => {
    window.history.replaceState({}, '', '/' + route);
    mockFetch(async () => reply({ demo: false, firebase: null }));
    render(<Root />);
    await screen.findByText(/Browser sign-in is not configured/);
    expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).toBeNull();
  },
);
it('authentication initialization failure can retry without a reload or persistent token storage', async () => {
  mockFetch(async () => reply({ demo: false, firebase: { apiKey: 'public-synthetic' } }));
  sdk.initialize.mockImplementationOnce(() => {
    throw new Error('provider initialization detail');
  });
  sdk.reset.mockResolvedValueOnce(undefined);
  render(<Auth mode="reset" />);
  await screen.findByLabelText('Email');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.test' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send reset email' }).closest('form')!);
  await screen.findByText('Unable to open sign-in. Please try again.');
  fireEvent.submit(screen.getByRole('button', { name: 'Send reset email' }).closest('form')!);
  await screen.findByText(/If an account can receive/);
  expect(localStorage.length).toBe(0);
});
it.each([undefined, 'auth/user-not-found', 'auth/invalid-email'])(
  'password reset preserves account privacy for %s',
  async (code) => {
    vi.mocked(fetch).mockResolvedValue(
      reply({ demo: false, firebase: { apiKey: 'public-synthetic' } }),
    );
    if (code) sdk.reset.mockRejectedValueOnce({ code });
    else sdk.reset.mockResolvedValueOnce(undefined);
    render(<Auth mode="reset" />);
    await screen.findByLabelText('Email');
    await userEvent.type(screen.getByLabelText('Email'), 'synthetic@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset email' }));
    await screen.findByText(/If an account can receive/);
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  },
);
it('password reset provider failures show a recoverable message without reflecting provider details', async () => {
  vi.mocked(fetch).mockResolvedValue(
    reply({ demo: false, firebase: { apiKey: 'public-synthetic' } }),
  );
  sdk.reset.mockRejectedValueOnce({
    code: 'auth/internal-error',
    message: 'sensitive-provider-detail',
  });
  render(<Auth mode="reset" />);
  await screen.findByLabelText('Email');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.test' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send reset email' }).closest('form')!);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Unable to request');
  expect(alert.textContent).not.toContain('sensitive');
});
it('real login adapter exchanges the ID token through the server and does not persist it locally', async () => {
  mockFetch(async (url) =>
    url === '/api/runtime'
      ? reply({ demo: false, firebase: { apiKey: 'public-synthetic' } })
      : reply({}, 401),
  );
  sdk.login.mockResolvedValueOnce({ user: { getIdToken: async () => 'synthetic-id-token' } });
  render(<Auth mode="login" />);
  await screen.findByLabelText('Email');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
  await screen.findByRole('alert');
  const exchange = vi.mocked(fetch).mock.calls.find(([u]) => u === '/api/set-token');
  expect(exchange?.[1]?.headers).toHaveProperty('Authorization', 'Bearer synthetic-id-token');
  expect(localStorage.length).toBe(0);
});
it('registration provider rejection keeps the form usable without revealing account existence', async () => {
  vi.mocked(fetch).mockResolvedValue(
    reply({ demo: false, firebase: { apiKey: 'public-synthetic' } }),
  );
  sdk.register.mockRejectedValueOnce(new Error('email exists provider detail'));
  render(<Auth mode="register" />);
  await screen.findByLabelText('Email');
  for (const [name, value] of [
    ['Full name', 'Synthetic'],
    ['Email', 'synthetic@example.test'],
    ['Password', 'synthetic-password'],
    ['Confirm password', 'synthetic-password'],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: 'Create your workspace' }).closest('form')!);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Unable to sign in or create');
  expect(alert.textContent).not.toContain('email exists');
  expect((screen.getByLabelText('Email') as HTMLInputElement).matches(':disabled')).toBe(false);
});
it('guided interview retains a failed answer then saves feedback and completion', async () => {
  let complete = false,
    failed = false;
  mockFetch(async (url, init) => {
    if (url.endsWith('/analyze-text')) {
      if (!failed) {
        failed = true;
        return reply({ error: 'Retry shortly' }, 503);
      }
      complete = true;
      return reply({
        analysis: {
          analysis: 'Specific example',
          recommendation: 'Name a measurable result',
          score: 4,
        },
        interviewComplete: true,
      });
    }
    if (init?.method === 'POST') return reply({ question: 'Describe a conflict' });
    return reply({
      started: true,
      completed: complete,
      question: 'Describe a conflict',
      counter: 0,
    });
  });
  render(<GuidedRound kind="hr" />);
  await screen.findByLabelText('Your answer');
  await userEvent.type(screen.getByLabelText('Your answer'), 'I listened first.');
  await userEvent.click(screen.getByRole('button', { name: 'Save answer and continue' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe(
    'I listened first.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save answer and continue' }));
  await screen.findByText('Specific example');
  expect(screen.getByRole('link', { name: 'Open saved reports' }).getAttribute('href')).toBe(
    '/reports',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Start or restart round' }));
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/start'))).toBe(true),
  );
});
it('mock test submits only saved question options and shows deterministic saved grading', async () => {
  mockFetch(async (url, _init) =>
    url.endsWith('/submit')
      ? reply({ score: 1, total: 1 })
      : reply({
          sessionId: 'saved',
          questions: [{ _id: 'q', question: 'Which method reads?', options: ['GET', 'POST'] }],
        }),
  );
  render(<MockTests />);
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'reasoning');
  await userEvent.click(screen.getByRole('button', { name: 'Start mock test' }));
  await userEvent.click(await screen.findByRole('radio', { name: 'GET' }));
  await userEvent.click(screen.getByRole('button', { name: 'Submit mock test' }));
  await screen.findByText('Saved score: 1/1');
  const submission = vi.mocked(fetch).mock.calls.find(([u]) => u === '/api/sessions/submit');
  expect(JSON.parse(String(submission?.[1]?.body))).toEqual({
    sessionId: 'saved',
    answers: { q: 'GET' },
  });
});
it.each(['career', 'builder', 'ats', 'resume-interview'] as const)(
  'legacy %s keeps output and PDF links tied to a successful response',
  async (kind) => {
    mockFetch(async () =>
      reply({
        analysis: '<p>Saved synthetic guidance</p>',
        resumeContent: '<p>Saved synthetic guidance</p>',
      }),
    );
    render(<OneOffTool kind={kind} />);
    if (kind === 'career')
      fireEvent.change(screen.getByLabelText('Your skills'), { target: { value: 'SQL' } });
    if (kind === 'builder')
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Synthetic' } });
    if (kind === 'ats' || kind === 'resume-interview') {
      const input = screen.getByLabelText('PDF / DOCX (maximum 5 MiB)');
      await userEvent.upload(
        input,
        new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' }),
      );
    }
    if (kind === 'ats')
      fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'SQL role' } });
    const submit = screen.getByRole('button', {
      name: kind === 'builder' ? 'Build resume' : 'Request feedback',
    });
    fireEvent.submit(submit.closest('form')!);
    await screen.findByText('Saved synthetic guidance');
    expect(!!screen.queryByRole('link', { name: 'Download resume PDF' })).toBe(kind === 'builder');
  },
);
it('saved legacy coding review separates AI estimates from executable results', async () => {
  window.history.replaceState({}, '', '/coding-test/results');
  vi.mocked(fetch).mockResolvedValue(
    reply({
      view: 'results',
      score: 80,
      answers: {
        q: {
          question: { title: 'Synthetic problem' },
          code: '<script>text only</script>',
          evaluation: {
            score: 80,
            feedback: {
              implementation: 'Consider boundaries',
              suggestions: ['Handle empty input'],
            },
          },
        },
      },
    }),
  );
  render(<LegacyCoding />);
  await screen.findByText('Consider boundaries');
  expect(screen.getByText('AI score total: 80. Execution disabled.')).toBeTruthy();
  expect(document.querySelector('pre script')).toBeNull();
});
it('legacy coding timer auto-submits saved text without executing it', async () => {
  window.history.replaceState({}, '', '/coding-test/question/1');
  mockFetch(async (_u, init) =>
    init?.method === 'POST'
      ? reply({ error: 'Test conflict, reload' }, 409)
      : reply({
          view: 'question',
          question: { title: 'Synthetic problem', description: 'Explain an approach' },
          skeletonCode: 'return []',
          questionNumber: 1,
          timeRemaining: 1,
          testCases: [{ input: '[]', expectedOutput: '[]' }],
        }),
  );
  render(<LegacyCoding />);
  await screen.findByLabelText('Your code');
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(1100);
  vi.useRealTimers();
  await screen.findByRole('alert');
  const submit = vi.mocked(fetch).mock.calls.find(([, i]) => i?.method === 'POST');
  expect(JSON.parse(String(submit?.[1]?.body))).toMatchObject({ code: 'return []' });
});
it('dictation is opt-in, preserves typed text, bounds transcripts and stops on submit/unmount', async () => {
  const instances: RecognitionDouble[] = [];
  let instance!: RecognitionDouble;
  class RecognitionDouble {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  Object.defineProperty(window, 'SpeechRecognition', {
    value: RecognitionDouble,
    configurable: true,
  });
  function Form() {
    const [text, setText] = useState('Typed');
    return (
      <form onSubmit={(e) => e.preventDefault()}>
        <output>{text}</output>
        <Dictation text={text} setText={setText} />
        <button>Save</button>
      </form>
    );
  }
  const view = render(<Form />);
  expect(instances).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
  instance = instances.at(-1)!;
  expect(instance.start).toHaveBeenCalledOnce();
  instance.onresult?.({ results: [[{ transcript: 'spoken' }]] });
  await screen.findByText('Typed spoken');
  await userEvent.click(screen.getByRole('button', { name: 'Stop voice input' }));
  expect(instance.stop).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
  instance = instances.at(-1)!;
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
  expect(instance.stop).toHaveBeenCalled();
  instance.onerror?.();
  await screen.findByRole('alert');
  view.unmount();
  expect(instance.abort).toHaveBeenCalled();
  expect(instance.onresult).toBeNull();
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
});
it('resume version conflicts preserve edits and existing immutable PDF download', async () => {
  const versions = [
    { id: 'v1', number: 1, label: 'Original', text: 'SQL original', characterCount: 12 },
    { id: 'v2', number: 2, label: 'Current', text: 'SQL improved', characterCount: 12 },
  ];
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') return reply({ error: 'Revision changed; refresh' }, 409);
    if (url.includes('/versions/'))
      return reply(versions.find((v) => url.endsWith(v.id)) || versions[1]);
    if (url.includes('/versions?')) return reply({ items: versions, nextCursor: null });
    return reply({ id: 'r', title: 'Private resume', currentVersionId: 'v2', revision: 2 });
  });
  render(<ResumeVersions id="r" />);
  const editor = await screen.findByLabelText('Edit the selected text');
  await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe('SQL improved'));
  fireEvent.change(editor, { target: { value: 'Keep my unsaved edit' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save as new version' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Edit the selected text') as HTMLTextAreaElement).value).toBe(
    'Keep my unsaved edit',
  );
  expect(
    screen.getByRole('link', { name: 'Download this version as PDF' }).getAttribute('href'),
  ).toBe('/api/resumes/r/versions/v2/pdf');
  await userEvent.click(screen.getAllByRole('button', { name: 'Preview version' })[0]);
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'Download this version as PDF' }).getAttribute('href'),
    ).toContain('/v1/pdf'),
  );
  expect(screen.getByRole('button', { name: 'Use as current' })).toBeTruthy();
});
it('matching requires exactly two saved matches and retries a failed record using its existing request id', async () => {
  const item = {
    id: 'm1',
    status: 'failed',
    jobTitle: 'SQL role',
    versionNumber: 1,
    resumeTitle: 'Private',
    summary: null,
    score: null,
    canRetry: true,
    resumeId: 'r',
    resumeVersionId: 'v',
    jobDescription: 'SQL role description',
    modelId: 'offline',
    result: null,
  };
  mockFetch(async (url, init) =>
    init?.method === 'POST'
      ? reply({
          match: {
            ...item,
            status: 'completed',
            canRetry: false,
            result: {
              matchedSkills: ['SQL'],
              missingSkills: [],
              recommendations: ['Add evidence'],
            },
            score: 80,
            summary: 'Evidence',
          },
        })
      : url.includes('/m1')
        ? reply(item)
        : reply({ items: [item], nextCursor: null }),
  );
  render(<Matching />);
  await userEvent.click(screen.getByRole('button', { name: 'Compare selected matches' }));
  await screen.findByText('Select exactly two completed matches.');
  await userEvent.click(await screen.findByRole('button', { name: 'Review match' }));
  await screen.findByText('SQL role description');
  await userEvent.click(screen.getByRole('button', { name: 'Retry saved match' }));
  await screen.findByText('Add evidence');
  const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
    requestId: 'm1',
    resumeId: 'r',
    resumeVersionId: 'v',
  });
});

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

import { Interviews, InterviewSession } from '../src/Interviews';
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
it('admin question management keeps revision conflicts visible and archives only with confirmation', async () => {
  const question = {
    id: 'q',
    title: 'Saved SQL question',
    prompt: 'Explain SQL joins',
    category: 'technical',
    difficulty: 'easy',
    skills: ['SQL'],
    type: 'openEnded',
    options: [],
    explanation: 'Relate keys',
    revision: 2,
  };
  let archived = false;
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  mockFetch(async (url, init) => {
    if (url.endsWith('/archive')) {
      expect(JSON.parse(String(init?.body)).revision).toBe(2);
      archived = true;
      return reply({ archived: true });
    }
    if (init?.method === 'PUT' && url === '/api/admin/questions/q')
      return reply({ error: 'Question revision changed' }, 409);
    return reply({ items: archived ? [] : [question], nextCursor: null });
  });
  const { Questions } = await import('../src/Questions');
  render(<Questions admin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit question' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Keep my edited title' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save question' }));
  await screen.findByText('Question revision changed');
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep my edited title');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await screen.findByText(/No questions match/);
  expect(confirm).toHaveBeenCalledOnce();
});
