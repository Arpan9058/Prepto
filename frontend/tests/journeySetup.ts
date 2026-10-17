import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
export const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
export const mockFetch = (fn: (url: string, init?: RequestInit) => Promise<Response>) =>
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
