/**
 * Tests for Central Animation Manager (animation.js)
 * Verified via Node.js native test runner: node --test tests/frontend/motion-manager.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AnimationManager } from '../../static/js/lib/motion/animation.js';

describe('AnimationManager Subsystem', () => {
  beforeEach(() => {
    AnimationManager.killAll();
    AnimationManager.setReducedMotion(false);
  });

  describe('Reduced Motion State & Preference Changes', () => {
    it('detects initial reduced-motion mode (default false in Node)', () => {
      assert.equal(typeof AnimationManager.isReducedMotion(), 'boolean');
    });

    it('allows toggling reduced-motion state programmatically', () => {
      AnimationManager.setReducedMotion(true);
      assert.equal(AnimationManager.isReducedMotion(), true);

      AnimationManager.setReducedMotion(false);
      assert.equal(AnimationManager.isReducedMotion(), false);
    });

    it('notifies registered listeners when reduced motion changes', () => {
      let notifiedValue = null;
      let callCount = 0;

      const unsubscribe = AnimationManager.onReducedMotionChange((val) => {
        notifiedValue = val;
        callCount++;
      });

      AnimationManager.setReducedMotion(true);
      assert.equal(notifiedValue, true);
      assert.equal(callCount, 1);

      AnimationManager.setReducedMotion(false);
      assert.equal(notifiedValue, false);
      assert.equal(callCount, 2);

      unsubscribe();
      AnimationManager.setReducedMotion(true);
      assert.equal(callCount, 2, 'Unsubscribed listener must not be called');
    });

    it('kills all active animations when reduced motion is enabled', () => {
      let killed = false;
      const mockAnim = {
        kill: () => {
          killed = true;
        },
      };

      AnimationManager.enterView('testView');
      AnimationManager._activeAnimations.get('testView').add(mockAnim);

      AnimationManager.setReducedMotion(true);
      assert.equal(killed, true, 'Active animations must be killed when reduced motion turns on');
    });
  });

  describe('View Lifecycle & Cleanup', () => {
    it('tracks view entrance and allocates view animation bucket', () => {
      AnimationManager.enterView('overview');
      assert.equal(AnimationManager._currentView, 'overview');
      assert.ok(AnimationManager._activeAnimations.has('overview'));
    });

    it('cleans up animations upon exitView', () => {
      let killed = false;
      const mockAnim = {
        kill: () => {
          killed = true;
        },
      };

      AnimationManager.enterView('analytics');
      AnimationManager._activeAnimations.get('analytics').add(mockAnim);

      AnimationManager.exitView('analytics');
      assert.equal(killed, true);
      assert.equal(AnimationManager._activeAnimations.get('analytics').size, 0);
    });

    it('kills animations across all views when killAll is called', () => {
      let killed1 = false;
      let killed2 = false;

      AnimationManager.enterView('view1');
      AnimationManager._activeAnimations.get('view1').add({ kill: () => (killed1 = true) });

      AnimationManager.enterView('view2');
      AnimationManager._activeAnimations.get('view2').add({ kill: () => (killed2 = true) });

      AnimationManager.killAll();
      assert.equal(killed1, true);
      assert.equal(killed2, true);
      assert.equal(AnimationManager._activeAnimations.size, 0);
    });
  });

  describe('Playback & Fallbacks', () => {
    it('resolves immediately to final state when reduced motion is enabled', async () => {
      AnimationManager.setReducedMotion(true);
      const mockTarget = { style: { opacity: '0', transform: 'scale(0.5)' } };

      const res = await AnimationManager.play('popIn', mockTarget);
      assert.equal(res, mockTarget);
      assert.equal(mockTarget.style.opacity, '1');
      assert.equal(mockTarget.style.transform, 'none');
    });

    it('executes onComplete callback even under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      let completed = false;
      const mockTarget = { style: {} };

      await AnimationManager.play('fadeIn', mockTarget, {
        onComplete: () => {
          completed = true;
        },
      });

      assert.equal(completed, true);
    });

    it('gracefully handles missing or null target', async () => {
      const res = await AnimationManager.play('popIn', null);
      assert.equal(res, null);
    });

    it('gracefully falls back when GSAP is unavailable without crashing', async () => {
      AnimationManager.setReducedMotion(false);
      // Ensure GSAP returns null
      AnimationManager._gsap = null;
      const mockTarget = { style: { opacity: '0' } };

      const res = await AnimationManager.play('fadeIn', mockTarget);
      assert.equal(res, mockTarget);
      assert.equal(mockTarget.style.opacity, '1');
    });
  });

  describe('Flip Integration & Reduced-Motion Bypass', () => {
    it('recordFlipState returns null immediately when reduced motion is enabled', async () => {
      AnimationManager.setReducedMotion(true);
      const res = await AnimationManager.recordFlipState('.test-rows');
      assert.equal(res, null, 'Must bypass Flip state recording under reduced motion');
    });

    it('recordFlipState returns null when targets parameter is missing or null', async () => {
      AnimationManager.setReducedMotion(false);
      const res = await AnimationManager.recordFlipState(null);
      assert.equal(res, null);
    });

    it('playFlip returns null and executes onComplete immediately under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      let completed = false;

      const res = await AnimationManager.playFlip(
        { mock: 'state' },
        {
          onComplete: () => {
            completed = true;
          },
        },
        'explorer'
      );

      assert.equal(res, null);
      assert.equal(completed, true, 'onComplete callback must be invoked even under reduced motion');
    });

    it('playFlip returns null when state is missing or null', async () => {
      AnimationManager.setReducedMotion(false);
      let completed = false;

      const res = await AnimationManager.playFlip(null, {
        onComplete: () => {
          completed = true;
        },
      });

      assert.equal(res, null);
      assert.equal(completed, true);
    });

    it('gracefully handles missing Flip vendor without throwing', async () => {
      AnimationManager.setReducedMotion(false);
      AnimationManager._flip = null;

      const res = await AnimationManager.playFlip({ mock: 'state' }, {}, 'explorer');
      assert.equal(res, null);
    });
  });
});
