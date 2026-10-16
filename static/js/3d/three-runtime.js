/**
 * Sentiment Pulse - 3D Runtime Facade (three-runtime.js)
 * High-level coordinator connecting the 3D subsystem with App routing, controllers, theme, and motion.
 */

import { FallbackController } from './core/fallback-controller.js';
import { PerformanceGovernor } from './core/performance-governor.js';
import { RendererManager } from './core/renderer-manager.js';
import { CameraRig } from './core/camera-rig.js';
import { SceneManager } from './core/scene-manager.js';
import { OverviewScene } from './scenes/overview-scene.js';
import { AnalyzeScene } from './scenes/analyze-scene.js';

export const ThreeRuntime = {
  _initialized: false,
  _activeView: null,

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // 1. Check capability
    if (!FallbackController.isWebGLAvailable()) {
      console.info('[ThreeRuntime] WebGL is unavailable. Running in high-performance 2D DOM mode.');
      this._applyFallbackStates();
      return;
    }

    // 2. Initialize Core Subsystems
    PerformanceGovernor.init();
    CameraRig.init();

    // 3. Register Scenes
    SceneManager.registerScene('overview', OverviewScene);
    SceneManager.registerScene('analyze', AnalyzeScene);

    // 4. Synchronize with current theme
    const isDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    SceneManager.setTheme(isDark);

    if (typeof window !== 'undefined') {
      window.addEventListener('theme-changed', (e) => {
        const dark = e.detail && e.detail.isDark !== undefined ? e.detail.isDark : true;
        SceneManager.setTheme(dark);
      });
    }

    // 5. Synchronize with reduced motion changes
    if (typeof window !== 'undefined' && window.AnimationManager) {
      window.AnimationManager.onReducedMotionChange((_isReduced) => {
        PerformanceGovernor.markDirty();
        this._applyFallbackStates();
      });
    }

    // 6. Synchronize rendering loop with PerformanceGovernor pause/resume
    PerformanceGovernor.onStateChange((active) => {
      if (active) {
        SceneManager.startLoop();
      } else {
        SceneManager.stopLoop();
      }
    });

    // 7. Start the rendering loop
    SceneManager.startLoop();

    // Listen to resize on renderer
    RendererManager.onResize((_w, _h, aspect) => {
      CameraRig.updateAspect(aspect);
    });
  },

  _applyFallbackStates() {
    const overviewStage = document.getElementById('overview-3d-stage');
    const analyzeStage = document.getElementById('analyze-3d-stage');
    if (overviewStage) FallbackController.applyFallback(overviewStage);
    if (analyzeStage) FallbackController.applyFallback(analyzeStage);
  },

  /**
   * Transition 3D subsystem when SPA route changes.
   * @param {string} viewName - Active view name ('overview', 'analyze', etc.)
   * @param {Object} [params]
   */
  async transitionToView(viewName, params = {}) {
    if (!this._initialized) {
      await this.init();
    }

    if (!FallbackController.shouldRender3D()) {
      this._applyFallbackStates();
      return;
    }

    this._activeView = viewName;

    // Attach persistent renderer canvas to active view stage
    let stage = null;
    if (viewName === 'overview') {
      stage = document.getElementById('overview-3d-stage');
    } else if (viewName === 'analyze') {
      stage = document.getElementById('analyze-3d-stage');
    }

    if (stage) {
      RendererManager.init({ container: stage });
      RendererManager.attachTo(stage);
      FallbackController.applyFallback(stage);
      await SceneManager.activateScene(viewName, params);
      PerformanceGovernor.resume();
    } else {
      // For views without an active 3D stage (e.g. explorer, import-export),
      // pause rendering to save battery and GPU cycles!
      PerformanceGovernor.pause();
    }
  },

  /**
   * Update Overview Scene with real feedback stats.
   * @param {Object} stats
   * @param {Object} analytics
   */
  updateOverviewData(stats, analytics) {
    if (this._activeView === 'overview') {
      const scene = SceneManager.getScene('overview');
      if (scene && typeof scene.updateData === 'function') {
        scene.updateData({ stats, analytics });
      }
    }
  },

  /**
   * Trigger analyzing spinner state on Analyze Scene.
   */
  setAnalyzing() {
    if (this._activeView === 'analyze') {
      const scene = SceneManager.getScene('analyze');
      if (scene && typeof scene.setAnalyzing === 'function') {
        scene.setAnalyzing();
      }
    }
  },

  /**
   * Update Analyze Scene with real prediction result.
   * @param {Object} result
   */
  setAnalyzeResult(result) {
    if (this._activeView === 'analyze') {
      const scene = SceneManager.getScene('analyze');
      if (scene && typeof scene.setResult === 'function') {
        scene.setResult(result);
      }
    }
  },

  /**
   * Reset Analyze Scene to idle.
   */
  resetAnalyze() {
    if (this._activeView === 'analyze') {
      const scene = SceneManager.getScene('analyze');
      if (scene && typeof scene.resetToIdle === 'function') {
        scene.resetToIdle();
      }
    }
  },

  dispose() {
    SceneManager.dispose();
    RendererManager.dispose();
    CameraRig.dispose();
    this._initialized = false;
  },
};

if (typeof window !== 'undefined') {
  window.ThreeRuntime = ThreeRuntime;
}
