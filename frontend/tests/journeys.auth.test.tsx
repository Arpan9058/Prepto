import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Root } from '../src/App';
import { Auth } from '../src/Auth';
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
import { reply, mockFetch } from './journeySetup';
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
