/**
 * Sentiment Pulse - Router Visual Transitions (transitions.js)
 * Implements priority-based view transitions:
 * 1. prefers-reduced-motion -> Instant swap
 * 2. document.startViewTransition() -> Native View Transition API
 * 3. GSAP fallback (150ms outgoing fade+slide, swap, 350ms incoming fade+slide)
 * 4. Instant fallback if GSAP is unavailable
 *
 * NOTE: This module controls VISUAL transitions only.
 * The application router (app.js) retains full ownership of routing state and DOM swap.
 */

import { AnimationManager } from './animation.js';

export const ViewTransitions = {
  _currentSeq: 0,
  _activeTween: null,
  _activeResolve: null,
  _isTransitioning: false,

  /**
   * Execute a view transition.
   *
   * @param {Object} options
   * @param {string} options.fromView - Identifier of outgoing view
   * @param {string} options.toView - Identifier of incoming view
   * @param {Element|null} options.fromEl - Outgoing view container element
   * @param {Element|null} options.toEl - Incoming view container element
   * @param {Function} options.swap - Synchronous callback that performs the actual DOM view swap
   * @returns {Promise<void>}
   */
  async transition({ fromView, toView, fromEl, toEl, swap }) {
    if (typeof swap !== 'function') {
      return;
    }

    // Fast-path: Same view or missing DOM containers
    if (fromView === toView || !fromEl || !toEl) {
      swap();
      return;
    }

    const seq = ++this._currentSeq;

    // Rule 6 & 8: Reduced motion takes absolute precedence over all transition animations
    if (AnimationManager.isReducedMotion()) {
      this._cancelActiveTween();
      swap();
      return;
    }

    // Priority 1: Native View Transition API
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      this._cancelActiveTween();
      try {
        const vt = document.startViewTransition(() => {
          swap();
        });
        await vt.finished;
        return;
      } catch (err) {
        console.warn('[ViewTransitions] Native transition failed or aborted, falling back:', err);
        swap();
        return;
      }
    }

    // Priority 2: GSAP Fallback
    try {
      const gsap = await AnimationManager.ensureGSAP();

      // Check if a newer transition request arrived while awaiting GSAP
      if (seq !== this._currentSeq) {
        return;
      }

      if (!gsap) {
        // Priority 3: Instant fallback if GSAP is unavailable
        swap();
        return;
      }

      this._isTransitioning = true;
      this._cancelActiveTween();

      // Animate outgoing view (150ms fade + slight slide up)
      await new Promise((resolve) => {
        this._activeResolve = resolve;
        this._activeTween = gsap.to(fromEl, {
          opacity: 0,
          y: -8,
          duration: 0.15,
          ease: 'power2.in',
          onComplete: () => {
            this._activeTween = null;
            this._activeResolve = null;
            resolve();
          },
        });
      });

      // Check race condition before swapping DOM
      if (seq !== this._currentSeq) {
        this._resetElementStyles(fromEl);
        return;
      }

      // Execute router DOM swap
      swap();

      // Reset outgoing element styles cleanly for future visits
      this._resetElementStyles(fromEl);

      // Animate incoming view (350ms fade + slide up into place)
      await new Promise((resolve) => {
        this._activeResolve = resolve;
        this._activeTween = gsap.fromTo(
          toEl,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            ease: 'power3.out',
            onComplete: () => {
              this._activeTween = null;
              this._activeResolve = null;
              this._resetElementStyles(toEl);
              this._isTransitioning = false;
              resolve();
            },
          }
        );
      });
    } catch (err) {
      console.warn('[ViewTransitions] GSAP transition error, executing instant swap:', err);
      this._resetElementStyles(fromEl);
      this._resetElementStyles(toEl);
      this._isTransitioning = false;
      swap();
    }
  },

  /**
   * Cancel any running GSAP tween during rapid navigation.
   * @private
   */
  _cancelActiveTween() {
    if (this._activeTween && typeof this._activeTween.kill === 'function') {
      try {
        this._activeTween.kill();
      } catch {
        // Ignore kill errors
      }
      this._activeTween = null;
    }
    if (this._activeResolve) {
      const resolve = this._activeResolve;
      this._activeResolve = null;
      resolve();
    }
    this._isTransitioning = false;
  },

  /**
   * Reset inline opacity and transform styles applied during tweening.
   * @private
   */
  _resetElementStyles(el) {
    if (el && el.style) {
      el.style.opacity = '';
      el.style.transform = '';
    }
  },
};

if (typeof window !== 'undefined') {
  window.ViewTransitions = ViewTransitions;
}

export default ViewTransitions;
