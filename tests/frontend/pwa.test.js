/**
 * Tests for PWA & Offline Shell Helpers (pwa-helpers.js)
 * Verified via Node.js native test runner: node --test tests/frontend/pwa.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHELL_CACHE_PREFIX,
  DEFAULT_SHELL_VERSION,
  getCacheName,
  SHELL_ASSETS,
  isApiRequest,
  isStaticAsset,
  shouldBypassCache,
  getObsoleteCaches,
  createOfflineStateManager,
} from '../../static/js/lib/pwa-helpers.js';

describe('PWA & Offline Shell Helpers', () => {
  describe('Cache Version Generation', () => {
    it('generates the default deterministic cache name', () => {
      assert.equal(SHELL_CACHE_PREFIX, 'sentiment-pulse-shell-');
      assert.equal(DEFAULT_SHELL_VERSION, 'v4');
      assert.equal(getCacheName(), 'sentiment-pulse-shell-v4');
      assert.equal(getCacheName(''), 'sentiment-pulse-shell-v4');
      assert.equal(getCacheName(null), 'sentiment-pulse-shell-v4');
    });

    it('generates a versioned cache name when a specific version is provided', () => {
      assert.equal(getCacheName('v5'), 'sentiment-pulse-shell-v5');
      assert.equal(getCacheName('2026-10-15'), 'sentiment-pulse-shell-2026-10-15');
      assert.equal(getCacheName('  v6  '), 'sentiment-pulse-shell-v6');
    });

    it('includes essential local shell assets in the pre-cache list', () => {
      assert.ok(Array.isArray(SHELL_ASSETS));
      assert.ok(SHELL_ASSETS.includes('/'));
      assert.ok(SHELL_ASSETS.includes('/static/manifest.webmanifest'));
      assert.ok(SHELL_ASSETS.includes('/static/css/tailwind.min.css'));
      assert.ok(SHELL_ASSETS.includes('/static/css/app.css'));
      assert.ok(SHELL_ASSETS.includes('/static/css/motion-tokens.css'));
      assert.ok(SHELL_ASSETS.includes('/static/css/skeletons.css'));
      assert.ok(SHELL_ASSETS.includes('/static/js/app.js'));
      assert.ok(SHELL_ASSETS.includes('/static/icons/icon-192x192.png'));
      assert.ok(SHELL_ASSETS.includes('/static/icons/icon-512x512.png'));
      assert.ok(SHELL_ASSETS.includes('/static/icons/icon-maskable-192x192.png'));
      assert.ok(SHELL_ASSETS.includes('/static/icons/icon-maskable-512x512.png'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/animation.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/vendor-loader.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/presets.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/reveal.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/transitions.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/counters.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/skeletons.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/motion/charts-motion.js'));
      assert.ok(SHELL_ASSETS.includes('/static/js/lib/vendor/vendor.manifest.json'));
    });
  });

  describe('API Request Exclusions (Sensitive Data & ML Inference)', () => {
    it('flags single prediction endpoint as API', () => {
      assert.equal(isApiRequest('/predict'), true);
      assert.equal(isApiRequest('http://127.0.0.1:8000/predict'), true);
    });

    it('flags batch prediction endpoint as API', () => {
      assert.equal(isApiRequest('/predict/batch'), true);
      assert.equal(isApiRequest('http://localhost:8000/predict/batch'), true);
    });

    it('flags feedback endpoints as API', () => {
      assert.equal(isApiRequest('/feedback'), true);
      assert.equal(isApiRequest('/feedback/123'), true);
      assert.equal(isApiRequest('/feedback/analytics'), true);
      assert.equal(isApiRequest('/feedback/stats'), true);
    });

    it('flags generic API routes as API', () => {
      assert.equal(isApiRequest('/api/analytics'), true);
      assert.equal(isApiRequest('/api/import'), true);
      assert.equal(isApiRequest('/api/export'), true);
    });

    it('flags server metadata and documentation routes as API', () => {
      assert.equal(isApiRequest('/health'), true);
      assert.equal(isApiRequest('/docs'), true);
      assert.equal(isApiRequest('/openapi.json'), true);
    });

    it('does not classify static shell assets as API', () => {
      assert.equal(isApiRequest('/'), false);
      assert.equal(isApiRequest('/static/css/app.css'), false);
      assert.equal(isApiRequest('/static/js/app.js'), false);
      assert.equal(isApiRequest('/static/manifest.webmanifest'), false);
    });
  });

  describe('Static Asset Classification (Cache-First Shell)', () => {
    it('classifies root HTML document as static asset', () => {
      assert.equal(isStaticAsset('/'), true);
      assert.equal(isStaticAsset('/index.html'), true);
      assert.equal(isStaticAsset('http://localhost:8000/'), true);
    });

    it('classifies local static scripts, styles, and manifests as static assets', () => {
      assert.equal(isStaticAsset('/static/css/app.css'), true);
      assert.equal(isStaticAsset('/static/js/app.js'), true);
      assert.equal(isStaticAsset('/static/theme.js'), true);
      assert.equal(isStaticAsset('/static/manifest.webmanifest'), true);
    });

    it('classifies PWA icons as static assets', () => {
      assert.equal(isStaticAsset('/static/icons/icon-192x192.png'), true);
      assert.equal(isStaticAsset('/static/icons/icon-512x512.png'), true);
      assert.equal(isStaticAsset('/static/icons/icon-maskable-192x192.png'), true);
    });

    it('classifies verified CDNs as static assets', () => {
      assert.equal(
        isStaticAsset('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap'),
        true
      );
      assert.equal(isStaticAsset('https://cdn.tailwindcss.com'), true);
      assert.equal(
        isStaticAsset('https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js'),
        true
      );
    });

    it('rejects dynamic API endpoints from static classification', () => {
      assert.equal(isStaticAsset('/predict'), false);
      assert.equal(isStaticAsset('/predict/batch'), false);
      assert.equal(isStaticAsset('/feedback'), false);
      assert.equal(isStaticAsset('/api/analytics'), false);
    });
  });

  describe('Cache Bypass Enforcement (Security & Privacy)', () => {
    it('bypasses cache for POST, PUT, DELETE, and PATCH methods', () => {
      assert.equal(shouldBypassCache({ method: 'POST', url: '/predict' }), true);
      assert.equal(shouldBypassCache({ method: 'PUT', url: '/feedback/1' }), true);
      assert.equal(shouldBypassCache({ method: 'DELETE', url: '/feedback/1' }), true);
    });

    it('bypasses cache for requests with Authorization headers', () => {
      const authRequest = {
        method: 'GET',
        url: '/static/css/app.css',
        headers: {
          has: (name) => name.toLowerCase() === 'authorization',
        },
      };
      assert.equal(shouldBypassCache(authRequest), true);
    });

    it('bypasses cache for any API GET requests', () => {
      assert.equal(shouldBypassCache({ method: 'GET', url: '/feedback?page=1' }), true);
      assert.equal(shouldBypassCache({ method: 'GET', url: '/health' }), true);
      assert.equal(shouldBypassCache({ method: 'GET', url: '/api/analytics' }), true);
    });

    it('permits caching for unauthenticated GET requests to static shell assets', () => {
      const staticReq = {
        method: 'GET',
        url: 'http://localhost:8000/static/js/app.js',
        headers: {
          has: () => false,
        },
      };
      assert.equal(shouldBypassCache(staticReq), false);
    });
  });

  describe('Obsolete Cache Cleanup Logic', () => {
    it('identifies and marks only obsolete Sentiment Pulse shell caches for deletion', () => {
      const allCaches = [
        'sentiment-pulse-shell-v0',
        'sentiment-pulse-shell-beta',
        'sentiment-pulse-shell-v1', // current
        'other-app-cache-v1', // unrelated cache, must NOT delete
      ];

      const obsolete = getObsoleteCaches(allCaches, 'sentiment-pulse-shell-v1');
      assert.deepEqual(obsolete, ['sentiment-pulse-shell-v0', 'sentiment-pulse-shell-beta']);
    });

    it('safely purges v3 caches upon upgrading to v4 active shell', () => {
      const allCaches = [
        'sentiment-pulse-shell-v3',
        'sentiment-pulse-shell-v4',
        'user-local-storage-backup',
      ];
      const obsolete = getObsoleteCaches(allCaches, 'sentiment-pulse-shell-v4');
      assert.deepEqual(obsolete, ['sentiment-pulse-shell-v3']);
    });

    it('returns empty array when all caches match the active cache version', () => {
      const allCaches = ['sentiment-pulse-shell-v1'];
      assert.deepEqual(getObsoleteCaches(allCaches, 'sentiment-pulse-shell-v1'), []);
    });

    it('handles empty or invalid cache lists safely', () => {
      assert.deepEqual(getObsoleteCaches([]), []);
      assert.deepEqual(getObsoleteCaches(null), []);
      assert.deepEqual(getObsoleteCaches(undefined), []);
    });
  });

  describe('Offline State Manager', () => {
    it('initializes with default online state and tracks status transitions', () => {
      const manager = createOfflineStateManager(true);
      assert.equal(manager.isOnline(), true);

      let notifiedOnline = null;
      const unsubscribe = manager.subscribe((status) => {
        notifiedOnline = status;
      });

      manager.setOnline(false);
      assert.equal(manager.isOnline(), false);
      assert.equal(notifiedOnline, false);

      manager.setOnline(true);
      assert.equal(manager.isOnline(), true);
      assert.equal(notifiedOnline, true);

      unsubscribe();
      manager.setOnline(false);
      // Unsubscribed: listener is not called again
      assert.equal(notifiedOnline, true);
    });
  });
});
