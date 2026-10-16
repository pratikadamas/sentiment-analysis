/**
 * Sentiment Pulse - Skeleton Loading Lifecycle Manager (skeletons.js)
 * Coordinates loading skeletons, accessibility states (aria-busy),
 * smooth content swaps, and reduced-motion instant transitions.
 */

import { AnimationManager } from './animation.js';

export const Skeletons = {
  /**
   * Resolve an element or selector safely.
   * @param {Element|string} target
   * @returns {Element|null}
   */
  _resolve(target) {
    if (!target) return null;
    if (typeof target === 'string' && typeof document !== 'undefined') {
      return document.getElementById(target) || document.querySelector(target);
    }
    return target;
  },

  /**
   * Display the skeleton state and hide the content container.
   * Sets aria-busy="true" and aria-hidden attributes appropriately.
   * @param {Element|string} skeletonTarget
   * @param {Element|string} [contentTarget]
   */
  show(skeletonTarget, contentTarget) {
    const skeleton = this._resolve(skeletonTarget);
    const content = this._resolve(contentTarget);

    if (skeleton) {
      if (skeleton.classList && typeof skeleton.classList.remove === 'function') {
        skeleton.classList.remove('hidden', 'is-hidden');
      }
      if (typeof skeleton.setAttribute === 'function') {
        skeleton.setAttribute('aria-busy', 'true');
        if (typeof skeleton.removeAttribute === 'function') {
          skeleton.removeAttribute('aria-hidden');
        }
      }
    }

    if (content) {
      if (content.classList && typeof content.classList.add === 'function') {
        content.classList.add('hidden');
      }
      if (typeof content.setAttribute === 'function') {
        content.setAttribute('aria-hidden', 'true');
      }
    }
  },

  /**
   * Hide the skeleton state and mark loading as finished.
   * @param {Element|string} skeletonTarget
   * @param {Element|string} [contentTarget]
   */
  hide(skeletonTarget, contentTarget) {
    const skeleton = this._resolve(skeletonTarget);
    const content = this._resolve(contentTarget);

    if (skeleton) {
      if (skeleton.classList && typeof skeleton.classList.add === 'function') {
        skeleton.classList.add('hidden');
      }
      if (typeof skeleton.setAttribute === 'function') {
        skeleton.setAttribute('aria-busy', 'false');
        skeleton.setAttribute('aria-hidden', 'true');
      }
    }

    if (content) {
      if (content.classList && typeof content.classList.remove === 'function') {
        content.classList.remove('hidden');
      }
      if (typeof content.removeAttribute === 'function') {
        content.removeAttribute('aria-hidden');
      }
    }
  },

  /**
   * Perform an accessible swap from skeleton to loaded content.
   * Under reduced motion: instant DOM swap.
   * Under standard motion: rapid crossfade / transition.
   * @param {Element|string} skeletonTarget
   * @param {Element|string} contentTarget
   * @param {Object} [options={}]
   * @returns {Promise<void>}
   */
  async swap(skeletonTarget, contentTarget, options = {}) {
    const skeleton = this._resolve(skeletonTarget);
    const content = this._resolve(contentTarget);

    if (!skeleton && !content) return Promise.resolve();

    const isReduced =
      AnimationManager && typeof AnimationManager.isReducedMotion === 'function'
        ? AnimationManager.isReducedMotion()
        : false;

    // Reduced motion or missing container: execute instant swap
    if (isReduced || !skeleton || !content) {
      this.hide(skeleton, content);
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return Promise.resolve();
    }

    // Normal motion: subtle crossfade
    return new Promise((resolve) => {
      if (typeof skeleton.setAttribute === 'function') {
        skeleton.setAttribute('aria-busy', 'false');
      }

      if (skeleton.classList && typeof skeleton.classList.add === 'function') {
        skeleton.classList.add('skeleton-crossfade');
        skeleton.classList.add('is-hidden');
      }

      const cleanup = () => {
        if (skeleton.classList) {
          skeleton.classList.add('hidden');
          skeleton.classList.remove('skeleton-crossfade', 'is-hidden');
        }
        if (typeof skeleton.setAttribute === 'function') {
          skeleton.setAttribute('aria-hidden', 'true');
        }

        if (content) {
          if (content.classList) {
            content.classList.remove('hidden');
            content.classList.remove('is-hidden');
          }
          if (typeof content.removeAttribute === 'function') {
            content.removeAttribute('aria-hidden');
          }
        }

        if (typeof options.onComplete === 'function') {
          options.onComplete();
        }
        resolve();
      };

      setTimeout(cleanup, 150);
    });
  },
};

if (typeof window !== 'undefined') {
  window.Skeletons = Skeletons;
}

export default Skeletons;
