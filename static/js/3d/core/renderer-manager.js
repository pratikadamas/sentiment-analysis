/**
 * Sentiment Pulse - 3D Renderer Manager (renderer-manager.js)
 * Owns a single persistent WebGLRenderer and canvas, handles resizing, DPR, and context safety.
 */

import * as THREE from '../../lib/vendor/three.module.js';
import { PerformanceGovernor } from './performance-governor.js';
import { FallbackController } from './fallback-controller.js';

export const RendererManager = {
  _renderer: null,
  _canvas: null,
  _container: null,
  _resizeObserver: null,
  _width: 0,
  _height: 0,
  _contextLost: false,
  _isDisposed: false,
  _resizeListeners: new Set(),

  /**
   * Initialize persistent WebGLRenderer.
   * @param {Object} [options]
   * @param {HTMLElement} [options.container] - Initial host container
   * @returns {THREE.WebGLRenderer|null}
   */
  init(options = {}) {
    if (this._renderer && !this._isDisposed) {
      if (options.container) {
        this.attachTo(options.container);
      }
      return this._renderer;
    }

    if (!FallbackController.isWebGLAvailable()) {
      console.warn('[RendererManager] WebGL not supported. Rendering disabled.');
      return null;
    }

    PerformanceGovernor.init();

    // Create or retrieve persistent canvas
    let canvas = document.getElementById('sentiment-3d-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sentiment-3d-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('role', 'presentation');
      canvas.tabIndex = -1;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.outline = 'none';
      canvas.style.touchAction = 'none';
    }
    this._canvas = canvas;

    // Attach WebGL context loss listeners
    this._canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[RendererManager] WebGL Context Lost.');
      this._contextLost = true;
      PerformanceGovernor.pause();
    });

    this._canvas.addEventListener('webglcontextrestored', () => {
      console.info('[RendererManager] WebGL Context Restored.');
      this._contextLost = false;
      this.init({ container: this._container });
      PerformanceGovernor.resume();
    });

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this._canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      });

      renderer.setPixelRatio(PerformanceGovernor.getDpr());
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      this._renderer = renderer;
      this._isDisposed = false;

      if (options.container) {
        this.attachTo(options.container);
      }

      this._setupResizeListener();
      return this._renderer;
    } catch (err) {
      console.error('[RendererManager] Failed to construct WebGLRenderer:', err);
      return null;
    }
  },

  /**
   * Attaches the persistent canvas to a specific DOM stage container.
   * Moving canvas in DOM preserves WebGL context!
   * @param {HTMLElement} container
   */
  attachTo(container) {
    if (!container || !this._canvas) return;
    this._container = container;

    if (this._canvas.parentElement !== container) {
      container.appendChild(this._canvas);
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver.observe(this._container);
    } else if (typeof ResizeObserver !== 'undefined') {
      this._setupResizeListener();
    }

    this.resize();
  },

  /**
   * Detaches canvas from container without disposing WebGL context.
   */
  detach() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    if (this._canvas && this._canvas.parentElement) {
      this._canvas.parentElement.removeChild(this._canvas);
    }
    this._container = null;
  },

  _setupResizeListener() {
    if (typeof ResizeObserver !== 'undefined' && this._container) {
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
      this._resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this._resizeObserver.observe(this._container);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
    }
  },

  resize(width, height) {
    if (!this._renderer || !this._container) return;

    const w = width !== undefined ? width : this._container.clientWidth || 300;
    const h = height !== undefined ? height : this._container.clientHeight || 250;

    if (w === this._width && h === this._height) return;

    this._width = w;
    this._height = h;

    this._renderer.setPixelRatio(PerformanceGovernor.getDpr());
    this._renderer.setSize(w, h, false);

    PerformanceGovernor.markDirty();

    this._resizeListeners.forEach((fn) => {
      try {
        fn(w, h, w / (h || 1));
      } catch (err) {
        console.warn('[RendererManager] Error in resize listener:', err);
      }
    });
  },

  onResize(callback) {
    if (typeof callback === 'function') {
      this._resizeListeners.add(callback);
      return () => this._resizeListeners.delete(callback);
    }
    return () => {};
  },

  render(scene, camera) {
    if (!this._renderer || !scene || !camera || this._contextLost) return;
    this._renderer.render(scene, camera);
  },

  getRenderer() {
    return this._renderer;
  },

  getCanvas() {
    return this._canvas;
  },

  getWidth() {
    return this._width;
  },

  getHeight() {
    return this._height;
  },

  getAspectRatio() {
    return (this._width || 1) / (this._height || 1);
  },

  dispose() {
    if (this._isDisposed) return;
    this._isDisposed = true;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    this.detach();
    this._resizeListeners.clear();
  },
};

if (typeof window !== 'undefined') {
  window.RendererManager = RendererManager;
}
