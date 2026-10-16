/**
 * Sentiment Pulse - Declarative Reveal Engine (reveal.js)
 * Lightweight IntersectionObserver-based reveal engine supporting data-reveal,
 * data-stagger, and data-reveal-delay attributes with automatic reduced-motion handling.
 */

import { AnimationManager } from './animation.js';

export const RevealEngine = {
  _observer: null,
  _mutationObserver: null,
  _trackedElements: new WeakSet(),
  _defaultThreshold: 0.1,
  _defaultRootMargin: '0px 0px -30px 0px',

  /**
   * Safely parse delay or stagger integer values from attributes.
   * @param {string|null} val
   * @param {number} [fallback=0]
   * @returns {number}
   */
  parseAttributeNumber(val, fallback = 0) {
    if (val === null || val === undefined || val === '') return fallback;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? fallback : parsed;
  },

  /**
   * Calculate effective reveal delay in milliseconds considering element delay and parent stagger.
   * @param {Element} element
   * @returns {number}
   */
  calculateDelay(element) {
    if (!element || !element.getAttribute) return 0;

    let delay = this.parseAttributeNumber(element.getAttribute('data-reveal-delay'), 0);

    // Check for parent or self stagger container
    const staggerParent = element.closest('[data-stagger]');
    if (staggerParent) {
      const staggerStep = this.parseAttributeNumber(
        staggerParent.getAttribute('data-stagger'),
        50
      );
      const siblings = Array.from(staggerParent.querySelectorAll('[data-reveal]'));
      const index = siblings.indexOf(element);
      if (index >= 0) {
        delay += index * staggerStep;
      }
    }

    return delay;
  },

  /**
   * Immediately reveal an element, applying transition delay if specified.
   * @param {Element} element
   */
  revealElement(element) {
    if (!element || element.classList.contains('is-revealed')) return;

    if (AnimationManager.isReducedMotion()) {
      element.classList.add('is-revealed');
      element.style.transitionDelay = '0ms';
      return;
    }

    const delay = this.calculateDelay(element);
    if (delay > 0) {
      element.style.transitionDelay = `${delay}ms`;
    }

    // Force frame if necessary, then add class
    element.classList.add('is-revealed');
  },

  /**
   * Scan and observe all elements matching [data-reveal] within container.
   * @param {Element|Document} [container=document]
   */
  observe(container = typeof document !== 'undefined' ? document : null) {
    if (!container || typeof container.querySelectorAll !== 'function') return;

    const elements = container.querySelectorAll('[data-reveal]:not(.is-revealed)');
    if (elements.length === 0) return;

    // Rule 6: Under reduced motion, immediately reveal all elements without observing
    if (AnimationManager.isReducedMotion()) {
      elements.forEach((el) => this.revealElement(el));
      return;
    }

    if (!this._observer && typeof IntersectionObserver !== 'undefined') {
      this._initObserver();
    }

    elements.forEach((el) => {
      if (!this._trackedElements.has(el)) {
        this._trackedElements.add(el);
        if (this._observer) {
          this._observer.observe(el);
        } else {
          // Fallback if IntersectionObserver is unsupported
          this.revealElement(el);
        }
      }
    });
  },

  /**
   * Initialize shared IntersectionObserver.
   * @private
   */
  _initObserver() {
    this._observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.revealElement(entry.target);
            // Unobserve immediately after first reveal to conserve memory and frame cost
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: this._defaultThreshold,
        rootMargin: this._defaultRootMargin,
      }
    );
  },

  /**
   * Disconnect observers and clear tracked elements.
   */
  disconnect() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
  },
};

// Auto-run reveal observation on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RevealEngine.observe());
  } else {
    RevealEngine.observe();
  }
}

if (typeof window !== 'undefined') {
  window.RevealEngine = RevealEngine;
}

export default RevealEngine;
