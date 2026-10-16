/**
 * Sentiment Pulse - 3D Fallback & Capability Controller (fallback-controller.js)
 * Detects WebGL availability, manages reduced-motion fallbacks, and degrades gracefully to 2D.
 */

export const FallbackController = {
  _webglChecked: false,
  _webglAvailable: false,
  _overrideReducedMotion: null,

  /**
   * Detects WebGL support safely by testing temporary context creation.
   * @returns {boolean}
   */
  isWebGLAvailable() {
    if (this._webglChecked) {
      return this._webglAvailable;
    }

    this._webglChecked = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this._webglAvailable = false;
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');

      this._webglAvailable = Boolean(gl);

      // Clean up test context
      if (gl) {
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        if (loseCtx) {
          loseCtx.loseContext();
        }
      }
    } catch {
      this._webglAvailable = false;
    }

    return this._webglAvailable;
  },

  /**
   * Checks whether reduced motion is requested by user OS or application settings.
   * @returns {boolean}
   */
  isReducedMotion() {
    if (this._overrideReducedMotion !== null) {
      return this._overrideReducedMotion;
    }

    if (
      typeof window !== 'undefined' &&
      window.AnimationManager &&
      typeof window.AnimationManager.isReducedMotion === 'function'
    ) {
      return window.AnimationManager.isReducedMotion();
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    return false;
  },

  /**
   * Set explicit reduced motion override for testing or accessibility controls.
   * @param {boolean|null} value
   */
  setReducedMotionOverride(value) {
    this._overrideReducedMotion = value === null ? null : Boolean(value);
  },

  /**
   * Determines if active 3D rendering should proceed.
   * @returns {boolean}
   */
  shouldRender3D() {
    return this.isWebGLAvailable();
  },

  /**
   * Applies CSS fallback classes and accessibility attributes to container.
   * @param {HTMLElement} [container]
   */
  applyFallback(container) {
    if (!container) return;
    const is3D = this.shouldRender3D();
    const isReduced = this.isReducedMotion();

    if (!is3D) {
      container.classList.add('no-webgl-fallback');
      container.setAttribute('data-webgl-status', 'unsupported');
    } else {
      container.classList.remove('no-webgl-fallback');
      container.setAttribute('data-webgl-status', 'supported');
    }

    if (isReduced) {
      container.classList.add('reduced-motion-3d');
    } else {
      container.classList.remove('reduced-motion-3d');
    }
  },
};

if (typeof window !== 'undefined') {
  window.FallbackController = FallbackController;
}
