/**
 * Tests for Router Transitions (transitions.js)
 * Verified via Node.js native test runner: node --test tests/frontend/transitions.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ViewTransitions } from '../../static/js/lib/motion/transitions.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';

describe('Router View Transitions Subsystem', () => {
  beforeEach(() => {
    AnimationManager.setReducedMotion(false);
    ViewTransitions._cancelActiveTween();
    ViewTransitions._currentSeq = 0;
  });

  describe('Strategy Selection & Execution', () => {
    it('executes instant swap when reduced motion is enabled', async () => {
      AnimationManager.setReducedMotion(true);

      let swapCalled = 0;
      const fromEl = { style: {} };
      const toEl = { style: {} };

      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'analytics',
        fromEl,
        toEl,
        swap: () => {
          swapCalled++;
        },
      });

      assert.equal(swapCalled, 1, 'DOM swap callback must be invoked exactly once');
    });

    it('uses native document.startViewTransition when available', async () => {
      AnimationManager.setReducedMotion(false);

      let nativeCalled = false;
      let swapCalled = 0;

      const prevDoc = globalThis.document;
      globalThis.document = {
        startViewTransition: (cb) => {
          nativeCalled = true;
          cb();
          return { finished: Promise.resolve() };
        },
      };

      try {
        const fromEl = { style: {} };
        const toEl = { style: {} };

        await ViewTransitions.transition({
          fromView: 'overview',
          toView: 'analyze',
          fromEl,
          toEl,
          swap: () => {
            swapCalled++;
          },
        });

        assert.equal(nativeCalled, true, 'startViewTransition must be called');
        assert.equal(swapCalled, 1, 'DOM swap must be executed within startViewTransition');
      } finally {
        globalThis.document = prevDoc;
      }
    });

    it('falls back to GSAP when startViewTransition is unsupported and GSAP is available', async () => {
      AnimationManager.setReducedMotion(false);

      let gsapToCalled = 0;
      let gsapFromToCalled = 0;
      let swapCalled = 0;

      // Mock GSAP
      AnimationManager._gsap = {
        to: (el, opts) => {
          gsapToCalled++;
          opts.onComplete?.();
          return { kill: () => {} };
        },
        fromTo: (el, from, to) => {
          gsapFromToCalled++;
          to.onComplete?.();
          return { kill: () => {} };
        },
      };

      const fromEl = { style: {} };
      const toEl = { style: {} };

      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'explorer',
        fromEl,
        toEl,
        swap: () => {
          swapCalled++;
        },
      });

      assert.equal(gsapToCalled, 1, 'Outgoing view must animate with GSAP to()');
      assert.equal(swapCalled, 1, 'DOM swap must be executed between outgoing and incoming');
      assert.equal(gsapFromToCalled, 1, 'Incoming view must animate with GSAP fromTo()');

      // Reset mock
      AnimationManager._gsap = null;
    });

    it('falls back to instant swap when GSAP is unavailable and View Transitions are unsupported', async () => {
      AnimationManager.setReducedMotion(false);
      AnimationManager._gsap = null;

      let swapCalled = 0;
      const fromEl = { style: {} };
      const toEl = { style: {} };

      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'history',
        fromEl,
        toEl,
        swap: () => {
          swapCalled++;
        },
      });

      assert.equal(swapCalled, 1, 'DOM swap must be called as instant fallback');
    });
  });

  describe('Edge Cases & Edge Transitions', () => {
    it('executes swap immediately if fromView and toView are identical', async () => {
      let swapCalled = 0;
      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'overview',
        fromEl: {},
        toEl: {},
        swap: () => {
          swapCalled++;
        },
      });

      assert.equal(swapCalled, 1);
    });

    it('executes swap immediately if elements are missing', async () => {
      let swapCalled = 0;
      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'analyze',
        fromEl: null,
        toEl: null,
        swap: () => {
          swapCalled++;
        },
      });

      assert.equal(swapCalled, 1);
    });

    it('handles missing swap callback without throwing', async () => {
      await ViewTransitions.transition({
        fromView: 'overview',
        toView: 'analyze',
      });
      // Test succeeds if no exception is thrown
      assert.ok(true);
    });
  });

  describe('Rapid Navigation & Race Conditions', () => {
    it('cancels active tween when a newer transition begins', async () => {
      AnimationManager.setReducedMotion(false);

      let tweenKilled = false;
      let firstSwapCalled = 0;
      let secondSwapCalled = 0;

      let toCallCount = 0;
      AnimationManager._gsap = {
        to: (el, opts) => {
          toCallCount++;
          if (toCallCount === 1) {
            // First transition: simulate long-running tween
            return {
              kill: () => {
                tweenKilled = true;
              },
            };
          } else {
            // Second transition: complete normally
            opts.onComplete?.();
            return { kill: () => {} };
          }
        },
        fromTo: (el, from, to) => {
          to.onComplete?.();
          return { kill: () => {} };
        },
      };

      const fromEl1 = { style: {} };
      const toEl1 = { style: {} };
      const fromEl2 = { style: {} };
      const toEl2 = { style: {} };

      // Start transition 1
      const t1 = ViewTransitions.transition({
        fromView: 'overview',
        toView: 'analytics',
        fromEl: fromEl1,
        toEl: toEl1,
        swap: () => {
          firstSwapCalled++;
        },
      });

      // Allow microtask tick for t1 to start GSAP tween
      await new Promise((r) => setTimeout(r, 10));

      // Trigger transition 2 while transition 1 is in progress
      const t2 = ViewTransitions.transition({
        fromView: 'analytics',
        toView: 'history',
        fromEl: fromEl2,
        toEl: toEl2,
        swap: () => {
          secondSwapCalled++;
        },
      });

      await Promise.all([t1, t2]);

      assert.equal(tweenKilled, true, 'First tween must be killed upon newer transition');
      assert.equal(firstSwapCalled, 0, 'Cancelled first transition must not execute DOM swap');
      assert.equal(secondSwapCalled, 1, 'Second transition must complete successfully');

      AnimationManager._gsap = null;
    });
  });
});
