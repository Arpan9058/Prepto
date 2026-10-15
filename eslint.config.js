const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', '.cache/**', 'coverage/**', 'temp/**', 'frontend/dist/**'] },
  js.configs.recommended,
  {
    files: [
      'public/**/*.js',
      'tests/browser.test.js',
      'tests/react.test.js',
      'scripts/demo-screenshots.js',
      'scripts/react-screenshots.js',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/tests/**/*.tsx', 'types/**/*.d.ts'],
  })),
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/tests/**/*.tsx', 'types/**/*.d.ts'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['frontend/tests/**/*.tsx', 'types/**/*.d.ts'],
    languageOptions: { sourceType: 'module', globals: globals.browser },
  },
  { files: ['frontend/*.mjs'], languageOptions: { sourceType: 'module' } },
];
