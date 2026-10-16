/**
 * Tests for 3D Runtime Subsystem
 * Verified via Node.js native test runner: node --test tests/frontend/three-subsystem.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { FallbackController } from '../../static/js/3d/core/fallback-controller.js';
import { PerformanceGovernor } from '../../static/js/3d/core/performance-governor.js';
import { SceneManager } from '../../static/js/3d/core/scene-manager.js';
import { RendererManager } from '../../static/js/3d/core/renderer-manager.js';
import { OverviewScene } from '../../static/js/3d/scenes/overview-scene.js';
import { AnalyzeScene } from '../../static/js/3d/scenes/analyze-scene.js';
import * as THREE from '../../static/js/lib/vendor/three.module.js';

describe('3D Runtime Subsystem', () => {
  describe('FallbackController', () => {
    it('safely handles WebGL availability check in non-browser context', () => {
      // In pure Node.js without DOM, isWebGLAvailable returns false cleanly
      const isAvailable = FallbackController.isWebGLAvailable();
      assert.equal(typeof isAvailable, 'boolean');
      assert.equal(isAvailable, false);
    });

    it('respects reduced-motion override', () => {
      FallbackController.setReducedMotionOverride(true);
      assert.equal(FallbackController.isReducedMotion(), true);

      FallbackController.setReducedMotionOverride(false);
      assert.equal(FallbackController.isReducedMotion(), false);

      FallbackController.setReducedMotionOverride(null);
    });

    it('applies fallback CSS classes cleanly on dummy element', () => {
      const mockElement = {
        classList: {
          classes: new Set(),
          add(c) {
            this.classes.add(c);
          },
          remove(c) {
            this.classes.delete(c);
          },
          contains(c) {
            return this.classes.has(c);
          },
        },
        attrs: {},
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
      };

      FallbackController.applyFallback(mockElement);
      assert.ok(mockElement.classList.contains('no-webgl-fallback'));
      assert.equal(mockElement.attrs['data-webgl-status'], 'unsupported');
    });
  });

  describe('PerformanceGovernor', () => {
    beforeEach(() => {
      PerformanceGovernor.reset();
    });

    it('clamps DPR to configurable boundaries', () => {
      PerformanceGovernor.init({ minDpr: 1.0, maxDpr: 2.0 });

      PerformanceGovernor.setDpr(0.5);
      assert.equal(PerformanceGovernor.getDpr(), 1.0);

      PerformanceGovernor.setDpr(3.0);
      assert.equal(PerformanceGovernor.getDpr(), 2.0);

      PerformanceGovernor.setDpr(1.5);
      assert.equal(PerformanceGovernor.getDpr(), 1.5);
    });

    it('manages dirty flag and pause/resume states', () => {
      PerformanceGovernor.markDirty();
      assert.equal(PerformanceGovernor.isDirty(), true);
      PerformanceGovernor.clearDirty();
      assert.equal(PerformanceGovernor.isDirty(), false);

      PerformanceGovernor.pause();
      assert.equal(PerformanceGovernor.isPaused(), true);

      PerformanceGovernor.resume();
      assert.equal(PerformanceGovernor.isPaused(), false);
      assert.equal(PerformanceGovernor.isDirty(), true);
    });

    it('dispatches state change events when paused and resumed', () => {
      const stateHistory = [];
      const unsubscribe = PerformanceGovernor.onStateChange((active) => {
        stateHistory.push(active);
      });

      PerformanceGovernor.pause();
      PerformanceGovernor.resume();
      unsubscribe();
      PerformanceGovernor.pause();

      assert.deepEqual(stateHistory, [false, true]);
    });

    it('adapts quality tiers based on frame timings', () => {
      PerformanceGovernor.init();
      assert.equal(PerformanceGovernor.getQualityTier(), 'high');

      // Simulate sustained frame drops (> 40ms delta = < 25fps)
      let time = 1000;
      for (let i = 0; i < 35; i++) {
        time += 50;
        PerformanceGovernor.recordFrame(time);
      }

      assert.equal(PerformanceGovernor.getQualityTier(), 'medium');
    });
  });

  describe('RendererManager Container Reparenting', () => {
    it('manages container attachment and detachment safely', () => {
      const observedTargets = [];
      let disconnected = false;

      RendererManager._resizeObserver = {
        observe: (t) => observedTargets.push(t),
        disconnect: () => {
          disconnected = true;
        },
      };

      const mockContainer1 = { clientWidth: 400, clientHeight: 300, appendChild: () => {} };
      const mockContainer2 = { clientWidth: 500, clientHeight: 350, appendChild: () => {} };
      RendererManager._canvas = { parentElement: null };

      RendererManager.attachTo(mockContainer1);
      assert.equal(RendererManager._container, mockContainer1);
      assert.equal(observedTargets[observedTargets.length - 1], mockContainer1);

      RendererManager.attachTo(mockContainer2);
      assert.equal(RendererManager._container, mockContainer2);
      assert.equal(observedTargets[observedTargets.length - 1], mockContainer2);

      RendererManager.detach();
      assert.equal(RendererManager._container, null);
      assert.equal(disconnected, true);
    });
  });

  describe('SceneManager Resource Lifecycle', () => {
    it('registers and retrieves scene modules', () => {
      const mockScene = {
        init: () => {},
        getThreeScene: () => null,
      };

      SceneManager.registerScene('testScene', mockScene);
      assert.equal(SceneManager.getScene('testScene'), mockScene);
      assert.equal(SceneManager.getScene('nonexistent'), null);
    });

    it('recursively disposes Three.js geometries and materials without throwing', () => {
      let geoDisposed = false;
      let matDisposed = false;

      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.dispose = () => {
        geoDisposed = true;
      };

      const material = new THREE.MeshBasicMaterial();
      material.dispose = () => {
        matDisposed = true;
      };

      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      SceneManager.disposeObject(group);

      assert.equal(geoDisposed, true);
      assert.equal(matDisposed, true);
      assert.equal(group.children.length, 0);
    });

    it('OverviewScene._disposeObject recursively cleans up nested children', () => {
      let geoDisposed = false;
      let matDisposed = false;

      const root = new THREE.Group();
      const subGroup = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(1, 1);
      geo.dispose = () => {
        geoDisposed = true;
      };
      const mat = new THREE.MeshStandardMaterial();
      mat.dispose = () => {
        matDisposed = true;
      };

      const mesh = new THREE.Mesh(geo, mat);
      subGroup.add(mesh);
      root.add(subGroup);

      OverviewScene._disposeObject(root);

      assert.equal(geoDisposed, true);
      assert.equal(matDisposed, true);
      assert.equal(root.children.length, 0);
    });

    it('AnalyzeScene._disposeObject recursively cleans up nested children', () => {
      let geoDisposed = false;
      let matDisposed = false;

      const root = new THREE.Group();
      const subGroup = new THREE.Group();
      const geo = new THREE.DodecahedronGeometry(1, 1);
      geo.dispose = () => {
        geoDisposed = true;
      };
      const mat = new THREE.MeshBasicMaterial();
      mat.dispose = () => {
        matDisposed = true;
      };

      const mesh = new THREE.Mesh(geo, mat);
      subGroup.add(mesh);
      root.add(subGroup);

      AnalyzeScene._disposeObject(root);

      assert.equal(geoDisposed, true);
      assert.equal(matDisposed, true);
      assert.equal(root.children.length, 0);
    });

    it('broadcasts theme changes to registered scenes', () => {
      let receivedDark = null;
      const mockScene = {
        setTheme(isDark) {
          receivedDark = isDark;
        },
      };

      SceneManager.registerScene('themedScene', mockScene);
      SceneManager.setTheme(true);
      assert.equal(receivedDark, true);

      SceneManager.setTheme(false);
      assert.equal(receivedDark, false);
    });
  });
});
