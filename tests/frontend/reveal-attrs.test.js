/**
 * Tests for Reveal Engine Attribute Parsing & Logic (reveal.js)
 * Verified via Node.js native test runner: node --test tests/frontend/reveal-attrs.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { RevealEngine } from '../../static/js/lib/motion/reveal.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';

describe('Reveal Engine Attribute Processing', () => {
  beforeEach(() => {
    AnimationManager.setReducedMotion(false);
  });

  describe('Attribute Value Parsing', () => {
    it('parses valid positive integer attribute values correctly', () => {
      assert.equal(RevealEngine.parseAttributeNumber('100'), 100);
      assert.equal(RevealEngine.parseAttributeNumber('0'), 0);
      assert.equal(RevealEngine.parseAttributeNumber('500'), 500);
    });

    it('falls back gracefully on empty, null, or undefined values', () => {
      assert.equal(RevealEngine.parseAttributeNumber(''), 0);
      assert.equal(RevealEngine.parseAttributeNumber(null), 0);
      assert.equal(RevealEngine.parseAttributeNumber(undefined), 0);
      assert.equal(RevealEngine.parseAttributeNumber(null, 50), 50);
    });

    it('handles invalid non-numeric and negative values safely', () => {
      assert.equal(RevealEngine.parseAttributeNumber('abc', 100), 100);
      assert.equal(RevealEngine.parseAttributeNumber('-50', 0), 0);
      assert.equal(RevealEngine.parseAttributeNumber('120px', 0), 120);
    });
  });

  describe('Delay & Stagger Calculation', () => {
    it('calculates delay directly from data-reveal-delay attribute', () => {
      const mockElement = {
        getAttribute(attr) {
          if (attr === 'data-reveal-delay') return '150';
          return null;
        },
        closest() {
          return null;
        },
      };

      assert.equal(RevealEngine.calculateDelay(mockElement), 150);
    });

    it('returns zero delay when data-reveal-delay is absent and not inside stagger parent', () => {
      const mockElement = {
        getAttribute() {
          return null;
        },
        closest() {
          return null;
        },
      };

      assert.equal(RevealEngine.calculateDelay(mockElement), 0);
    });

    it('computes staggered delay when element is child of a data-stagger container', () => {
      const child0 = {
        getAttribute() {
          return null;
        },
      };
      const child1 = {
        getAttribute() {
          return null;
        },
      };
      const child2 = {
        getAttribute() {
          return null;
        },
      };

      const children = [child0, child1, child2];

      const staggerParent = {
        getAttribute(attr) {
          if (attr === 'data-stagger') return '80';
          return null;
        },
        querySelectorAll() {
          return children;
        },
      };

      child0.closest = () => staggerParent;
      child1.closest = () => staggerParent;
      child2.closest = () => staggerParent;

      assert.equal(RevealEngine.calculateDelay(child0), 0); // 0 * 80
      assert.equal(RevealEngine.calculateDelay(child1), 80); // 1 * 80
      assert.equal(RevealEngine.calculateDelay(child2), 160); // 2 * 80
    });

    it('combines individual data-reveal-delay with parent data-stagger', () => {
      const child0 = {
        getAttribute(attr) {
          if (attr === 'data-reveal-delay') return '100';
          return null;
        },
      };
      const child1 = {
        getAttribute(attr) {
          if (attr === 'data-reveal-delay') return '50';
          return null;
        },
      };

      const children = [child0, child1];
      const staggerParent = {
        getAttribute(attr) {
          if (attr === 'data-stagger') return '100';
          return null;
        },
        querySelectorAll() {
          return children;
        },
      };

      child0.closest = () => staggerParent;
      child1.closest = () => staggerParent;

      assert.equal(RevealEngine.calculateDelay(child0), 100); // 100 + (0 * 100)
      assert.equal(RevealEngine.calculateDelay(child1), 150); // 50 + (1 * 100)
    });
  });

  describe('Reduced-Motion Compliance', () => {
    it('sets transitionDelay to 0ms and adds is-revealed immediately under reduced motion', () => {
      AnimationManager.setReducedMotion(true);

      const classes = new Set();
      const mockElement = {
        classList: {
          contains: (cls) => classes.has(cls),
          add: (cls) => classes.add(cls),
        },
        style: {},
        getAttribute: () => '250',
        closest: () => null,
      };

      RevealEngine.revealElement(mockElement);

      assert.ok(classes.has('is-revealed'));
      assert.equal(mockElement.style.transitionDelay, '0ms');
    });

    it('does not re-reveal elements already marked with is-revealed', () => {
      let delaySet = false;
      const mockElement = {
        classList: {
          contains: (cls) => cls === 'is-revealed',
          add: () => {},
        },
        style: {
          set transitionDelay(val) {
            delaySet = true;
          },
        },
        getAttribute: () => '100',
        closest: () => null,
      };

      RevealEngine.revealElement(mockElement);
      assert.equal(delaySet, false, 'Already revealed elements must not be modified');
    });
  });
});
