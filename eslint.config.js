const js = require('@eslint/js');
const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', '.cache/**', 'coverage/**', 'temp/**'] },
  js.configs.recommended,
  { files: ['public/**/*.js', 'tests/browser.test.js', 'scripts/demo-screenshots.js'], languageOptions: { globals: globals.browser } },
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } }
];
