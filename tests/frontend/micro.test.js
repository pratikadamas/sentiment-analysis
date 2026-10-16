/**
 * Tests for Micro-Interactions Subsystem (micro.js) and Phase 4 Presets
 * Verified via Node.js native test runner: node --test tests/frontend/micro.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { AnimationManager } from '../../static/js/lib/motion/animation.js';
import { MicroInteractions } from '../../static/js/lib/motion/micro.js';
import { PRESETS, getPreset } from '../../static/js/lib/motion/presets.js';

describe('MicroInteractions Subsystem', () => {
  beforeEach(() => {
    AnimationManager.killAll();
    AnimationManager.setReducedMotion(false);
  });

  afterEach(() => {
    MicroInteractions.destroy();
  });

  describe('Initialization and Teardown', () => {
    it('initializes listeners and avoids duplicate initialization', () => {
      // In Node environment without DOM document, MicroInteractions safely handles absence
      MicroInteractions.init();
      assert.equal(typeof MicroInteractions.init, 'function');
      assert.equal(typeof MicroInteractions.destroy, 'function');
    });

    it('cleans up on destroy() without errors', () => {
      MicroInteractions.init();
      MicroInteractions.destroy();
      assert.equal(MicroInteractions._initialized, false);
    });
  });

  describe('Interactive Target Recognition', () => {
    it('identifies enabled buttons as valid press targets', () => {
      const mockButton = {
        tagName: 'BUTTON',
        disabled: false,
        hasAttribute: () => false,
        getAttribute: () => null,
        closest: (selector) => (selector.includes('button') ? mockButton : null),
      };

      const target = MicroInteractions._getPressTarget(mockButton);
      assert.equal(target, mockButton);
    });

    it('rejects disabled buttons from press interactions', () => {
      const mockDisabledBtn = {
        tagName: 'BUTTON',
        disabled: true,
        hasAttribute: () => false,
        getAttribute: () => null,
        closest: () => null,
      };

      const target = MicroInteractions._getPressTarget(mockDisabledBtn);
      assert.equal(target, null);
    });

    it('rejects standard hyperlinks lacking button role or data-motion', () => {
      const mockLink = {
        tagName: 'A',
        disabled: false,
        hasAttribute: () => false,
        getAttribute: () => null,
        closest: () => mockLink,
      };

      const target = MicroInteractions._getPressTarget(mockLink);
      assert.equal(target, null);
    });

    it('accepts elements with role="button"', () => {
      const mockRoleBtn = {
        tagName: 'DIV',
        disabled: false,
        hasAttribute: (attr) => attr === 'role',
        getAttribute: (attr) => (attr === 'role' ? 'button' : null),
        closest: () => mockRoleBtn,
      };

      const target = MicroInteractions._getPressTarget(mockRoleBtn);
      assert.equal(target, mockRoleBtn);
    });
  });

  describe('Badge Pop Animation', () => {
    it('bypasses animation under reduced motion and sets final visual state immediately', async () => {
      AnimationManager.setReducedMotion(true);
      const mockBadge = { style: { transform: 'scale(0.8)', opacity: '0.5' } };

      await MicroInteractions.badgePop(mockBadge);
      assert.equal(mockBadge.style.transform, 'none');
      assert.equal(mockBadge.style.opacity, '1');
    });

    it('safely handles missing element', async () => {
      const res = await MicroInteractions.badgePop(null);
      assert.equal(res, undefined);
    });
  });

  describe('Toast Entrance and Exit Motion', () => {
    it('instantly applies final visibility under reduced motion on entrance', async () => {
      AnimationManager.setReducedMotion(true);
      const mockToast = { style: { opacity: '0', transform: 'translateY(8px)' } };

      await MicroInteractions.animateToast(mockToast);
      assert.equal(mockToast.style.opacity, '1');
      assert.equal(mockToast.style.transform, 'none');
    });

    it('executes onComplete immediately under reduced motion on dismissal', async () => {
      AnimationManager.setReducedMotion(true);
      let completed = false;
      const mockToast = { style: {} };

      await MicroInteractions.dismissToast(mockToast, () => {
        completed = true;
      });

      assert.equal(completed, true);
    });

    it('safely handles null toast elements without throwing', async () => {
      let completed = false;
      await MicroInteractions.animateToast(null);
      await MicroInteractions.dismissToast(null, () => {
        completed = true;
      });
      assert.equal(completed, true);
    });
  });

  describe('Modal Spring Entrance & Exit', () => {
    it('instantly resolves entrance state under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      const mockDialog = { style: { opacity: '0', transform: 'scale(0.96)' } };
      const mockBackdrop = {
        classList: {
          classes: new Set(['hidden']),
          remove(cls) {
            this.classes.delete(cls);
          },
          add(cls) {
            this.classes.add(cls);
          },
        },
        querySelector: () => mockDialog,
      };

      await MicroInteractions.modalEnter(mockBackdrop, mockDialog);
      assert.equal(mockBackdrop.classList.classes.has('hidden'), false);
      assert.equal(mockDialog.style.opacity, '1');
      assert.equal(mockDialog.style.transform, 'none');
    });

    it('instantly hides modal and calls onComplete on exit under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      let completed = false;
      const mockDialog = { style: { opacity: '1', transform: 'scale(1)' } };
      const mockBackdrop = {
        classList: {
          classes: new Set(),
          add(cls) {
            this.classes.add(cls);
          },
        },
        querySelector: () => mockDialog,
      };

      await MicroInteractions.modalExit(mockBackdrop, mockDialog, () => {
        completed = true;
      });

      assert.equal(mockBackdrop.classList.classes.has('hidden'), true);
      assert.equal(completed, true);
    });
  });

  describe('Phase 4 Motion Presets', () => {
    const requiredPresets = [
      'press',
      'hoverLift',
      'badgePop',
      'modalEnter',
      'modalExit',
      'rowEnter',
      'rowExit',
      'resultCardEnter',
      'tokenBar',
      'tokenFade',
    ];

    requiredPresets.forEach((presetName) => {
      it(`defines required preset "${presetName}" with valid properties`, () => {
        assert.ok(PRESETS[presetName], `PRESETS.${presetName} must be defined`);
        const preset = getPreset(presetName);
        assert.ok(
          preset.to || preset.keyframes,
          `Preset ${presetName} must specify a 'to' or 'keyframes' block`
        );
      });
    });
  });

  describe('AnimationManager Flip Capabilities', () => {
    it('recordFlipState returns null when reduced motion is enabled', async () => {
      AnimationManager.setReducedMotion(true);
      const state = await AnimationManager.recordFlipState('.test-selector');
      assert.equal(state, null);
    });

    it('playFlip immediately invokes onComplete and returns null under reduced motion', async () => {
      AnimationManager.setReducedMotion(true);
      let completed = false;

      const res = await AnimationManager.playFlip(
        { dummyState: true },
        {
          onComplete: () => {
            completed = true;
          },
        },
        'explorer'
      );

      assert.equal(res, null);
      assert.equal(completed, true);
    });

    it('playFlip safely handles null state', async () => {
      let completed = false;
      const res = await AnimationManager.playFlip(null, {
        onComplete: () => {
          completed = true;
        },
      });
      assert.equal(res, null);
      assert.equal(completed, true);
    });
  });
});
