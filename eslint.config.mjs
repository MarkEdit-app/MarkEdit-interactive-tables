import babelParser from '@babel/eslint-parser';

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.{js,mjs,ts,mts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'no-trailing-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
    },
  },
  {
    files: ['**/*.{ts,mts}'],
    languageOptions: {
      // Parse syntax without depending on the legacy TypeScript compiler API
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: {
            plugins: ['typescript'],
          },
        },
      },
    },
  },
];
