/**
 * Sentiment Pulse - Skeletons Subsystem Unit Tests (skeletons.test.js)
 * Tests skeleton lifecycle, aria-busy states, accessible hiding, and reduced-motion instant swapping.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Skeletons } from '../../static/js/lib/motion/skeletons.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';

describe('Skeletons Subsystem', () => {
  let mockSkeleton;
  let mockContent;

  function createMockElement() {
    return {
      classes: new Set(),
      attributes: {},
      classList: {
        add(...cls) {
          cls.forEach((c) => this._el.classes.add(c));
        },
        remove(...cls) {
          cls.forEach((c) => this._el.classes.delete(c));
        },
        contains(c) {
          return this._el.classes.has(c);
        },
      },
      getAttribute(k) {
        return this.attributes[k] || null;
      },
      setAttribute(k, v) {
        this.attributes[k] = String(v);
      },
      removeAttribute(k) {
        delete this.attributes[k];
      },
    };
  }

  beforeEach(() => {
    AnimationManager.setReducedMotion(false);

    mockSkeleton = createMockElement();
    mockSkeleton.classList._el = mockSkeleton;

    mockContent = createMockElement();
    mockContent.classList._el = mockContent;
  });

  afterEach(() => {
    AnimationManager.setReducedMotion(false);
  });

  describe('Show & Hide States', () => {
    it('sets aria-busy="true" and unhides skeleton on show()', () => {
      mockSkeleton.classList.add('hidden');
      Skeletons.show(mockSkeleton, mockContent);

      assert.strictEqual(mockSkeleton.classList.contains('hidden'), false);
      assert.strictEqual(mockSkeleton.getAttribute('aria-busy'), 'true');
      assert.strictEqual(mockSkeleton.getAttribute('aria-hidden'), null);

      assert.strictEqual(mockContent.classList.contains('hidden'), true);
      assert.strictEqual(mockContent.getAttribute('aria-hidden'), 'true');
    });

    it('sets aria-busy="false", aria-hidden="true" and hides skeleton on hide()', () => {
      Skeletons.hide(mockSkeleton, mockContent);

      assert.strictEqual(mockSkeleton.classList.contains('hidden'), true);
      assert.strictEqual(mockSkeleton.getAttribute('aria-busy'), 'false');
      assert.strictEqual(mockSkeleton.getAttribute('aria-hidden'), 'true');

      assert.strictEqual(mockContent.classList.contains('hidden'), false);
      assert.strictEqual(mockContent.getAttribute('aria-hidden'), null);
    });
  });

  describe('Content Swap Behavior', () => {
    it('performs instant swap under reduced motion without animation delays', async () => {
      AnimationManager.setReducedMotion(true);

      mockSkeleton.setAttribute('aria-busy', 'true');
      mockContent.classList.add('hidden');

      let completed = false;
      await Skeletons.swap(mockSkeleton, mockContent, {
        onComplete: () => {
          completed = true;
        },
      });

      assert.strictEqual(completed, true);
      assert.strictEqual(mockSkeleton.classList.contains('hidden'), true);
      assert.strictEqual(mockSkeleton.getAttribute('aria-busy'), 'false');
      assert.strictEqual(mockContent.classList.contains('hidden'), false);
    });

    it('transitions skeleton to hidden and reveals content under normal motion', async () => {
      mockSkeleton.setAttribute('aria-busy', 'true');
      mockContent.classList.add('hidden');

      let completed = false;
      await Skeletons.swap(mockSkeleton, mockContent, {
        onComplete: () => {
          completed = true;
        },
      });

      assert.strictEqual(completed, true);
      assert.strictEqual(mockSkeleton.classList.contains('hidden'), true);
      assert.strictEqual(mockContent.classList.contains('hidden'), false);
    });
  });

  describe('Error & Edge Cases', () => {
    it('handles null or missing elements gracefully without crashing', async () => {
      Skeletons.show(null, null);
      Skeletons.hide(null, null);
      await Skeletons.swap(null, null);
      assert.ok(true);
    });
  });
});
