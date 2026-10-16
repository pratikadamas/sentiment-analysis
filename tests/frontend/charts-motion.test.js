/**
 * Sentiment Pulse - ChartsMotion Subsystem Unit Tests (charts-motion.test.js)
 * Tests chart animation presets, reduced-motion bypass, ScrollTrigger loading, visibility hooks, and cleanup.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ChartsMotion } from '../../static/js/lib/motion/charts-motion.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';
import { VendorLoader } from '../../static/js/lib/motion/vendor-loader.js';

describe('ChartsMotion Subsystem', () => {
  beforeEach(() => {
    AnimationManager.setReducedMotion(false);
    VendorLoader.clearCache();
    ChartsMotion.cleanup('analytics');
    ChartsMotion._scrollTriggerPromise = null;
  });

  afterEach(() => {
    AnimationManager.setReducedMotion(false);
    VendorLoader.clearCache();
    ChartsMotion.cleanup('analytics');
    ChartsMotion._scrollTriggerPromise = null;
  });

  describe('Preset Selection & Reduced Motion', () => {
    it('returns { animation: false } when reduced motion is enabled', () => {
      AnimationManager.setReducedMotion(true);

      const doughnutConfig = ChartsMotion.getAnimationConfig('doughnut');
      assert.deepStrictEqual(doughnutConfig, { animation: false });

      const barConfig = ChartsMotion.getAnimationConfig('bar');
      assert.deepStrictEqual(barConfig, { animation: false });

      const stagedConfig = ChartsMotion.getAnimationConfig('stagedBar');
      assert.deepStrictEqual(stagedConfig, { animation: false });
    });

    it('returns doughnut animation configuration with rotation and scaling under normal motion', () => {
      const config = ChartsMotion.getAnimationConfig('doughnut');
      assert.strictEqual(config.animation.animateRotate, true);
      assert.strictEqual(config.animation.animateScale, true);
      assert.strictEqual(config.animation.easing, 'easeOutQuart');
    });

    it('returns staged bar configuration with index-based delay calculation', () => {
      const config = ChartsMotion.getAnimationConfig('stagedBar');
      assert.strictEqual(typeof config.animation.delay, 'function');

      const delay0 = config.animation.delay({
        type: 'data',
        mode: 'default',
        dataIndex: 0,
        datasetIndex: 0,
      });
      const delay1 = config.animation.delay({
        type: 'data',
        mode: 'default',
        dataIndex: 1,
        datasetIndex: 0,
      });
      const delaySet1 = config.animation.delay({
        type: 'data',
        mode: 'default',
        dataIndex: 0,
        datasetIndex: 1,
      });

      assert.strictEqual(delay0, 0);
      assert.ok(delay1 > delay0, 'Later dataIndex should have higher delay');
      assert.ok(delaySet1 > delay0, 'Later datasetIndex should have higher delay');
    });
  });

  describe('ScrollTrigger Visibility & Fallback', () => {
    it('invokes onVisible immediately under reduced motion without waiting for ScrollTrigger', async () => {
      AnimationManager.setReducedMotion(true);

      let visibleInvoked = false;
      const mockElement = {};

      await ChartsMotion.observeVisibility(mockElement, () => {
        visibleInvoked = true;
      });

      assert.strictEqual(visibleInvoked, true);
    });

    it('invokes onVisible immediately when ScrollTrigger fails to load', async () => {
      const origLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async (k) => {
        if (k === 'scrollTrigger') return null;
        return origLoad(k);
      };

      try {
        let visibleInvoked = false;
        await ChartsMotion.observeVisibility({}, () => {
          visibleInvoked = true;
        });

        assert.strictEqual(visibleInvoked, true);
      } finally {
        VendorLoader.loadVendor = origLoad;
      }
    });

    it('registers ScrollTrigger and triggers onEnter callback when available', async () => {
      let createdConfig = null;

      const MockScrollTrigger = {
        create(cfg) {
          createdConfig = cfg;
          return {
            kill() {
              this.killed = true;
            },
          };
        },
      };

      const origEnsure = ChartsMotion.ensureScrollTrigger.bind(ChartsMotion);
      ChartsMotion.ensureScrollTrigger = async () => MockScrollTrigger;

      try {
        let callbackFired = false;
        const trigger = await ChartsMotion.observeVisibility({}, () => {
          callbackFired = true;
        });

        assert.ok(trigger);
        assert.ok(createdConfig);
        assert.strictEqual(callbackFired, false);

        // Simulate ScrollTrigger entrance
        createdConfig.onEnter();
        assert.strictEqual(callbackFired, true);
      } finally {
        ChartsMotion.ensureScrollTrigger = origEnsure;
      }
    });
  });

  describe('Lifecycle Cleanup & Repeated Initialization', () => {
    it('destroys all tracked charts and kills all ScrollTriggers upon cleanup', () => {
      let chartDestroyed = false;
      let triggerKilled = false;

      const mockChart = {
        destroy() {
          chartDestroyed = true;
        },
      };

      const mockTrigger = {
        kill() {
          triggerKilled = true;
        },
      };

      ChartsMotion.registerChart('analytics', mockChart);
      ChartsMotion.registerScrollTrigger('analytics', mockTrigger);

      ChartsMotion.cleanup('analytics');

      assert.strictEqual(chartDestroyed, true);
      assert.strictEqual(triggerKilled, true);

      // Safe repeated cleanup call
      ChartsMotion.cleanup('analytics');
      assert.ok(true);
    });
  });
});
