/**
 * Sentiment Pulse - Micro-Interactions & Lightweight Motion Subsystem (micro.js)
 * Provides centralized button press feedback, hover lifts, toast animations,
 * badge pops, and accessible modal spring transitions.
 * Fully respects prefers-reduced-motion and zero-build Vanilla JS constraints.
 */

import { AnimationManager } from './animation.js';
import { getPreset } from './presets.js';

export const MicroInteractions = {
  _initialized: false,
  _activePressedEl: null,
  _boundPointerDown: null,
  _boundPointerUp: null,
  _boundPointerCancel: null,
  _boundPointerEnter: null,
  _boundPointerLeave: null,
  _brandCleanups: [],

  /**
   * Initialize delegated event listeners for micro-interactions across the document.
   */
  init() {
    if (this._initialized) return;
    if (typeof document === 'undefined') return;
    this._initialized = true;

    this._boundPointerDown = (e) => this._handlePointerDown(e);
    this._boundPointerUp = (e) => this._handlePointerUp(e);
    this._boundPointerCancel = (e) => this._handlePointerCancel(e);
    this._boundPointerEnter = (e) => this._handlePointerEnter(e);
    this._boundPointerLeave = (e) => this._handlePointerLeave(e);

    document.addEventListener('pointerdown', this._boundPointerDown, { passive: true });
    document.addEventListener('pointerup', this._boundPointerUp, { passive: true });
    document.addEventListener('pointercancel', this._boundPointerCancel, { passive: true });
    document.addEventListener('pointerenter', this._boundPointerEnter, {
      capture: true,
      passive: true,
    });
    document.addEventListener('pointerleave', this._boundPointerLeave, {
      capture: true,
      passive: true,
    });

    this.initBrandLogoParallax();
  },

  /**
   * Teardown delegated listeners (used for testing and cleanup).
   */
  destroy() {
    if (!this._initialized || typeof document === 'undefined') return;
    this._initialized = false;

    if (this._boundPointerDown) {
      document.removeEventListener('pointerdown', this._boundPointerDown);
      document.removeEventListener('pointerup', this._boundPointerUp);
      document.removeEventListener('pointercancel', this._boundPointerCancel);
      document.removeEventListener('pointerenter', this._boundPointerEnter, { capture: true });
      document.removeEventListener('pointerleave', this._boundPointerLeave, { capture: true });
    }

    if (this._activePressedEl) {
      this._resetTransform(this._activePressedEl);
      this._activePressedEl = null;
    }

    if (this._brandCleanups && this._brandCleanups.length > 0) {
      this._brandCleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore cleanup error
        }
      });
      this._brandCleanups = [];
    }
  },

  /**
   * Initializes 2D brand logo interaction lifecycle and visibility pausing.
   * Maintains backward-compatible method signature while supporting 2D brand icon.
   */
  initBrandLogoParallax() {
    if (typeof document === 'undefined') return;

    // Pause CSS animation when document is hidden to conserve GPU/battery
    const onVisibilityChange = () => {
      const isHidden = Boolean(document.hidden);
      const containers = document.querySelectorAll(
        '.brand-2d-container, .brand-icon-container, .brand-3d-container'
      );
      containers.forEach((c) => {
        c.classList.toggle('brand-2d-paused', isHidden);
        c.classList.toggle('brand-icon-paused', isHidden);
        c.classList.toggle('brand-3d-paused', isHidden);
      });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    this._brandCleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });
  },

  /**
   * Alias for 2D brand logo initialization.
   */
  initBrandLogo() {
    return this.initBrandLogoParallax();
  },

  /**
   * Finds the closest interactive element eligible for press feedback.
   * @param {Element} target
   * @returns {HTMLElement|null}
   * @private
   */
  _getPressTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;

    const el = target.closest(
      'button:not([disabled]):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), [data-motion="press"]'
    );

    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') {
      return null;
    }

    // Exclude links that don't have role="button" or data-motion
    if (el.tagName === 'A' && !el.hasAttribute('role') && !el.hasAttribute('data-motion')) {
      return null;
    }

    return el;
  },

  /**
   * Pointer down handler: subtle scale down.
   * @private
   */
  _handlePointerDown(e) {
    if (AnimationManager.isReducedMotion()) return;

    const target = this._getPressTarget(e.target);
    if (!target) return;

    this._activePressedEl = target;
    target.style.transition = 'transform 100ms cubic-bezier(0.2, 0.8, 0.4, 1)';
    target.style.transform = 'scale(0.97)';
  },

  /**
   * Pointer up / cancel handler: restore scale.
   * @private
   */
  _handlePointerUp(_e) {
    if (!this._activePressedEl) return;
    this._resetTransform(this._activePressedEl);
    this._activePressedEl = null;
  },

  _handlePointerCancel(_e) {
    if (!this._activePressedEl) return;
    this._resetTransform(this._activePressedEl);
    this._activePressedEl = null;
  },

  /**
   * Pointer enter handler for hover lift on cards.
   * @private
   */
  _handlePointerEnter(e) {
    if (AnimationManager.isReducedMotion()) return;
    const target = e.target;
    if (!target || !target.classList) return;

    // Apply only to interactive cards with tabindex or explicit data attribute
    const isInteractiveCard =
      (target.classList.contains('explorer-card') ||
        target.classList.contains('history-card') ||
        target.hasAttribute('data-hover-lift')) &&
      !target.hasAttribute('disabled');

    if (isInteractiveCard) {
      target.style.transition =
        'transform 150ms cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 150ms ease';
      target.style.transform = 'translateY(-2px)';
    }
  },

  /**
   * Pointer leave handler for hover lift.
   * @private
   */
  _handlePointerLeave(e) {
    const target = e.target;
    if (!target || !target.classList) return;

    const isInteractiveCard =
      target.classList.contains('explorer-card') ||
      target.classList.contains('history-card') ||
      target.hasAttribute('data-hover-lift');

    if (isInteractiveCard) {
      target.style.transform = '';
    }
  },

  /**
   * Reset inline transform and transition safely.
   * @private
   */
  _resetTransform(el) {
    if (!el || !el.style) return;
    el.style.transform = '';
    setTimeout(() => {
      if (el && el.style && el.style.transform === '') {
        el.style.transition = '';
      }
    }, 120);
  },

  /**
   * Manually trigger a button press animation (e.g. for keyboard trigger).
   * @param {HTMLElement} el
   */
  animatePress(el) {
    if (!el || AnimationManager.isReducedMotion()) return;

    el.style.transition = 'transform 100ms cubic-bezier(0.2, 0.8, 0.4, 1)';
    el.style.transform = 'scale(0.97)';

    setTimeout(() => {
      this._resetTransform(el);
    }, 120);
  },

  /**
   * Pop animation for status badges and indicators.
   * @param {HTMLElement} el
   * @returns {Promise<any>}
   */
  async badgePop(el) {
    if (!el) return;
    if (AnimationManager.isReducedMotion()) {
      el.style.transform = 'none';
      el.style.opacity = '1';
      return;
    }

    return AnimationManager.play('badgePop', el);
  },

  /**
   * Entrance animation for toast notifications.
   * @param {HTMLElement} toastEl
   * @returns {Promise<any>}
   */
  async animateToast(toastEl) {
    if (!toastEl) return;

    if (AnimationManager.isReducedMotion()) {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'none';
      return;
    }

    const preset = getPreset('toastIn');
    const gsap = await AnimationManager.ensureGSAP();

    if (gsap && preset) {
      return new Promise((resolve) => {
        gsap.fromTo(toastEl, preset.from || { opacity: 0, y: 16 }, {
          ...(preset.to || { opacity: 1, y: 0 }),
          onComplete: () => resolve(toastEl),
        });
      });
    }

    // CSS Fallback
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(8px)';
    toastEl.style.transition = 'opacity 200ms ease-out, transform 200ms ease-out';
    requestAnimationFrame(() => {
      toastEl.style.opacity = '1';
      toastEl.style.transform = 'translateY(0)';
    });
  },

  /**
   * Exit animation for toast notifications.
   * @param {HTMLElement} toastEl
   * @param {Function} [onComplete]
   * @returns {Promise<any>}
   */
  async dismissToast(toastEl, onComplete = null) {
    if (!toastEl) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const finalize = () => {
      if (typeof onComplete === 'function') {
        onComplete();
      } else if (toastEl.parentNode) {
        toastEl.remove();
      }
    };

    if (AnimationManager.isReducedMotion()) {
      finalize();
      return;
    }

    const preset = getPreset('toastOut');
    const gsap = await AnimationManager.ensureGSAP();

    if (gsap && preset) {
      return new Promise((resolve) => {
        gsap.to(toastEl, {
          ...(preset.to || { opacity: 0, y: 8 }),
          onComplete: () => {
            finalize();
            resolve();
          },
        });
      });
    }

    // CSS Fallback
    toastEl.style.transition = 'opacity 150ms ease-in, transform 150ms ease-in';
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(8px)';
    setTimeout(() => {
      finalize();
    }, 160);
  },

  /**
   * Modal entrance spring animation.
   * @param {HTMLElement} modalBackdrop - Container backdrop element
   * @param {HTMLElement} modalDialog - Inner dialog card element
   * @returns {Promise<any>}
   */
  async modalEnter(modalBackdrop, modalDialog) {
    if (!modalBackdrop) return;
    const dialog = modalDialog || modalBackdrop.querySelector('[role="document"], .saas-card');

    modalBackdrop.classList.remove('hidden');

    if (AnimationManager.isReducedMotion() || !dialog) {
      if (dialog) {
        dialog.style.opacity = '1';
        dialog.style.transform = 'none';
      }
      return;
    }

    const gsap = await AnimationManager.ensureGSAP();
    if (gsap) {
      return new Promise((resolve) => {
        gsap.fromTo(
          dialog,
          { opacity: 0, scale: 0.96, y: 4 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.25,
            ease: 'power3.out',
            onComplete: () => resolve(dialog),
          }
        );
      });
    }

    // CSS fallback
    dialog.style.opacity = '0';
    dialog.style.transform = 'scale(0.96) translateY(4px)';
    dialog.style.transition =
      'opacity 200ms ease-out, transform 200ms cubic-bezier(0.2, 0.8, 0.4, 1)';
    requestAnimationFrame(() => {
      dialog.style.opacity = '1';
      dialog.style.transform = 'none';
    });
  },

  /**
   * Modal exit animation.
   * @param {HTMLElement} modalBackdrop - Container backdrop element
   * @param {HTMLElement} modalDialog - Inner dialog card element
   * @param {Function} [onComplete] - Callback to hide/clean modal
   * @returns {Promise<any>}
   */
  async modalExit(modalBackdrop, modalDialog, onComplete = null) {
    if (!modalBackdrop) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const dialog = modalDialog || modalBackdrop.querySelector('[role="document"], .saas-card');

    const finalize = () => {
      modalBackdrop.classList.add('hidden');
      if (dialog) {
        dialog.style.opacity = '';
        dialog.style.transform = '';
        dialog.style.transition = '';
      }
      if (typeof onComplete === 'function') onComplete();
    };

    if (AnimationManager.isReducedMotion() || !dialog) {
      finalize();
      return;
    }

    const gsap = await AnimationManager.ensureGSAP();
    if (gsap) {
      return new Promise((resolve) => {
        gsap.to(dialog, {
          opacity: 0,
          scale: 0.96,
          y: 2,
          duration: 0.15,
          ease: 'power2.in',
          onComplete: () => {
            finalize();
            resolve();
          },
        });
      });
    }

    // CSS Fallback
    dialog.style.transition = 'opacity 140ms ease-in, transform 140ms ease-in';
    dialog.style.opacity = '0';
    dialog.style.transform = 'scale(0.96) translateY(2px)';
    setTimeout(() => {
      finalize();
    }, 150);
  },
};

// Global attachment
if (typeof window !== 'undefined') {
  window.MicroInteractions = MicroInteractions;
}

export default MicroInteractions;
