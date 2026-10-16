/**
 * Sentiment Pulse - PWA & Cache Helper Logic (pwa-helpers.js)
 * Pure, framework-free helpers for Service Worker lifecycle, URL routing,
 * cache safety rules, and offline state management.
 */

export const SHELL_CACHE_PREFIX = 'sentiment-pulse-shell-';
export const DEFAULT_SHELL_VERSION = 'v4';

/**
 * Generate versioned cache name.
 * @param {string} [version=DEFAULT_SHELL_VERSION]
 * @returns {string} e.g. "sentiment-pulse-shell-v4"
 */
export function getCacheName(version = DEFAULT_SHELL_VERSION) {
  const v = version ? String(version).trim() : DEFAULT_SHELL_VERSION;
  return `${SHELL_CACHE_PREFIX}${v}`;
}

export const SHELL_ASSETS = [
  '/',
  '/static/manifest.webmanifest',
  '/static/css/tailwind.min.css',
  '/static/css/app.css',
  '/static/css/motion-tokens.css',
  '/static/css/skeletons.css',
  '/static/theme.js',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/icon-maskable-192x192.png',
  '/static/icons/icon-maskable-512x512.png',
  '/static/js/app.js',
  '/static/js/api.js',
  '/static/js/overview.js',
  '/static/js/analyze.js',
  '/static/js/explorer.js',
  '/static/js/analytics.js',
  '/static/js/imports.js',
  '/static/js/history.js',
  '/static/js/explain.js',
  '/static/js/lib/formatters.js',
  '/static/js/lib/chunker.js',
  '/static/js/lib/modal.js',
  '/static/js/lib/idb.js',
  '/static/js/lib/store.js',
  '/static/js/lib/bulk.js',
  '/static/js/lib/confidence.js',
  '/static/js/lib/pwa-helpers.js',
  '/static/js/lib/motion/animation.js',
  '/static/js/lib/motion/vendor-loader.js',
  '/static/js/lib/motion/presets.js',
  '/static/js/lib/motion/reveal.js',
  '/static/js/lib/motion/transitions.js',
  '/static/js/lib/motion/counters.js',
  '/static/js/lib/motion/skeletons.js',
  '/static/js/lib/motion/charts-motion.js',
  '/static/js/lib/motion/micro.js',
  '/static/js/lib/vendor/vendor.manifest.json',
  '/static/js/lib/vendor/gsap.min.js',
  '/static/js/lib/vendor/ScrollTrigger.min.js',
  '/static/js/lib/vendor/Flip.min.js',
  '/static/js/lib/vendor/countup.min.js',
  '/static/js/lib/vendor/split-type.min.js',
  '/static/js/lib/vendor/confetti.min.js',
  '/static/js/lib/vendor/chart.min.js',
  '/static/js/lib/vendor/three.module.js',
  '/static/js/lib/vendor/three.core.js',
  '/static/js/3d/core/fallback-controller.js',
  '/static/js/3d/core/performance-governor.js',
  '/static/js/3d/core/renderer-manager.js',
  '/static/js/3d/core/camera-rig.js',
  '/static/js/3d/core/scene-manager.js',
  '/static/js/3d/scenes/overview-scene.js',
  '/static/js/3d/scenes/analyze-scene.js',
  '/static/js/3d/three-runtime.js',
];

const API_PATH_PREFIXES = ['/predict', '/feedback', '/api', '/health', '/docs', '/openapi.json'];

/**
 * Identify if a request target is a private/dynamic server API that must NEVER be persisted in shell cache.
 * @param {string|URL} urlOrPath
 * @returns {boolean}
 */
