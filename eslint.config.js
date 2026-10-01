import js from '@eslint/js';

const browser = {
  window: 'readonly', document: 'readonly', location: 'readonly', fetch: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearInterval: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly',
  Node: 'readonly', URL: 'readonly', globalThis: 'readonly', Uint32Array: 'readonly', Map: 'readonly', Set: 'readonly',
  Event: 'readonly', getComputedStyle: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
};
const node = {
  process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', globalThis: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
};

export default [
  { ignores: ['node_modules/**', 'data/**', 'mockups/**', 'src/**'] },
  js.configs.recommended,
  {
    files: ['site/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browser },
    rules: {
      'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error',
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: 'Use h()/text nodes; never parse strings as HTML.' },
        { property: 'outerHTML', message: 'Use h()/text nodes; never parse strings as HTML.' },
        { property: 'insertAdjacentHTML', message: 'Use h()/text nodes; never parse strings as HTML.' }],
      'no-restricted-globals': ['error', { name: 'eval' }],
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...node, ...browser } },
  },
];
