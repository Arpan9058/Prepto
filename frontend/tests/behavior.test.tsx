import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AsyncForm, LoadState, Empty, useResource } from '../src/ui';
import { Auth, Onboarding } from '../src/Auth';
import { InterviewSession } from '../src/Interviews';
import { Workspace } from '../src/components';
import { api } from '../src/api';
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('recoverable forms and authentication boundaries', () => {
  it('disables pending form, retains retry id after failure and resets it after edits', async () => {
    const ids: string[] = [];
    let release!: () => void;
    const save = vi.fn(async (_data: FormData, id: string) => {
      ids.push(id);
      if (ids.length === 1) {
        await new Promise<void>((r) => {
          release = r;
        });
        throw new Error('Temporary outage');
      }
    });
    render(
      <AsyncForm save={save}>
        <label>
          Name
          <input name="name" />
        </label>
      </AsyncForm>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('textbox').matches(':disabled')).toBe(true);
    release();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved successfully.');
    expect(ids[1]).toBe(ids[0]);
    await user.type(screen.getByRole('textbox'), 'Edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ids.length).toBe(3));
    expect(ids[2]).not.toBe(ids[1]);
  });
  it('shows loading then retries errors and handles empty content', async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce(reply({ items: [] }));
    function Resource() {
      const r = useResource<{ items: unknown[] }>('/resource');
      return (
        <>
          <LoadState resource={r} />
          {r.data && <Empty>No saved work</Empty>}
        </>
      );
    }
    render(<Resource />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    resolve(reply({ error: 'Try later' }, 503));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await screen.findByText('No saved work');
  });
  it('aborts stale resource requests on unmount', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    function Resource() {
      useResource('/private');
      return null;
    }
    const view = render(<Resource />);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
  it('explains expired sessions and rejects malformed JSON without reflecting provider HTML', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(reply({}, 401))
      .mockResolvedValueOnce(new Response('<secret-provider-html>', { status: 502 }));
    await expect(api('/private')).rejects.toMatchObject({
      status: 401,
      message: 'Your session has ended. Sign in to continue.',
    });
    await expect(api('/private')).rejects.toThrow('unreadable response');
    expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe('same-origin');
  });
  it.each(['login', 'register', 'reset'] as const)(
    'does not display credential fields in isolated demo %s',
    async (mode) => {
      vi.mocked(fetch).mockResolvedValue(reply({ demo: true, firebase: null }));
      render(<Auth mode={mode} />);
      await screen.findByText('Use a synthetic workspace');
      expect(document.querySelector('main h1')).toBeTruthy();
      expect(screen.queryByLabelText('Email')).toBeNull();
    },
  );
  it('fails closed when browser auth configuration is missing', async () => {
    vi.mocked(fetch).mockResolvedValue(reply({ demo: false, firebase: null }));
    render(<Auth mode="login" />);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('not configured'),
    );
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
  it('validates registration before loading an authentication provider', async () => {
    vi.mocked(fetch).mockResolvedValue(reply({ demo: false, firebase: { apiKey: 'synthetic' } }));
    render(<Auth mode="register" />);
    await screen.findByLabelText('Confirm password');
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'synthetic@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Synthetic' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-one' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'password-two' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Create your workspace' }).closest('form')!,
    );
    await screen.findByText('Passwords do not match.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('loads and saves only the editable profile fields', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(reply({ fullName: 'Alice', mobile: '' }))
      .mockResolvedValueOnce(reply({ saved: true }));
    render(<Onboarding />);
    const input = await screen.findByLabelText('Full name');
    fireEvent.change(input, { target: { value: 'Alice updated' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Saved successfully.');
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({
      fullName: 'Alice updated',
      mobile: '',
    });
  });
});
it('renders navigation and closes mobile navigation with Escape while restoring focus', async () => {
  render(
    <Workspace demo={false}>
      <main id="main-content">Private content</main>
    </Workspace>,
  );
  expect(screen.getByRole('link', { name: 'Coding practice' }).getAttribute('href')).toBe(
    '/coding-practice',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  expect(document.querySelector('.workspace-body')?.hasAttribute('inert')).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open navigation' }));
  expect(document.querySelector('.workspace-body')?.hasAttribute('inert')).toBe(false);
});
it('pauses/resumes with the saved version and preserves the active answer after a failed transition', async () => {
  let status = 'active',
    version = 3,
    fail = true;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      expect(JSON.parse(String(init.body)).version).toBe(version);
      if (fail) {
        fail = false;
        return reply({ error: 'Session changed; retry' }, 409);
      }
      status = String(url).endsWith('/pause') ? 'paused' : 'active';
      version++;
    }
    return reply({
      id: 's',
      title: 'Private practice',
      status,
      version,
      answeredCount: 0,
      questionCount: 1,
      currentQuestionId: 'q',
      questions: [
        { id: 'q', title: 'Explain SQL', prompt: 'Explain a join', type: 'openEnded', options: [] },
      ],
      answers: [],
    });
  });
  render(<InterviewSession id="s" />);
  const answer = await screen.findByLabelText('Your answer');
  await userEvent.type(answer, 'Retain my answer');
  await userEvent.click(screen.getByRole('button', { name: 'Pause interview' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe(
    'Retain my answer',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Pause interview' }));
  await screen.findByText(/Paused. Your work/);
  expect(screen.queryByLabelText('Your answer')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Resume interview' }));
  await screen.findByLabelText('Your answer');
  expect(version).toBe(5);
});

import { Dashboard } from '../src/Dashboard';
import { Questions } from '../src/Questions';
import { Reports, ReportView, ProgressScreen } from '../src/Progress';
import { Resumes, Matching } from '../src/Resumes';
it('dashboard uses real counts and resumes saved interviews without invented analytics', async () => {
  vi.mocked(fetch).mockImplementation(async (url) =>
    reply(
      String(url).includes('overview')
        ? { summary: { attempts: 7 }, window: { description: 'Recent bounded window' } }
        : String(url).includes('interviews')
          ? {
              items: [
                {
                  id: 'saved',
                  title: 'Paused SQL',
                  status: 'paused',
                  answeredCount: 1,
                  questionCount: 2,
                },
              ],
            }
          : String(url).includes('resumes')
            ? { items: [{ id: 'cv', title: 'SQL CV', versionCount: 2 }] }
            : { uid: 'alice', admin: false },
    ),
  );
  render(<Dashboard demo={false} />);
  await screen.findByText('Recent bounded window');
  expect(screen.getByText('7')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Paused SQL/ }).getAttribute('href')).toBe(
    '/interviews/saved',
  );
  expect(
    screen.getByRole('link', { name: /Your experience, considered/ }).getAttribute('href'),
  ).toBe('/resumes/cv');
});
it('dashboard session expiry offers sign-in instead of an unsafe retry loop', async () => {
  vi.mocked(fetch).mockResolvedValue(reply({}, 401));
  render(<Dashboard demo={false} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
});
it('question filters use API parameters and a learner cannot see admin editing controls', async () => {
  vi.mocked(fetch).mockResolvedValue(reply({ items: [], nextCursor: null }));
  render(<Questions admin={false} />);
  await screen.findByText(/No questions match/);
  expect(screen.queryByRole('button', { name: 'Create question' })).toBeNull();
  await userEvent.type(screen.getByLabelText('Search'), 'joins');
  await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'hard');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([u]) => String(u).includes('q=joins') && String(u).includes('difficulty=hard'),
        ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/bookmarks'))).toBe(
      true,
    ),
  );
});
it('admin question editor sends rubric fields and exits only after successful persistence', async () => {
  vi.mocked(fetch).mockImplementation(async (_url, init) =>
    reply(init?.method === 'POST' ? { id: 'new' } : { items: [], nextCursor: null }),
  );
  render(<Questions admin />);
  await userEvent.click(screen.getByRole('button', { name: 'Create question' }));
  for (const [label, val] of [
    ['Title', 'Join review'],
    ['Prompt', 'Explain joins'],
    ['Skills (comma separated, 1–5)', 'SQL, APIs'],
    ['Explanation', 'Use key relationships'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value: val } });
  await userEvent.click(screen.getByRole('button', { name: 'Save question' }));
  await waitFor(() => expect(screen.queryByLabelText('Prompt')).toBeNull());
  const post = vi.mocked(fetch).mock.calls.find(([u]) => u === '/api/admin/questions');
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
    title: 'Join review',
    skills: ['SQL', 'APIs'],
    explanation: 'Use key relationships',
  });
});
it('reports have private review/download routes and empty reports have useful guidance', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(reply({ items: [] }));
  const view = render(<Reports />);
  await screen.findByText(/No saved reports yet/);
  view.unmount();
  vi.mocked(fetch).mockResolvedValueOnce(
    reply({
      items: [
        {
          id: 'a',
          type: 'InterviewPractice',
          title: 'SQL practice',
          score: 70,
          submittedAt: 'Today',
        },
      ],
    }),
  );
  render(<Reports />);
  await screen.findByText('SQL practice');
  expect(screen.getByRole('link', { name: 'Download JSON' }).getAttribute('href')).toBe(
    '/reports/download/a?type=InterviewPractice',
  );
});
it('report authorization failures expose no saved report HTML', async () => {
  vi.mocked(fetch).mockResolvedValue(reply({ error: 'Report not found' }, 404));
  render(<ReportView id="other-user" />);
  await screen.findByRole('alert');
  expect(document.querySelector('.report-html')).toBeNull();
});
it('resume and matching empty states remain useful and forms stay labelled', async () => {
  vi.mocked(fetch).mockResolvedValue(reply({ items: [], nextCursor: null }));
  const view = render(<Resumes />);
  await screen.findByLabelText('Resume title');
  expect(screen.getByLabelText(/Resume text/)).toBeTruthy();
  view.unmount();
  render(<Matching />);
  await screen.findByText(/No saved matches/);
});
it('progress keeps analytics window and AI-only history explicit and saves a real study goal', async () => {
  const overview = {
    window: { description: 'Latest 200 attempts; use history for older attempts.' },
    summary: { attempts: 0, averageScore: null, sessionsLast7Days: 0 },
    skills: [],
    comparisons: [],
    codingPractice: { description: 'AI estimates are not executable tests', skills: [] },
    recommendations: [],
    goals: [],
  };
  vi.mocked(fetch).mockImplementation(async (url) =>
    reply(String(url).includes('overview') ? overview : { items: [], nextCursor: null }),
  );
  render(<ProgressScreen />);
  await screen.findByLabelText('Skill');
  expect(screen.getByText(overview.window.description)).toBeTruthy();
  await userEvent.type(screen.getByLabelText('Skill'), 'SQL');
  await userEvent.click(screen.getByRole('button', { name: 'Save goal' }));
  await waitFor(() =>
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([u, init]) =>
            u === '/api/progress/goals' && JSON.parse(String(init?.body)).skill === 'SQL',
        ),
    ).toBe(true),
  );
});