export function isApiRequest(urlOrPath) {
  if (!urlOrPath) return false;
  let pathname = '';
  if (typeof urlOrPath === 'string') {
    try {
      const parsed = new URL(urlOrPath, 'http://localhost');
      pathname = parsed.pathname;
    } catch {
      pathname = urlOrPath;
    }
  } else if (urlOrPath instanceof URL) {
    pathname = urlOrPath.pathname;
  } else if (typeof urlOrPath === 'object' && urlOrPath.url) {
    try {
      const parsed = new URL(urlOrPath.url, 'http://localhost');
      pathname = parsed.pathname;
    } catch {
      pathname = urlOrPath.url;
    }
  }

  return API_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

const STATIC_EXTENSIONS = [
  '.css',
  '.js',
  '.mjs',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.ico',
  '.woff2',
  '.woff',
  '.ttf',
  '.webmanifest',
  '.json',
];

const STATIC_HOSTNAMES = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
];

/**
 * Determine if a URL is an application shell or static asset suitable for cache-first strategy.
 * @param {string|URL} urlOrPath
 * @returns {boolean}
 */
export function isStaticAsset(urlOrPath) {
  if (!urlOrPath) return false;
  if (isApiRequest(urlOrPath)) return false;

  let pathname = '';
  let hostname = '';

  if (typeof urlOrPath === 'string') {
    try {
      const parsed = new URL(urlOrPath, 'http://localhost');
      pathname = parsed.pathname;
      hostname = parsed.hostname;
    } catch {
      pathname = urlOrPath;
    }
  } else if (urlOrPath instanceof URL) {
    pathname = urlOrPath.pathname;
    hostname = urlOrPath.hostname;
  }

  if (pathname === '/' || pathname === '/index.html') {
    return true;
  }

  if (pathname.startsWith('/static/')) {
    return true;
  }

  if (STATIC_HOSTNAMES.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    return true;
  }

  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

/**
 * Strict evaluation of whether a Fetch request must bypass the Service Worker cache.
 * Caching is bypassed for non-GET methods, authenticated requests, and all API endpoints.
 * @param {Request|Object} request
 * @returns {boolean}
 */
export function shouldBypassCache(request) {
  if (!request) return true;

  // 1. Only GET requests are eligible for caching
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return true;
  }

  // 2. Never cache authenticated requests
  const headers = request.headers;
  if (headers) {
    if (typeof headers.has === 'function') {
      if (headers.has('Authorization') || headers.has('authorization')) {
        return true;
      }
    } else if (headers.Authorization || headers.authorization) {
      return true;
    }
  }

  // 3. Never cache sensitive/private API requests
  const url = request.url || request;
  if (isApiRequest(url)) {
    return true;
  }

  return false;
}

/**
 * Filter obsolete cache keys during Service Worker activate event.
 * Preserves unrelated browser caches and deletes only older Sentiment Pulse versions.
 * @param {string[]} cacheNames
 * @param {string} currentCache
 * @returns {string[]} Obsolete cache names to be purged
 */
export function getObsoleteCaches(cacheNames, currentCache = getCacheName()) {
  if (!Array.isArray(cacheNames)) return [];
  return cacheNames.filter((name) => {
    return typeof name === 'string' && name.startsWith(SHELL_CACHE_PREFIX) && name !== currentCache;
  });
}

/**
 * Pure state transition manager for online/offline events.
 * @param {boolean} [initialOnline=true]
 * @returns {Object}
 */
export function createOfflineStateManager(initialOnline = true) {
  let isOnline = Boolean(initialOnline);
  const listeners = new Set();

  return {
    isOnline() {
      return isOnline;
    },
    setOnline(nextState) {
      const changed = isOnline !== Boolean(nextState);
      isOnline = Boolean(nextState);
      if (changed) {
        listeners.forEach((fn) => fn(isOnline));
      }
      return isOnline;
    },
    subscribe(listener) {
      if (typeof listener === 'function') {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
      return () => {};
    },
  };
}

if (typeof window !== 'undefined') {
  window.PWAHelpers = {
    SHELL_CACHE_PREFIX,
    DEFAULT_SHELL_VERSION,
    getCacheName,
    SHELL_ASSETS,
    isApiRequest,
    isStaticAsset,
    shouldBypassCache,
    getObsoleteCaches,
    createOfflineStateManager,
  };
}
