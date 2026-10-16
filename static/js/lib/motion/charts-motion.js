/**
 * Sentiment Pulse - Charts Motion & ScrollTrigger Integration (charts-motion.js)
 * Orchestrates Chart.js animation presets, reduced-motion bypass, ScrollTrigger lazy loading,
 * visibility-triggered animations, and strict lifecycle destruction.
 */

import { AnimationManager } from './animation.js';
import { VendorLoader } from './vendor-loader.js';

export const ChartsMotion = {
  _chartInstances: new Map(), // viewName -> Set of Chart instances
  _scrollTriggers: new Map(), // viewName -> Set of ScrollTrigger instances
  _scrollTriggerPromise: null,

  /**
   * Check if reduced motion is enabled.
   * @returns {boolean}
   */
  isReducedMotion() {
    return Boolean(
      AnimationManager && typeof AnimationManager.isReducedMotion === 'function'
        ? AnimationManager.isReducedMotion()
        : false
    );
  },

  /**
   * Lazily loads ScrollTrigger via VendorLoader.
   * @returns {Promise<any>}
   */
  async ensureScrollTrigger() {
    if (typeof window !== 'undefined' && window.ScrollTrigger) {
      return window.ScrollTrigger;
    }

    if (this._scrollTriggerPromise) {
      return this._scrollTriggerPromise;
    }

    this._scrollTriggerPromise = (async () => {
      try {
        const [gsap, st] = await Promise.all([
          AnimationManager.ensureGSAP(),
          VendorLoader.loadVendor('scrollTrigger'),
        ]);

        if (gsap && st && typeof gsap.registerPlugin === 'function') {
          gsap.registerPlugin(st);
        }
        return st;
      } catch (err) {
        console.warn('[ChartsMotion] Failed to load ScrollTrigger:', err);
        return null;
      }
    })();

    return this._scrollTriggerPromise;
  },

  /**
   * Generate Chart.js animation configuration options.
   * Centralizes durations, easings, staged delays, and reduced-motion zeroing.
   * @param {string} chartType - 'bar' | 'doughnut' | 'stagedBar'
   * @param {Object} [customOptions={}]
   * @returns {Object}
   */
  getAnimationConfig(chartType = 'bar', customOptions = {}) {
    if (this.isReducedMotion()) {
      return { animation: false };
    }

    if (chartType === 'doughnut') {
      return {
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 750,
          easing: 'easeOutQuart',
          ...customOptions,
        },
      };
    }

    if (chartType === 'stagedBar') {
      return {
        animation: {
          duration: 600,
          easing: 'easeOutQuart',
          delay(context) {
            let delay = 0;
            if (context.type === 'data' && context.mode === 'default') {
              delay = context.dataIndex * 35 + context.datasetIndex * 120;
            }
            return delay;
          },
          ...customOptions,
        },
      };
    }

    // Default bar / standard
    return {
      animation: {
        duration: 550,
        easing: 'easeOutQuart',
        ...customOptions,
      },
    };
  },

  /**
   * Register a Chart instance under a view lifecycle.
   * @param {string} viewName
   * @param {any} chartInstance
   */
  registerChart(viewName, chartInstance) {
    if (!viewName || !chartInstance) return;
    if (!this._chartInstances.has(viewName)) {
      this._chartInstances.set(viewName, new Set());
    }
    this._chartInstances.get(viewName).add(chartInstance);
  },

  /**
   * Register a ScrollTrigger instance under a view lifecycle.
   * @param {string} viewName
   * @param {any} triggerInstance
   */
  registerScrollTrigger(viewName, triggerInstance) {
    if (!viewName || !triggerInstance) return;
    if (!this._scrollTriggers.has(viewName)) {
      this._scrollTriggers.set(viewName, new Set());
    }
    this._scrollTriggers.get(viewName).add(triggerInstance);
  },

  /**
   * Setup visibility-triggered chart animation using ScrollTrigger.
   * If reduced-motion is active or ScrollTrigger is unavailable, runs onVisible immediately.
   * @param {Element|string} targetEl
   * @param {Function} onVisible
   * @param {string} [viewName='analytics']
   * @returns {Promise<any>}
   */
  async observeVisibility(targetEl, onVisible, viewName = 'analytics') {
    const el =
      typeof targetEl === 'string' && typeof document !== 'undefined'
        ? document.getElementById(targetEl) || document.querySelector(targetEl)
        : targetEl;

    if (!el || typeof onVisible !== 'function') return null;

    if (this.isReducedMotion()) {
      onVisible();
      return null;
    }

    const ScrollTrigger = await this.ensureScrollTrigger();
    if (!ScrollTrigger || typeof ScrollTrigger.create !== 'function') {
      onVisible();
      return null;
    }

    try {
      const trigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => {
          onVisible();
        },
      });

      this.registerScrollTrigger(viewName, trigger);
      return trigger;
    } catch (err) {
      console.warn('[ChartsMotion] ScrollTrigger creation error:', err);
      onVisible();
      return null;
    }
  },

  /**
   * Clean up all Chart and ScrollTrigger instances for a view.
   * @param {string} viewName
   */
  cleanup(viewName = 'analytics') {
    // 1. Destroy Chart.js instances
    if (this._chartInstances.has(viewName)) {
      const set = this._chartInstances.get(viewName);
      set.forEach((chart) => {
        try {
          if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
          }
        } catch (err) {
          console.warn(`[ChartsMotion] Error destroying chart in ${viewName}:`, err);
        }
      });
      set.clear();
    }

    // 2. Kill ScrollTrigger instances
    if (this._scrollTriggers.has(viewName)) {
      const set = this._scrollTriggers.get(viewName);
      set.forEach((st) => {
        try {
          if (st && typeof st.kill === 'function') {
            st.kill();
          }
        } catch (err) {
          console.warn(`[ChartsMotion] Error killing ScrollTrigger in ${viewName}:`, err);
        }
      });
      set.clear();
    }
  },
};

if (typeof window !== 'undefined') {
  window.ChartsMotion = ChartsMotion;
}

export default ChartsMotion;
