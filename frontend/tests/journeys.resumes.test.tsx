import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResumeVersions, Matching } from '../src/Resumes';
import { reply, mockFetch } from './journeySetup';
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
