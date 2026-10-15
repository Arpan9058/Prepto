import { defineConfig } from 'vitest/config';
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom', setupFiles: ['tests/setup.js'], include: ['frontend/tests/**/*.test.tsx'],
    coverage: { provider: 'v8', include: ['frontend/src/**/*.{ts,tsx}'], exclude: ['frontend/src/domain.ts'], reportsDirectory: 'coverage/react', reporter: ['text', 'json-summary', 'lcov'], thresholds: { statements: 40, branches: 40, functions: 43, lines: 43, 'frontend/src/api.ts': { statements: 100, branches: 80, functions: 100, lines: 100 }, 'frontend/src/ui.tsx': { statements: 90, branches: 70, functions: 90, lines: 95 } } }
  }
});
