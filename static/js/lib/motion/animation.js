/**
 * Sentiment Pulse - Central Animation Orchestrator (animation.js)
 * Manages reduced-motion state, view lifecycle, animation cleanup, and safe vendor invocation.
 */

import { VendorLoader } from './vendor-loader.js';
import { getPreset } from './presets.js';

export const AnimationManager = {
  _initialized: false,
  _isReducedMotion: false,
  _mediaQuery: null,
  _listeners: new Set(),
  _activeAnimations: new Map(), // viewName -> Set of active tweens/timelines
  _currentView: 'overview',
  _gsap: null,
  _flip: null,

  /**
   * Initialize AnimationManager and reduced-motion listener.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        this._mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this._isReducedMotion = Boolean(this._mediaQuery.matches);

        // Listen for OS or browser preference changes in real-time
        const handlePrefChange = (e) => {
          this.setReducedMotion(e.matches);
        };

        if (typeof this._mediaQuery.addEventListener === 'function') {
          this._mediaQuery.addEventListener('change', handlePrefChange);
        } else if (typeof this._mediaQuery.addListener === 'function') {
          this._mediaQuery.addListener(handlePrefChange);
        }
      } catch (err) {
        console.warn('[AnimationManager] matchMedia error:', err);
      }
    }
  },

  /**
   * Check whether reduced motion is currently active.
   * @returns {boolean}
   */
  isReducedMotion() {
    if (!this._initialized) {
      this.init();
    }
    return Boolean(this._isReducedMotion);
  },

  /**
   * Explicitly set reduced-motion mode (programmatic or preference change).
   * @param {boolean} value
   */
  setReducedMotion(value) {
    const nextVal = Boolean(value);
    const changed = this._isReducedMotion !== nextVal;
    this._isReducedMotion = nextVal;

    if (changed) {
      if (this._isReducedMotion) {
        // Immediately kill active animations when reduced motion is turned on
        this.killAll();
      }
      this._listeners.forEach((fn) => {
        try {
          fn(this._isReducedMotion);
        } catch (err) {
          console.error('[AnimationManager] Error in reduced-motion listener:', err);
        }
      });
    }
  },

  /**
   * Subscribe to reduced-motion state changes.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onReducedMotionChange(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
      return () => this._listeners.delete(callback);
    }
    return () => {};
  },

  /**
   * Safely load GSAP via VendorLoader only when orchestration requires it.
   * @returns {Promise<any>} Resolves with GSAP global or null.
   */
  async ensureGSAP() {
    if (this._gsap) return this._gsap;
    if (typeof window !== 'undefined' && window.gsap) {
      this._gsap = window.gsap;
      return this._gsap;
    }

    try {
      const gsap = await VendorLoader.loadVendor('gsap');
      if (gsap) {
        this._gsap = gsap;
      }
      return this._gsap;
    } catch (err) {
      console.warn('[AnimationManager] Failed to load GSAP:', err);
      return null;
    }
  },

  /**
   * Safely load GSAP Flip plugin via VendorLoader and register with GSAP.
   * @returns {Promise<any>} Resolves with Flip global or null.
   */
  async ensureFlip() {
    if (this._flip) return this._flip;
    if (typeof window !== 'undefined' && window.Flip) {
      this._flip = window.Flip;
      return this._flip;
    }

    try {
      const gsap = await this.ensureGSAP();
      if (!gsap) return null;

      const flip = await VendorLoader.loadVendor('flip');
      const resolvedFlip = flip || (typeof window !== 'undefined' ? window.Flip : null);
      if (resolvedFlip && gsap && typeof gsap.registerPlugin === 'function') {
        try {
          gsap.registerPlugin(resolvedFlip);
        } catch (regErr) {
          console.warn('[AnimationManager] Failed to register Flip plugin:', regErr);
        }
      }
      this._flip = resolvedFlip;
      return this._flip;
    } catch (err) {
      console.warn('[AnimationManager] Failed to load Flip:', err);
      return null;
    }
  },

  /**
   * Capture layout state before DOM modification.
   * Returns null if reduced motion is active or Flip is unavailable.
   * @param {string|Element|Element[]} targets
   * @returns {Promise<any>}
   */
  async recordFlipState(targets) {
    if (this.isReducedMotion() || !targets) return null;
    try {
      const flip = await this.ensureFlip();
      if (!flip || typeof flip.getState !== 'function') return null;
      return flip.getState(targets);
    } catch (err) {
      console.warn('[AnimationManager] recordFlipState error:', err);
      return null;
    }
  },

  /**
   * Animate elements from previous layout state to new layout state.
   * Automatically tracks tween in view lifecycle bucket.
   * @param {any} state - Flip state object
   * @param {Object} [options={}] - Flip options (duration, ease, stagger, etc.)
   * @param {string} [viewName=this._currentView]
   * @returns {Promise<any>}
   */
  async playFlip(state, options = {}, viewName = this._currentView) {
    if (!state || this.isReducedMotion()) {
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return null;
    }

    try {
      const flip = await this.ensureFlip();
      if (!flip || typeof flip.from !== 'function') {
        if (typeof options.onComplete === 'function') {
          options.onComplete();
        }
        return null;
      }

      let tween = null;
      const originalComplete = options.onComplete;
      const wrappedOptions = {
        duration: 0.3,
        ease: 'power2.out',
        ...options,
        onComplete: () => {
          if (tween && this._activeAnimations.has(viewName)) {
            this._activeAnimations.get(viewName).delete(tween);
          }
          if (typeof originalComplete === 'function') {
            originalComplete();
          }
        },
      };

      tween = flip.from(state, wrappedOptions);
      if (tween) {
        if (!this._activeAnimations.has(viewName)) {
          this._activeAnimations.set(viewName, new Set());
        }
        this._activeAnimations.get(viewName).add(tween);
      }
      return tween;
    } catch (err) {
      console.warn('[AnimationManager] playFlip error:', err);
      if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
      return null;
    }
  },

  /**
   * Track view lifecycle entrance.
   * @param {string} viewName
   * @param {Object} [context={}]
   */
  enterView(viewName, _context = {}) {
    this._currentView = viewName || 'overview';
    if (!this._activeAnimations.has(this._currentView)) {
      this._activeAnimations.set(this._currentView, new Set());
    }
  },

  /**
   * Track view lifecycle exit and perform animation cleanup.
   * @param {string} [viewName=this._currentView]
   * @param {Object} [_context={}]
   */
  exitView(viewName = this._currentView, _context = {}) {
    const targetView = viewName || this._currentView;
    this.killViewAnimations(targetView);
  },

  /**
   * Kill all tracked animations associated with a specific view.
   * @param {string} viewName
   */
  killViewAnimations(viewName) {
    if (!viewName || !this._activeAnimations.has(viewName)) return;

    const set = this._activeAnimations.get(viewName);
    set.forEach((anim) => {
      try {
        if (anim && typeof anim.kill === 'function') {
          anim.kill();
        } else if (anim && typeof anim.revert === 'function') {
          anim.revert();
        }
      } catch (err) {
        console.warn(`[AnimationManager] Error killing animation in view ${viewName}:`, err);
      }
    });

    set.clear();
  },

  /**
   * Kill all animations across all views.
   */
  killAll() {
    this._activeAnimations.forEach((set, viewName) => {
      this.killViewAnimations(viewName);
    });
    this._activeAnimations.clear();

    if (this._gsap && typeof this._gsap.killTweensOf === 'function' && typeof document !== 'undefined') {
      try {
        this._gsap.killTweensOf('*');
      } catch {
        // Ignore broad kill errors
      }
    }
  },

  /**
   * Centralized animation playback function.
   * @param {string} presetName - Named preset from presets.js
   * @param {Element|Element[]|string} target - Target element or selector
   * @param {Object} [options={}] - Custom options / overrides
   * @param {string} [viewName=this._currentView] - Associated view for cleanup tracking
   * @returns {Promise<any>}
   */
  async play(presetName, target, options = {}, viewName = this._currentView) {
    if (!target) return Promise.resolve(null);

    // Rule 6: When reduced motion is enabled, apply final state immediately
    if (this.isReducedMotion()) {
      this._applyFinalState(target, presetName, options);
      return Promise.resolve(target);
    }

    const preset = getPreset(presetName, options);
    const gsap = await this.ensureGSAP();

    if (!gsap) {
      // Graceful fallback when GSAP fails to load
      this._applyFinalState(target, presetName, options);
      return Promise.resolve(target);
    }

    return new Promise((resolve) => {
      let tween = null;

      const onCompleteWrapper = () => {
        if (tween && this._activeAnimations.has(viewName)) {
          this._activeAnimations.get(viewName).delete(tween);
        }
        if (typeof options.onComplete === 'function') {
          options.onComplete();
        }
        resolve(target);
      };

      try {
        if (preset.keyframes) {
          tween = gsap.to(target, {
            keyframes: preset.keyframes,
            duration: options.duration !== undefined ? options.duration : preset.duration,
            ease: options.ease || preset.ease,
            onComplete: onCompleteWrapper,
          });
        } else if (preset.from && preset.to) {
          const toConfig = { ...preset.to, onComplete: onCompleteWrapper };
          tween = gsap.fromTo(target, preset.from, toConfig);
        } else if (preset.to) {
          const toConfig = { ...preset.to, onComplete: onCompleteWrapper };
          tween = gsap.to(target, toConfig);
        } else {
          this._applyFinalState(target, presetName, options);
          resolve(target);
          return;
        }

        if (tween) {
          if (!this._activeAnimations.has(viewName)) {
            this._activeAnimations.set(viewName, new Set());
          }
          this._activeAnimations.get(viewName).add(tween);
        }
      } catch (err) {
        console.warn(`[AnimationManager] Animation play error (${presetName}):`, err);
        this._applyFinalState(target, presetName, options);
        resolve(target);
      }
    });
  },

  /**
   * One-shot bounded celebration burst using self-hosted confetti.
   * Lazily loads confetti vendor only on invocation.
   * Respects prefers-reduced-motion: reduce and fails gracefully.
   * @param {Object} [options={}] - Custom confetti parameters
   * @returns {Promise<boolean>}
   */
  async celebrate(options = {}) {
    if (this.isReducedMotion()) {
      return false;
    }

    try {
      const confetti = await VendorLoader.loadVendor('confetti');
      const confettiFn =
        typeof confetti === 'function'
          ? confetti
          : typeof window !== 'undefined' && typeof window.confetti === 'function'
            ? window.confetti
            : null;

      if (!confettiFn) {
        return false;
      }

      // Safe, bounded one-shot confetti configuration
      const defaults = {
        particleCount: 45,
        spread: 60,
        origin: { y: 0.7 },
        disableForReducedMotion: true,
        ticks: 200,
        zIndex: 1000,
      };

      confettiFn({ ...defaults, ...options });
      return true;
    } catch (err) {
      console.warn('[AnimationManager] Confetti celebration failed gracefully:', err);
      return false;
    }
  },

  /**
   * Internal helper to apply final visual state without animation.
   * @private
   */
  _applyFinalState(target, presetName, options = {}) {
    const elements =
      typeof target === 'string' && typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll(target))
        : Array.isArray(target)
          ? target
          : [target];

    elements.forEach((el) => {
      if (!el || !el.style) return;

      if (presetName === 'viewOut' || presetName === 'fadeOut') {
        el.style.opacity = '0';
      } else {
        el.style.opacity = '1';
        el.style.transform = 'none';
      }
    });

    if (typeof options.onComplete === 'function') {
      options.onComplete();
    }
  },
};

// Initialize manager on load
AnimationManager.init();

if (typeof window !== 'undefined') {
  window.AnimationManager = AnimationManager;
}

export default AnimationManager;
