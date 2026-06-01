import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

// Flat config (ESLint v9+). Aurora is zero-runtime-dependency Node ESM, so the
// rule set stays small and honest: catch real mistakes, defer all formatting to
// Prettier (the `prettier` preset disables stylistic rules that would fight it).
export default [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // An unused arg is fine if it documents a signature; prefix it with _.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Tests use the node:test globals.
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  prettier,
];
