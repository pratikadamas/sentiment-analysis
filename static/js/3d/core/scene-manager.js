/**
 * Sentiment Pulse - 3D Scene Manager (scene-manager.js)
 * Coordinates view scene lifecycles, RAF animation loop, theme synchronization, and resource disposal.
 */

import { RendererManager } from './renderer-manager.js';
import { CameraRig } from './camera-rig.js';
import { PerformanceGovernor } from './performance-governor.js';
import { FallbackController } from './fallback-controller.js';

export const SceneManager = {
  _scenes: new Map(),
  _activeSceneName: null,
  _activeScene: null,
  _rafId: null,
  _isRunning: false,
  _lastTime: 0,
  _isDarkTheme: false,

  /**
   * Register a view scene module.
   * @param {string} name
   * @param {Object} sceneInstance
   */
  registerScene(name, sceneInstance) {
    if (!name || !sceneInstance) return;
    this._scenes.set(name, sceneInstance);
  },

  /**
   * Retrieve registered scene.
   * @param {string} name
   * @returns {Object|null}
   */
  getScene(name) {
    return this._scenes.get(name) || null;
  },

  getActiveScene() {
    return this._activeScene;
  },

  getActiveSceneName() {
    return this._activeSceneName;
  },

  /**
   * Switch the active 3D scene to match the SPA view.
   * @param {string} name
   * @param {Object} [params]
   * @returns {Promise<void>}
   */
  async activateScene(name, params = {}) {
    if (!FallbackController.shouldRender3D()) {
      return;
    }

    if (this._activeSceneName === name && this._activeScene) {
      if (typeof this._activeScene.updateData === 'function' && params.data) {
        this._activeScene.updateData(params.data);
      }
      return;
    }

    const nextScene = this._scenes.get(name);

    // Exit outgoing scene
    if (this._activeScene && typeof this._activeScene.exit === 'function') {
      try {
        await this._activeScene.exit();
      } catch (err) {
        console.warn(`[SceneManager] Error exiting scene ${this._activeSceneName}:`, err);
      }
    }

    this._activeSceneName = name;
    this._activeScene = nextScene || null;

    if (this._activeScene) {
      if (typeof this._activeScene.init === 'function') {
        await this._activeScene.init();
      }

      if (typeof this._activeScene.setTheme === 'function') {
        this._activeScene.setTheme(this._isDarkTheme);
      }

      if (typeof this._activeScene.enter === 'function') {
        await this._activeScene.enter(params);
      }

      // Configure CameraRig if scene specifies default camera setup
      if (typeof this._activeScene.getCameraSetup === 'function') {
        const setup = this._activeScene.getCameraSetup();
        if (setup) {
          CameraRig.transitionTo(setup.position, setup.target, setup.duration || 0.6);
        }
      }

      PerformanceGovernor.markDirty();
    }
  },

  /**
   * Start the RAF rendering loop.
   */
  startLoop() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._lastTime = performance.now();

    const loop = (now) => {
      if (!this._isRunning) return;

      this._rafId = requestAnimationFrame(loop);

      if (PerformanceGovernor.isPaused()) {
        return;
      }

      const delta = Math.min((now - this._lastTime) / 1000, 0.1);
      this._lastTime = now;

      CameraRig.update(delta);

      if (this._activeScene && typeof this._activeScene.update === 'function') {
        this._activeScene.update(delta, now);
      }

      if (this._activeScene && typeof this._activeScene.getThreeScene === 'function') {
        const threeScene = this._activeScene.getThreeScene();
        if (threeScene && CameraRig.camera) {
          RendererManager.render(threeScene, CameraRig.camera);
        }
      }

      PerformanceGovernor.recordFrame(now);
    };

    this._rafId = requestAnimationFrame(loop);
  },

  /**
   * Stop the RAF rendering loop.
   */
  stopLoop() {
    this._isRunning = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  },

  /**
   * Broadcast theme update to active and registered scenes.
   * @param {boolean} isDark
   */
  setTheme(isDark) {
    this._isDarkTheme = Boolean(isDark);
    this._scenes.forEach((scene) => {
      if (typeof scene.setTheme === 'function') {
        try {
          scene.setTheme(this._isDarkTheme);
        } catch (err) {
          console.warn('[SceneManager] Error setting theme in scene:', err);
        }
      }
    });
    PerformanceGovernor.markDirty();
  },

  /**
   * Safely dispose all geometries, materials, and textures on a 3D object.
   * @param {THREE.Object3D} object
   */
  disposeObject(object) {
    if (!object) return;

    if (object.children) {
      while (object.children.length > 0) {
        this.disposeObject(object.children[0]);
        object.remove(object.children[0]);
      }
    }

    if (object.geometry && typeof object.geometry.dispose === 'function') {
      object.geometry.dispose();
    }

    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => this.disposeMaterial(mat));
      } else {
        this.disposeMaterial(object.material);
      }
    }
  },

  disposeMaterial(material) {
    if (!material) return;
    Object.keys(material).forEach((prop) => {
      const val = material[prop];
      if (val && typeof val === 'object' && typeof val.dispose === 'function') {
        val.dispose();
      }
    });
    if (typeof material.dispose === 'function') {
      material.dispose();
    }
  },

  /**
   * Teardown all scenes and the rendering loop.
   */
  dispose() {
    this.stopLoop();
    this._scenes.forEach((scene) => {
      if (typeof scene.dispose === 'function') {
        try {
          scene.dispose();
        } catch (err) {
          console.warn('[SceneManager] Error disposing scene:', err);
        }
      }
    });
    this._scenes.clear();
    this._activeScene = null;
    this._activeSceneName = null;
  },
};

if (typeof window !== 'undefined') {
  window.SceneManager = SceneManager;
}
