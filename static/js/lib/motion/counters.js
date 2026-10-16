/**
 * Sentiment Pulse - Accessible Counter Adapter (counters.js)
 * Wraps CountUp.js with reduced-motion bypass, safe fallback, formatting preservation,
 * duplicate prevention, and screen-reader accessibility.
 */

import { AnimationManager } from './animation.js';
import { VendorLoader } from './vendor-loader.js';

export const Counters = {
  _instances: new WeakMap(),

  /**
   * Parse numeric value and options from element and target value.
   * Supports numbers or formatted strings like "1,245", "73.4%", "0.982".
   * @param {number|string} val
   * @returns {{ num: number, prefix: string, suffix: string, decimals: number, raw: string }}
   */
  parseValue(val) {
    if (typeof val === 'number') {
      const decimals = Number.isInteger(val) ? 0 : String(val).split('.')[1]?.length || 0;
      return { num: val, prefix: '', suffix: '', decimals, raw: String(val) };
    }

    const str = String(val == null ? 0 : val).trim();
    let prefix = '';
    let suffix = '';
    let clean = str;

    if (clean.endsWith('%')) {
      suffix = '%';
      clean = clean.slice(0, -1).trim();
    }
    if (clean.startsWith('$') || clean.startsWith('€') || clean.startsWith('£')) {
      prefix = clean[0];
      clean = clean.slice(1).trim();
    }

    const withoutCommas = clean.replace(/,/g, '');
    const num = parseFloat(withoutCommas) || 0;
    const parts = withoutCommas.split('.');
    const decimals = parts.length > 1 ? parts[1].length : 0;

    return { num, prefix, suffix, decimals, raw: str };
  },

  /**
   * Format a number back to matching string representation.
   * @param {number} num
   * @param {Object} [options]
   * @returns {string}
   */
  format(num, { prefix = '', suffix = '', decimals = 0, useGrouping = true } = {}) {
    const fixed = num.toFixed(decimals);
    let [intPart, decPart] = fixed.split('.');
    if (useGrouping) {
      intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    const body = decPart !== undefined ? `${intPart}.${decPart}` : intPart;
    return `${prefix}${body}${suffix}`;
  },

  /**
   * Animate an element from its current value to the target value.
   * @param {Element|string} target - DOM Element or ID string
   * @param {number|string} targetValue - Target number or formatted string
   * @param {Object} [options={}] - Custom options (duration, decimals, prefix, suffix, formattingFn)
   * @returns {Promise<void>}
   */
  async animate(target, targetValue, options = {}) {
    const el =
      typeof target === 'string' && typeof document !== 'undefined'
        ? document.getElementById(target) || document.querySelector(target)
        : target;

    if (!el) return Promise.resolve();

    const parsed = this.parseValue(targetValue);
    const prefix = options.prefix !== undefined ? options.prefix : parsed.prefix;
    const suffix = options.suffix !== undefined ? options.suffix : parsed.suffix;
    const decimals =
      options.decimalPlaces !== undefined
        ? options.decimalPlaces
        : options.decimals !== undefined
          ? options.decimals
          : parsed.decimals;
    const useGrouping = options.useGrouping !== undefined ? options.useGrouping : true;
    const duration = options.duration !== undefined ? options.duration : 1.2;

    const finalFormatted =
      typeof options.formattingFn === 'function'
        ? options.formattingFn(parsed.num)
        : options.formatted !== undefined
          ? options.formatted
          : typeof targetValue === 'string' &&
              (targetValue.includes(',') ||
                targetValue.endsWith('%') ||
                targetValue.startsWith('$'))
            ? targetValue
            : this.format(parsed.num, { prefix, suffix, decimals, useGrouping });

    // Accessibility: ensure accessible label has final value for screen readers
    if (typeof el.setAttribute === 'function' && typeof el.getAttribute === 'function') {
      if (!el.getAttribute('aria-label') && (prefix || suffix)) {
        el.setAttribute('aria-label', finalFormatted);
      }
    }

    // Duplicate check: if element is already displaying the same target value, don't re-animate
    const lastValue = el.dataset ? el.dataset.counterValue : null;
    if (lastValue !== null && lastValue !== undefined && String(lastValue) === String(parsed.num)) {
      el.textContent = finalFormatted;
      return Promise.resolve();
    }

    if (el.dataset) {
      el.dataset.counterValue = String(parsed.num);
    }

    // Reduced motion check: render final value immediately
    const isReduced =
      AnimationManager && typeof AnimationManager.isReducedMotion === 'function'
        ? AnimationManager.isReducedMotion()
        : false;

    if (isReduced) {
      el.textContent = finalFormatted;
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return Promise.resolve();
    }

    // Try loading CountUp
    let countUpLib = null;
    try {
      countUpLib = await VendorLoader.loadVendor('countUp');
    } catch (err) {
      console.warn('[Counters] VendorLoader countUp error:', err);
    }

    const CountUpClass =
      typeof countUpLib === 'function'
        ? countUpLib
        : countUpLib && countUpLib.CountUp
          ? countUpLib.CountUp
          : null;

    if (!CountUpClass) {
      // Graceful instant fallback
      el.textContent = finalFormatted;
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        const startVal =
          options.startVal !== undefined
            ? options.startVal
            : lastValue !== null && !isNaN(parseFloat(lastValue))
              ? parseFloat(lastValue)
              : 0;

        const countUpOptions = {
          startVal,
          decimalPlaces: decimals,
          duration,
          useEasing: true,
          useGrouping,
          separator: ',',
          decimal: '.',
          prefix,
          suffix,
          ...options.countUpOptions,
        };

        if (typeof options.formattingFn === 'function') {
          countUpOptions.formattingFn = options.formattingFn;
        }

        const instance = new CountUpClass(el, parsed.num, countUpOptions);

        if (instance.error) {
          console.warn('[Counters] CountUp instance error:', instance.error);
          el.textContent = finalFormatted;
          if (typeof options.onComplete === 'function') {
            options.onComplete();
          }
          resolve();
          return;
        }

        this._instances.set(el, instance);

        instance.start(() => {
          // Guarantee final formatted value
          el.textContent = finalFormatted;
          if (typeof options.onComplete === 'function') {
            options.onComplete();
          }
          resolve();
        });
      } catch (err) {
        console.warn('[Counters] Animation failed, applying fallback:', err);
        el.textContent = finalFormatted;
        if (typeof options.onComplete === 'function') {
          options.onComplete();
        }
        resolve();
      }
    });
  },
};

if (typeof window !== 'undefined') {
  window.Counters = Counters;
}

export default Counters;