import { Coding } from '../src/Coding';
it('coding saves an owner draft, protects dirty edits and labels AI feedback as not executed', async () => {
  const problem = {
    id: 'review',
    title: 'Reviewed original',
    category: 'arrays',
    difficulty: 'easy',
    topics: ['maps'],
    prompt: 'Group items',
    examples: ['a -> a'],
    edgeCases: ['Empty input'],
    starter: { javascript: 'function group() {}', python: 'def group(): pass' },
    solution: 'Use a map',
  };
  let code = '',
    revision = 0;
  vi.stubGlobal(
    'confirm',
    vi.fn(() => false),
  );
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).includes('/drafts/')) {
      if (init?.method === 'PUT') {
        code = JSON.parse(String(init.body)).code;
        revision++;
      }
      return reply({ code, revision });
    }
    if (init?.method === 'POST')
      return reply({
        submission: {
          id: 'review1',
          problem,
          code,
          feedback: {
            score: 72,
            summary: 'Consider empty input',
            improvements: ['Document invariants'],
          },
          canRetry: false,
        },
      });
    if (String(url).includes('/problems'))
      return reply({
        items: [problem],
        total: 1,
        filters: { categories: ['arrays'], topics: ['maps'] },
      });
    return reply({ items: [], nextCursor: null });
  });
  render(<Coding />);
  await userEvent.click(await screen.findByRole('button', { name: 'Open problem' }));
  const editor = await screen.findByLabelText('Your private solution');
  await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe('function group() {}'));
  fireEvent.change(editor, { target: { value: 'const grouped = new Map();' } });
  await userEvent.selectOptions(screen.getByLabelText('Language'), 'python');
  expect(confirm).toHaveBeenCalled();
  expect((editor as HTMLTextAreaElement).value).toBe('const grouped = new Map();');
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText('Saved draft revision 1');
  await userEvent.click(screen.getByRole('button', { name: 'Submit for AI review' }));
  await screen.findByText('AI estimate: 72%');
  expect(screen.getByText('Execution disabled. No executable tests were run.')).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/execute'))).toBe(false);
});
