import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuidedRound, LegacyCoding, MockTests, OneOffTool } from '../src/Legacy';
import { Dictation } from '../src/Dictation';
import { reply, mockFetch } from './journeySetup';
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
