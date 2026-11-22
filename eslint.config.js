const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'web-ext-artifacts/'] },

  js.configs.recommended,

  // The extension: classic browser scripts (not modules) with WebExtension APIs.
  // `no-undef` (from the recommended set) is what catches stale globals like the
  // old OVERDRIVE_BASE constant.
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  // lib.js also exports its helpers to Node for the tests.
  {
    files: ['extension/lib.js'],
    languageOptions: { globals: { module: 'writable' } },
  },

  // Tests, scripts and this config run under Node.
  {
    files: ['test/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
];
