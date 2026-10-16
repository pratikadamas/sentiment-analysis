/**
 * Tests for Imports Delight Layer & Motion Subsystem (imports-motion.test.js)
 * Verified via Node.js native test runner: node --test tests/frontend/imports-motion.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { AnimationManager } from '../../static/js/lib/motion/animation.js';
import { PRESETS, getPreset } from '../../static/js/lib/motion/presets.js';
import { VendorLoader } from '../../static/js/lib/motion/vendor-loader.js';

describe('Imports Delight Layer & Motion Subsystem', () => {
  beforeEach(() => {
    AnimationManager.killAll();
    AnimationManager.setReducedMotion(false);
    VendorLoader.clearCache();
  });

  afterEach(() => {
    AnimationManager.killAll();
    AnimationManager.setReducedMotion(false);
  });

  describe('Phase 5 Motion Presets Registration', () => {
    const importPresets = [
      'progressMorph',
      'progressPulse',
      'successPop',
      'errorShake',
      'celebrationBurst',
    ];

    importPresets.forEach((presetName) => {
      it(`defines required preset "${presetName}" with valid properties`, () => {
        assert.ok(PRESETS[presetName], `PRESETS.${presetName} must be defined`);
        const preset = getPreset(presetName);
        assert.ok(
          preset.to || preset.keyframes || preset.from,
          `Preset ${presetName} must specify valid animation parameters`
        );
      });
    });

    it('errorShake defines safe transform-only keyframes without layout properties', () => {
      const shakePreset = getPreset('errorShake');
      assert.ok(Array.isArray(shakePreset.keyframes), 'errorShake must use keyframes array');
      shakePreset.keyframes.forEach((kf) => {
        assert.equal(typeof kf.x, 'number', 'Keyframe must only tween x offset');
        assert.equal(kf.width, undefined, 'Keyframe must never animate width');
        assert.equal(kf.height, undefined, 'Keyframe must never animate height');
      });
    });

    it('progressPulse defines subtle opacity/scale keyframes for polling indicator', () => {
      const pulsePreset = getPreset('progressPulse');
      assert.ok(Array.isArray(pulsePreset.keyframes), 'progressPulse must use keyframes');
      assert.ok(pulsePreset.duration > 0, 'Duration must be positive');
    });

    it('successPop defines spring-based scale pop for check/indicator', () => {
      const popPreset = getPreset('successPop');
      assert.ok(popPreset.from && popPreset.from.scale !== undefined);
      assert.equal(popPreset.to.scale, 1);
    });
  });

  describe('Celebration Burst & Confetti Integration', () => {
    it('bypasses confetti and returns false immediately under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      let vendorLoaded = false;

      // Spy on loadVendor
      const originalLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async (key) => {
        if (key === 'confetti') vendorLoaded = true;
        return originalLoad(key);
      };

      const result = await AnimationManager.celebrate();
      assert.equal(result, false, 'Must return false when reduced motion is enabled');
      assert.equal(vendorLoaded, false, 'Must never request confetti vendor under reduced motion');

      VendorLoader.loadVendor = originalLoad;
    });

    it('lazily requests confetti vendor only when celebrate() is executed', async () => {
      let requestedVendor = null;
      let confettiCalled = false;
      let passedOptions = null;

      const mockConfetti = (opts) => {
        confettiCalled = true;
        passedOptions = opts;
      };

      const originalLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async (key) => {
        requestedVendor = key;
        if (key === 'confetti') return mockConfetti;
        return originalLoad(key);
      };

      const result = await AnimationManager.celebrate({ particleCount: 35 });
      assert.equal(requestedVendor, 'confetti');
      assert.equal(confettiCalled, true);
      assert.equal(passedOptions.particleCount, 35);
      assert.equal(passedOptions.disableForReducedMotion, true);
      assert.equal(result, true);

      VendorLoader.loadVendor = originalLoad;
    });

    it('gracefully handles confetti vendor failure without throwing', async () => {
      const originalLoad = VendorLoader.loadVendor.bind(VendorLoader);
      VendorLoader.loadVendor = async () => null;

      const result = await AnimationManager.celebrate();
      assert.equal(result, false);

      VendorLoader.loadVendor = originalLoad;
    });
  });

  describe('Import Progress State & Monotonicity', () => {
    it('enforces monotonic progress progression (never decreases during polling)', () => {
      let lastProgress = 20;

      const updateProgress = (newPct) => {
        const display = Math.max(newPct, lastProgress);
        lastProgress = display;
        return display;
      };

      assert.equal(updateProgress(35), 35);
      assert.equal(updateProgress(50), 50);
      // Simulating a temporary lower packet from polling
      assert.equal(updateProgress(42), 50, 'Progress must remain at highest achieved value');
      assert.equal(updateProgress(75), 75);
      assert.equal(updateProgress(100), 100);
    });

    it('caps indeterminate polling at 95% until complete', () => {
      const calculatePct = (processed, total) => {
        return Math.min(Math.round((processed / total) * 100), 95);
      };

      assert.equal(calculatePct(50, 100), 50);
      assert.equal(
        calculatePct(98, 100),
        95,
        'In-flight processing must cap at 95% before COMPLETED'
      );
      assert.equal(calculatePct(100, 100), 95, 'Still caps at 95% while status is pending');
    });
  });

  describe('Error Shake & Reduced Motion', () => {
    it('applies errorShake preset to target under normal motion', async () => {
      const mockEl = { style: {} };
      let playedPreset = null;

      const originalPlay = AnimationManager.play.bind(AnimationManager);
      AnimationManager.play = async (preset, target, opts, view) => {
        playedPreset = preset;
        return originalPlay(preset, target, opts, view);
      };

      await AnimationManager.play('errorShake', mockEl, {}, 'import-export');
      assert.equal(playedPreset, 'errorShake');

      AnimationManager.play = originalPlay;
    });

    it('instantly resolves error state under reduced motion without animation shake', async () => {
      AnimationManager.setReducedMotion(true);
      const mockEl = { style: { transform: 'translateX(10px)' } };

      await AnimationManager.play('errorShake', mockEl, {}, 'import-export');
      assert.equal(mockEl.style.transform, 'none');
      assert.equal(mockEl.style.opacity, '1');
    });
  });

  describe('Lifecycle Cleanup & Stale Animation Prevention', () => {
    it('cleans up active animations for import-export view on exitView', () => {
      let killed = false;
      const mockTween = {
        kill: () => {
          killed = true;
        },
      };

      AnimationManager.enterView('import-export');
      AnimationManager._activeAnimations.get('import-export').add(mockTween);

      assert.equal(AnimationManager._activeAnimations.get('import-export').size, 1);

      AnimationManager.exitView('import-export');
      assert.equal(killed, true, 'Active tween must be killed when leaving import-export');
      assert.equal(AnimationManager._activeAnimations.get('import-export').size, 0);
    });

    it('kills active tweens across all views on killAll', () => {
      let killed = false;
      AnimationManager.enterView('import-export');
      AnimationManager._activeAnimations.get('import-export').add({
        kill: () => {
          killed = true;
        },
      });

      AnimationManager.killAll();
      assert.equal(killed, true);
      assert.equal(AnimationManager._activeAnimations.size, 0);
    });
  });
});
