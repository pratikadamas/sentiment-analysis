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
      'static/js/lib/vendor/**',
      '**/*.py'
    ]
  },
  {
    files: ['static/**/*.js', 'tests/frontend/**/*.js', 'eslint.config.js', 'scripts/**/*.js'],
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
        ImportsController: 'writable',
        AnimationManager: 'writable',
        VendorLoader: 'writable',
        MotionPresets: 'writable',
        RevealEngine: 'writable',
        ViewTransitions: 'writable',
        Counters: 'writable',
        Skeletons: 'writable',
        ChartsMotion: 'writable',
        MicroInteractions: 'writable',
        THREE: 'readonly',
        RendererManager: 'writable',
        CameraRig: 'writable',
        PerformanceGovernor: 'writable',
        FallbackController: 'writable',
        SceneManager: 'writable',
        ThreeRuntime: 'writable',
        OverviewScene: 'writable',
        AnalyzeScene: 'writable'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-undef': 'error'
    }
  }
];
