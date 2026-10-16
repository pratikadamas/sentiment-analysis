/**
 * Sentiment Pulse - Overview 3D Scene (overview-scene.js)
 * Immersive, data-driven Sentiment Pulse Orb with orbital categorical nodes and constellation field.
 */

import * as THREE from '../../lib/vendor/three.module.js';
import { FallbackController } from '../core/fallback-controller.js';
import { PerformanceGovernor } from '../core/performance-governor.js';

export const OverviewScene = {
  scene: null,
  coreGroup: null,
  innerMesh: null,
  wireMesh: null,
  haloMesh: null,
  orbitGroup: null,
  particles: null,
  ambientLight: null,
  directionalLight: null,
  pointLight: null,

  _isInitialized: false,
  _stats: null,
  _analytics: null,
  _time: 0,
  _pulseSpeed: 1.0,
  _coreColor: new THREE.Color(0x6366f1),
  _targetColor: new THREE.Color(0x6366f1),
  _isDark: true,

  init() {
    if (this._isInitialized) return Promise.resolve();

    this.scene = new THREE.Scene();
    this.coreGroup = new THREE.Group();
    this.orbitGroup = new THREE.Group();
    this.scene.add(this.coreGroup);
    this.scene.add(this.orbitGroup);

    this._buildLighting();
    this._buildPulseCore();
    this._buildParticles();

    this._isInitialized = true;
    return Promise.resolve();
  },

  _buildLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(5, 8, 5);
    this.scene.add(this.directionalLight);

    this.pointLight = new THREE.PointLight(0x6366f1, 2.5, 10);
    this.pointLight.position.set(0, 0, 0);
    this.scene.add(this.pointLight);
  },

  _buildPulseCore() {
    // 1. Inner faceted core
    const innerGeo = new THREE.IcosahedronGeometry(1.0, 2);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      emissive: 0x312e81,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    });
    this.innerMesh = new THREE.Mesh(innerGeo, innerMat);
    this.coreGroup.add(this.innerMesh);

    // 2. Geometric wireframe outer shell
    const wireGeo = new THREE.IcosahedronGeometry(1.25, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    this.wireMesh = new THREE.Mesh(wireGeo, wireMat);
    this.coreGroup.add(this.wireMesh);

    // 3. Equatorial orbital energy ring
    const ringGeo = new THREE.TorusGeometry(1.5, 0.02, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.6,
    });
    this.haloMesh = new THREE.Mesh(ringGeo, ringMat);
    this.haloMesh.rotation.x = Math.PI / 3;
    this.coreGroup.add(this.haloMesh);
  },

  _buildParticles() {
    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const baseColor = new THREE.Color(0x818cf8);

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.0 + Math.random() * 4.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      colors[i * 3] = baseColor.r + (Math.random() - 0.5) * 0.2;
      colors[i * 3 + 1] = baseColor.g + (Math.random() - 0.5) * 0.2;
      colors[i * 3 + 2] = baseColor.b + (Math.random() - 0.5) * 0.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  },

  /**
   * Rebuild or update category orbital satellites based on real API analytics.
   * @param {Array} categories
   */
  updateCategories(categories = []) {
    if (!this.orbitGroup) return;

    // Clear existing orbit nodes
    while (this.orbitGroup.children.length > 0) {
      const child = this.orbitGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.orbitGroup.remove(child);
    }

    const items = categories.slice(0, 4);
    if (items.length === 0) return;

    const angleStep = (Math.PI * 2) / items.length;
    items.forEach((cat, idx) => {
      const angle = idx * angleStep;
      const dist = 2.4;

      const posPct = cat.positive_pct || 0;
      const negPct = cat.negative_pct || 0;

      // Color nodes based on real category polarity
      let catColor = 0x60a5fa; // neutral blue
      if (posPct >= 60)
        catColor = 0x34d399; // emerald positive
      else if (negPct >= 40) catColor = 0xf87171; // rose negative

      const sphereGeo = new THREE.SphereGeometry(0.14, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: catColor,
        emissive: catColor,
        emissiveIntensity: 0.4,
        roughness: 0.3,
      });

      const node = new THREE.Mesh(sphereGeo, sphereMat);
      node.position.set(
        Math.cos(angle) * dist,
        Math.sin(angle * 0.5) * 0.4,
        Math.sin(angle) * dist
      );
      node.userData = { category: cat.category, total: cat.total, baseAngle: angle, dist };
      this.orbitGroup.add(node);
    });

    PerformanceGovernor.markDirty();
  },

  /**
   * Feed genuine stats into the 3D Sentiment Core.
   * @param {Object} stats - Stats from /feedback/stats
   * @param {Object} analytics - Analytics from /feedback/analytics
   */
  updateData(data = {}) {
    const stats = data.stats || this._stats;
    const analytics = data.analytics || this._analytics;

    if (stats) this._stats = stats;
    if (analytics) {
      this._analytics = analytics;
      if (analytics.category_breakdown) {
        this.updateCategories(analytics.category_breakdown);
      }
    }

    if (!stats || !this.innerMesh) return;

    const pos = stats.positive_pct || 0;
    const neu = stats.neutral_pct || 0;
    const neg = stats.negative_pct || 0;

    // Determine target color and energy frequency based on actual data
    if (pos > neg && pos > neu) {
      this._targetColor.set(0x10b981); // Emerald Green
      this._pulseSpeed = 1.2;
    } else if (neg > pos && neg > neu) {
      this._targetColor.set(0xf43f5e); // Alert Rose
      this._pulseSpeed = 1.8;
    } else {
      this._targetColor.set(0x3b82f6); // Balanced Cyan/Sapphire
      this._pulseSpeed = 0.9;
    }

    // Adapt emissive and point lighting with GSAP transition
    const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;
    if (gsap && !FallbackController.isReducedMotion()) {
      gsap.to(this._coreColor, {
        r: this._targetColor.r,
        g: this._targetColor.g,
        b: this._targetColor.b,
        duration: 0.8,
        onUpdate: () => {
          if (this.innerMesh) this.innerMesh.material.color.copy(this._coreColor);
          if (this.wireMesh) this.wireMesh.material.color.copy(this._coreColor);
          if (this.pointLight) this.pointLight.color.copy(this._coreColor);
          PerformanceGovernor.markDirty();
        },
      });
    } else {
      this._coreColor.copy(this._targetColor);
      if (this.innerMesh) this.innerMesh.material.color.copy(this._coreColor);
      if (this.wireMesh) this.wireMesh.material.color.copy(this._coreColor);
      if (this.pointLight) this.pointLight.color.copy(this._coreColor);
      PerformanceGovernor.markDirty();
    }
  },

  update(delta, _now) {
    if (!this._isInitialized) return;

    this._time += delta * this._pulseSpeed;

    const isReduced = FallbackController.isReducedMotion();

    if (!isReduced) {
      // 1. Gentle continuous rotation
      if (this.coreGroup) {
        this.coreGroup.rotation.y += delta * 0.4;
        this.coreGroup.rotation.x = Math.sin(this._time * 0.5) * 0.12;
      }

      if (this.wireMesh) {
        this.wireMesh.rotation.y -= delta * 0.6;
        this.wireMesh.rotation.z += delta * 0.2;
      }

      if (this.haloMesh) {
        this.haloMesh.rotation.z += delta * 0.5;
      }

      // 2. Harmonic breathing pulse on inner core
      const pulseScale = 1.0 + Math.sin(this._time * 2.5) * 0.06;
      if (this.innerMesh) {
        this.innerMesh.scale.set(pulseScale, pulseScale, pulseScale);
      }

      // 3. Orbiting category satellite nodes
      if (this.orbitGroup && this.orbitGroup.children.length > 0) {
        this.orbitGroup.children.forEach((node, i) => {
          const speed = 0.5 + i * 0.1;
          const currentAngle = (node.userData.baseAngle || 0) + this._time * speed * 0.3;
          const dist = node.userData.dist || 2.4;
          node.position.x = Math.cos(currentAngle) * dist;
          node.position.z = Math.sin(currentAngle) * dist;
          node.position.y = Math.sin(currentAngle * 2) * 0.25;
        });
      }

      // 4. Subtle constellation drift
      if (this.particles) {
        this.particles.rotation.y = this._time * 0.05;
      }
    } else {
      // Static balanced state under reduced motion
      if (this.coreGroup) {
        this.coreGroup.rotation.set(0.1, 0.4, 0);
      }
      if (this.innerMesh) {
        this.innerMesh.scale.set(1.0, 1.0, 1.0);
      }
    }
  },

  setTheme(isDark) {
    this._isDark = Boolean(isDark);
    if (!this.ambientLight || !this.directionalLight) return;

    if (this._isDark) {
      this.ambientLight.intensity = 0.65;
      this.directionalLight.intensity = 1.2;
      if (this.wireMesh) this.wireMesh.material.opacity = 0.4;
    } else {
      this.ambientLight.intensity = 1.1;
      this.directionalLight.intensity = 1.5;
      if (this.wireMesh) this.wireMesh.material.opacity = 0.6;
    }
    PerformanceGovernor.markDirty();
  },

  enter(params = {}) {
    if (params.data) {
      this.updateData(params.data);
    }
    PerformanceGovernor.markDirty();
    return Promise.resolve();
  },

  exit() {
    return Promise.resolve();
  },

  getCameraSetup() {
    return {
      position: new THREE.Vector3(0, 0.2, 4.2),
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
  window.OverviewScene = OverviewScene;
}
