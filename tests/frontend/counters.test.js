/**
 * Sentiment Pulse - Counters Subsystem Unit Tests (counters.test.js)
 * Tests CountUp adapter, reduced-motion bypass, safe fallback, formatting, and duplicate prevention.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Counters } from '../../static/js/lib/motion/counters.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';
import { VendorLoader } from '../../static/js/lib/motion/vendor-loader.js';

describe('Counters Subsystem', () => {
  let mockElement;

  beforeEach(() => {
    AnimationManager.setReducedMotion(false);
    VendorLoader.clearCache();

    mockElement = {
      textContent: '0',
      dataset: {},
      attributes: {},
      getAttribute(k) {
        return this.attributes[k] || null;
      },
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
    };
  });

  afterEach(() => {
    AnimationManager.setReducedMotion(false);
    VendorLoader.clearCache();
  });

  describe('Value Parsing & Formatting', () => {
    it('parses plain integers correctly', () => {
      const parsed = Counters.parseValue(1245);
      assert.strictEqual(parsed.num, 1245);
      assert.strictEqual(parsed.prefix, '');
      assert.strictEqual(parsed.suffix, '');
      assert.strictEqual(parsed.decimals, 0);
    });

    it('parses formatted strings with commas', () => {
      const parsed = Counters.parseValue('1,245');
      assert.strictEqual(parsed.num, 1245);
      assert.strictEqual(parsed.decimals, 0);
    });

    it('parses percentages with decimals', () => {
      const parsed = Counters.parseValue('73.4%');
      assert.strictEqual(parsed.num, 73.4);
      assert.strictEqual(parsed.suffix, '%');
      assert.strictEqual(parsed.decimals, 1);
    });

    it('formats numbers with grouping and suffixes accurately', () => {
      const formatted = Counters.format(1245, { useGrouping: true, suffix: ' items' });
      assert.strictEqual(formatted, '1,245 items');

      const pct = Counters.format(85.6, { decimals: 1, suffix: '%' });
      assert.strictEqual(pct, '85.6%');
    });
  });

  describe('Reduced Motion Mode', () => {
    it('renders final value immediately without loading CountUp under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);

      let loaderCalled = false;
      const origLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async (k) => {
        loaderCalled = true;
        return origLoad(k);
      };

      try {
        await Counters.animate(mockElement, '73.4%');
        assert.strictEqual(mockElement.textContent, '73.4%');
        assert.strictEqual(loaderCalled, false, 'VendorLoader should not be called under reduced motion');
      } finally {
        VendorLoader.loadVendor = origLoad;
      }
    });
  });

  describe('CountUp Fallback (Unavailable Vendor)', () => {
    it('gracefully renders final formatted value when CountUp fails to load', async () => {
      const origLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async () => null;

      try {
        await Counters.animate(mockElement, 1245);
        assert.strictEqual(mockElement.textContent, '1,245');
      } finally {
        VendorLoader.loadVendor = origLoad;
      }
    });
  });

  describe('CountUp Success & Lifecycle', () => {
    it('invokes CountUp and sets exact final text upon completion', async () => {
      let started = false;

      class MockCountUp {
        constructor(el, endVal, options) {
          this.el = el;
          this.endVal = endVal;
          this.options = options;
          this.error = null;
        }

        start(cb) {
          started = true;
          this.el.textContent = '1,245';
          if (cb) cb();
        }
      }

      const origLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async () => MockCountUp;

      try {
        await Counters.animate(mockElement, 1245);
        assert.strictEqual(started, true);
        assert.strictEqual(mockElement.textContent, '1,245');
      } finally {
        VendorLoader.loadVendor = origLoad;
      }
    });
  });

  describe('Duplicate Animation Prevention', () => {
    it('skips animation if element already displays the target numeric value', async () => {
      let countUpCalls = 0;

      class MockCountUp {
        constructor(el, endVal) {
          countUpCalls++;
          this.el = el;
          this.endVal = endVal;
        }
        start(cb) {
          if (cb) cb();
        }
      }

      const origLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async () => MockCountUp;

      try {
        await Counters.animate(mockElement, 50);
        assert.strictEqual(countUpCalls, 1);
        assert.strictEqual(mockElement.dataset.counterValue, '50');

        // Second call with same value
        await Counters.animate(mockElement, 50);
        assert.strictEqual(countUpCalls, 1, 'CountUp should not be called again for duplicate value');
      } finally {
        VendorLoader.loadVendor = origLoad;
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles null, undefined or missing targets safely', async () => {
      await Counters.animate(null, 100);
      await Counters.animate(undefined, 100);
      // Passes if no exception thrown
      assert.ok(true);
    });
  });
});
