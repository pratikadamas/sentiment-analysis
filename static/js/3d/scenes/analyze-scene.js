/**
 * Sentiment Pulse - Analyze 3D Scene (analyze-scene.js)
 * Real-time reactive morphing node responding dynamically to ML inference, sentiment class, and confidence.
 */

import * as THREE from '../../lib/vendor/three.module.js';
import { FallbackController } from '../core/fallback-controller.js';
import { PerformanceGovernor } from '../core/performance-governor.js';

export const AnalyzeScene = {
  scene: null,
  coreGroup: null,
  morphMesh: null,
  wireMesh: null,
  ringGroup: null,
  ring1: null,
  ring2: null,
  ambientLight: null,
  directionalLight: null,
  pointLight: null,

  _isInitialized: false,
  _state: 'idle', // 'idle' | 'analyzing' | 'positive' | 'neutral' | 'negative'
  _time: 0,
  _spinSpeed: 0.5,
  _targetColor: new THREE.Color(0x6366f1),
  _currentColor: new THREE.Color(0x6366f1),
  _confidence: 0.8,
  _isDark: true,

  init() {
    if (this._isInitialized) return Promise.resolve();

    this.scene = new THREE.Scene();
    this.coreGroup = new THREE.Group();
    this.ringGroup = new THREE.Group();
    this.scene.add(this.coreGroup);
    this.scene.add(this.ringGroup);

    this._buildLighting();
    this._buildMorphNode();

    this._isInitialized = true;
    return Promise.resolve();
  },

  _buildLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
    this.directionalLight.position.set(4, 6, 6);
    this.scene.add(this.directionalLight);

    this.pointLight = new THREE.PointLight(0x6366f1, 2.0, 8);
    this.pointLight.position.set(0, 0, 0);
    this.scene.add(this.pointLight);
  },

  _buildMorphNode() {
    // 1. Morphing core (Dodecahedron with subdivision)
    const morphGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const morphMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x312e81,
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.7,
      flatShading: true,
    });
    this.morphMesh = new THREE.Mesh(morphGeo, morphMat);
    this.coreGroup.add(this.morphMesh);

    // 2. Wireframe crystalline overlay
    const wireGeo = new THREE.DodecahedronGeometry(1.2, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    this.wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.coreGroup.add(this.wireMesh);

    // 3. Dual orbital resonance rings
    const ringGeo1 = new THREE.TorusGeometry(1.4, 0.02, 16, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.5,
    });
    this.ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.ring1.rotation.x = Math.PI / 4;
    this.ringGroup.add(this.ring1);

    const ringGeo2 = new THREE.TorusGeometry(1.6, 0.02, 16, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0xc7d2fe,
      transparent: true,
      opacity: 0.35,
    });
    this.ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.ring2.rotation.y = Math.PI / 3;
    this.ringGroup.add(this.ring2);
  },

  /**
   * Transition node state to "analyzing" (hyper-spin/quantum processing).
   */
  setAnalyzing() {
    this._state = 'analyzing';
    this._spinSpeed = 3.5;
    this._targetColor.set(0x818cf8);

    const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;
    if (gsap && !FallbackController.isReducedMotion()) {
      gsap.to(this.coreGroup.scale, {
        x: 0.85,
        y: 0.85,
        z: 0.85,
        duration: 0.2,
        yoyo: true,
        repeat: -1,
      });
    }
    PerformanceGovernor.markDirty();
  },

  /**
   * Update visual state from real ML analysis result.
   * @param {Object} result - Result from /predict or /feedback
   */
  setResult(result) {
    if (!result) {
      this.resetToIdle();
      return;
    }

    const sentiment = (result.sentiment || 'neutral').toLowerCase();
    const conf = result.confidence || 0.75;
    this._confidence = conf;
    this._state = sentiment;
    this._spinSpeed = 0.6;

    const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;
    if (gsap) {
      gsap.killTweensOf(this.coreGroup.scale);
    }

    // Set colors according to sentiment classification
    if (sentiment === 'positive') {
      this._targetColor.set(0x10b981); // Emerald
    } else if (sentiment === 'negative') {
      this._targetColor.set(0xf43f5e); // Rose
    } else {
      this._targetColor.set(0x3b82f6); // Azure Blue
    }

    const isReduced = FallbackController.isReducedMotion();
    const targetScale = 0.95 + conf * 0.35;

    if (gsap && !isReduced) {
      gsap.to(this.coreGroup.scale, {
        x: targetScale,
        y: targetScale,
        z: targetScale,
        duration: 0.6,
        ease: 'back.out(1.7)',
      });

      gsap.to(this._currentColor, {
        r: this._targetColor.r,
        g: this._targetColor.g,
        b: this._targetColor.b,
        duration: 0.5,
        onUpdate: () => {
          if (this.morphMesh) this.morphMesh.material.color.copy(this._currentColor);
          if (this.wireMesh) this.wireMesh.material.color.copy(this._currentColor);
          if (this.pointLight) this.pointLight.color.copy(this._currentColor);
          PerformanceGovernor.markDirty();
        },
      });
    } else {
      this.coreGroup.scale.set(targetScale, targetScale, targetScale);
      this._currentColor.copy(this._targetColor);
      if (this.morphMesh) this.morphMesh.material.color.copy(this._currentColor);
      if (this.wireMesh) this.wireMesh.material.color.copy(this._currentColor);
      if (this.pointLight) this.pointLight.color.copy(this._currentColor);
      PerformanceGovernor.markDirty();
    }
  },

  resetToIdle() {
    this._state = 'idle';
    this._spinSpeed = 0.5;
    this._targetColor.set(0x6366f1);

    const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;
    if (gsap) {
      gsap.killTweensOf(this.coreGroup.scale);
    }

    this.coreGroup.scale.set(1.0, 1.0, 1.0);
    this._currentColor.copy(this._targetColor);
    if (this.morphMesh) this.morphMesh.material.color.copy(this._currentColor);
    if (this.wireMesh) this.wireMesh.material.color.copy(this._currentColor);
    if (this.pointLight) this.pointLight.color.copy(this._currentColor);
    PerformanceGovernor.markDirty();
  },

  update(delta, _now) {
    if (!this._isInitialized) return;

    this._time += delta;
    const isReduced = FallbackController.isReducedMotion();

    if (!isReduced) {
      if (this.coreGroup) {
        this.coreGroup.rotation.y += delta * this._spinSpeed;
        this.coreGroup.rotation.x = Math.sin(this._time * 0.8) * 0.15;
      }

      if (this.wireMesh) {
        this.wireMesh.rotation.y -= delta * (this._spinSpeed * 0.8);
      }

      if (this.ring1) {
        this.ring1.rotation.z += delta * 0.4;
      }

      if (this.ring2) {
        this.ring2.rotation.x += delta * 0.3;
      }

      // Dynamic vibration when negative or analyzing
      if (this._state === 'negative' && this.morphMesh) {
        const jitter = Math.sin(this._time * 18.0) * 0.03;
        this.morphMesh.position.set(jitter, -jitter * 0.5, 0);
      } else if (this.morphMesh) {
        this.morphMesh.position.set(0, 0, 0);
      }
    } else {
      if (this.coreGroup) {
        this.coreGroup.rotation.set(0.1, 0.3, 0);
      }
      if (this.morphMesh) {
        this.morphMesh.position.set(0, 0, 0);
      }
    }
  },

  setTheme(isDark) {
    this._isDark = Boolean(isDark);
    if (!this.ambientLight || !this.directionalLight) return;

    if (this._isDark) {
      this.ambientLight.intensity = 0.7;
      this.directionalLight.intensity = 1.3;
      if (this.wireMesh) this.wireMesh.material.opacity = 0.4;
    } else {
      this.ambientLight.intensity = 1.2;
      this.directionalLight.intensity = 1.6;
      if (this.wireMesh) this.wireMesh.material.opacity = 0.6;
    }
    PerformanceGovernor.markDirty();
  },

  enter(params = {}) {
    if (params.result) {
      this.setResult(params.result);
    } else {
      this.resetToIdle();
    }
    PerformanceGovernor.markDirty();
    return Promise.resolve();
  },

  exit() {
    return Promise.resolve();
  },

  getCameraSetup() {
    return {
      position: new THREE.Vector3(0, 0, 3.8),
      target: new THREE.Vector3(0, 0, 0),
      duration: 0.6,
    };
  },

  getThreeScene() {
    return this.scene;
  },

  _disposeObject(obj) {
    if (!obj) return;
    if (obj.children) {
      while (obj.children.length > 0) {
        this._disposeObject(obj.children[0]);
        obj.remove(obj.children[0]);
      }
    }
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      obj.geometry.dispose();
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => {
          if (m && typeof m.dispose === 'function') m.dispose();
        });
      } else if (typeof obj.material.dispose === 'function') {
        obj.material.dispose();
      }
    }
  },

  dispose() {
    if (this.scene) {
      this._disposeObject(this.scene);
    }
    this._isInitialized = false;
  },
};

if (typeof window !== 'undefined') {
  window.AnalyzeScene = AnalyzeScene;
}
