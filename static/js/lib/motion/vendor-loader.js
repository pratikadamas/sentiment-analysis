/**
 * Sentiment Pulse - Secure Local Vendor Loader (vendor-loader.js)
 * Loads self-hosted static vendors with SRI integrity, Promise caching, and graceful failure.
 */

// Fallback embedded manifest in case fetch is blocked or offline pre-cache
const EMBEDDED_MANIFEST = {
  gsap: {
    file: 'gsap.min.js',
    version: '3.13.0',
    sha384: 'sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc',
    global: 'gsap',
    tier: 1,
  },
  scrollTrigger: {
    file: 'ScrollTrigger.min.js',
    version: '3.13.0',
    sha384: 'sha384-P8VzCVnT9NBUkMrpcIZrJbA7EBjJvh/fJS6PmP+4nLIM284DtsImIv8D0fFjIkeh',
    global: 'ScrollTrigger',
    tier: 2,
  },
  flip: {
    file: 'Flip.min.js',
    version: '3.13.0',
    sha384: 'sha384-lg3+EgIwmxYq9YD4ix279pdUEasqmOS17fF+2mI/NEg6JHkawYaWYpJ6nKZenPOy',
    global: 'Flip',
    tier: 2,
  },
  countUp: {
    file: 'countup.min.js',
    version: '2.8.0',
    sha384: 'sha384-DsT1q/+aTIkNUICSMoPHLh8RDdgN2BaPm3ThHPGAuETCIdf1vPGwFsoMy/SrKZ7W',
    global: 'countUp',
    tier: 2,
  },
  splitType: {
    file: 'split-type.min.js',
    version: '0.3.4',
    sha384: 'sha384-wQImCCD/id1jPTwSloatzKlEpnEAQ5aH8H2Ud27FnNcJ1lf2+hB75ctoWnWxyD8X',
    global: 'SplitType',
    tier: 2,
  },
  confetti: {
    file: 'confetti.min.js',
    version: '1.9.3',
    sha384: 'sha384-/Ko/tqVwPYurnBe+Mj8WWw+39WmyOZn/kU+neqXn4hRxGI575k07mB/hIekAT51+',
    global: 'confetti',
    tier: 3,
  },
  chart: {
    file: 'chart.min.js',
    version: '4.4.2',
    sha384: 'sha384-zuFoHkJ6+XzUchVtS39qBWxb+LvdA7aQ/ze8jYdufBf/A1jeuKGDBg4crfxvZAr8',
    global: 'Chart',
    tier: 2,
  },
};

export const VendorLoader = {
  _promises: new Map(),
  _manifest: EMBEDDED_MANIFEST,
  _manifestLoaded: false,
  _vendorBasePath: '/static/js/lib/vendor/',

  /**
   * Override or load manifest dynamically.
   * @param {Object} [manifestData]
   */
  setManifest(manifestData) {
    if (manifestData && typeof manifestData === 'object') {
      this._manifest = manifestData;
      this._manifestLoaded = true;
    } else {
      this._manifest = EMBEDDED_MANIFEST;
      this._manifestLoaded = false;
    }
  },

  /**
   * Set base directory for vendor scripts.
   * @param {string} path
   */
  setBasePath(path) {
    if (typeof path === 'string') {
      this._vendorBasePath = path.endsWith('/') ? path : `${path}/`;
    }
  },

  /**
   * Retrieve vendor manifest, fetching from server if available in browser.
   * @returns {Promise<Object>}
   */
  async getManifest() {
    if (this._manifestLoaded && this._manifest) {
      return this._manifest;
    }

    // Only attempt relative URL fetch in real browser window context with document
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch(`${this._vendorBasePath}vendor.manifest.json`);
        if (res.ok) {
          const json = await res.json();
          this._manifest = json;
          this._manifestLoaded = true;
          return this._manifest;
        }
      } catch (err) {
        console.warn('[VendorLoader] Could not fetch remote manifest, using embedded default:', err);
      }
    }

    this._manifestLoaded = true;
    return this._manifest;
  },

  /**
   * Resolve the global instance from window.
   * @param {string} vendorKey
   * @returns {any}
   */
  getGlobal(vendorKey) {
    if (typeof window === 'undefined') return null;

    const normalizedKey = String(vendorKey).toLowerCase();

    if (normalizedKey === 'gsap') return window.gsap || null;
    if (normalizedKey === 'scrolltrigger') return window.ScrollTrigger || null;
    if (normalizedKey === 'flip') return window.Flip || null;
    if (normalizedKey === 'split-type' || normalizedKey === 'splittype') return window.SplitType || null;
    if (normalizedKey === 'confetti') return window.confetti || null;
    if (normalizedKey === 'chart') return window.Chart || null;
    if (normalizedKey === 'countup') {
      return window.CountUp || (window.countUp && window.countUp.CountUp) || window.countUp || null;
    }

    const meta = this._manifest[vendorKey];
    if (meta && meta.global && window[meta.global]) {
      return window[meta.global];
    }

    return window[vendorKey] || null;
  },

  /**
   * Lazily loads a vendor library with SRI verification and Promise caching.
   * Synchronously registers the Promise in the cache to avoid race conditions.
   * @param {string} vendorKey
   * @returns {Promise<any>} Resolves with the global library object, or null on failure.
   */
  loadVendor(vendorKey) {
    if (!vendorKey) return Promise.resolve(null);

    // Check if already cached in Promise map
    if (this._promises.has(vendorKey)) {
      return this._promises.get(vendorKey);
    }

    // Check if already available on window
    const existing = this.getGlobal(vendorKey);
    if (existing) {
      const resolvedPromise = Promise.resolve(existing);
      this._promises.set(vendorKey, resolvedPromise);
      return resolvedPromise;
    }

    const loadPromise = (async () => {
      const manifest = await this.getManifest();
      const meta =
        manifest[vendorKey] ||
        manifest[String(vendorKey).toLowerCase()] ||
        Object.values(manifest).find(
          (m) =>
            m.file === vendorKey ||
            m.file === `${vendorKey}.min.js` ||
            m.global?.toLowerCase() === String(vendorKey).toLowerCase()
        );

      if (!meta || !meta.file) {
        console.warn(`[VendorLoader] Unknown vendor "${vendorKey}". Aborting load.`);
        return null;
      }

      // Security requirement: strictly resolve to local static path. Never construct CDN URL.
      const localUrl = `${this._vendorBasePath}${meta.file}`;

      if (typeof document === 'undefined') {
        // Non-browser / Node test environment
        return this.getGlobal(vendorKey);
      }

      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = localUrl;
        if (meta.sha384) {
          script.integrity = meta.sha384;
        }
        script.crossOrigin = 'anonymous';
        script.async = true;

        script.onload = () => {
          const library = this.getGlobal(vendorKey);
          resolve(library || true);
        };

        script.onerror = (err) => {
          console.warn(`[VendorLoader] Failed to load local vendor "${vendorKey}" from ${localUrl}:`, err);
          // Never throw or crash the application on animation vendor failure
          resolve(null);
        };

        document.head.appendChild(script);
      });
    })();

    this._promises.set(vendorKey, loadPromise);
    return loadPromise;
  },

  /**
   * Clear cached promises and reset manifest (primarily for testing).
   */
  clearCache() {
    this._promises.clear();
    this._manifest = EMBEDDED_MANIFEST;
    this._manifestLoaded = false;
  },
};

if (typeof window !== 'undefined') {
  window.VendorLoader = VendorLoader;
}

export default VendorLoader;
