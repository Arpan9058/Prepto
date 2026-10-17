import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { reply, mockFetch } from './journeySetup';
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
