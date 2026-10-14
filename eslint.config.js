import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'venv/**',
      '.pytest_cache/**',
      'alembic/**',
      'reports/**',
      'static/manifest.json',
      '**/*.py'
    ]
  },
  {
    files: ['static/**/*.js', 'tests/frontend/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Chart: 'readonly',
        App: 'writable',
        API: 'writable',
        OverviewController: 'writable',
        AnalyzeController: 'writable',
        ExplorerController: 'writable',
        AnalyticsController: 'writable',
        ImportsController: 'writable'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-undef': 'error'
    }
  }
];
