/**
 * Sentiment Pulse - 3D Camera Rig (camera-rig.js)
 * PerspectiveCamera management, responsive FOV, smooth GSAP transitions, and pointer parallax.
 */

import * as THREE from '../../lib/vendor/three.module.js';
import { FallbackController } from './fallback-controller.js';
import { PerformanceGovernor } from './performance-governor.js';

export const CameraRig = {
  camera: null,
  target: new THREE.Vector3(0, 0, 0),
  _defaultFov: 45,
  _defaultNear: 0.1,
  _defaultFar: 1000,
  _basePosition: new THREE.Vector3(0, 0, 5),
  _targetPosition: new THREE.Vector3(0, 0, 5),
  _currentPosition: new THREE.Vector3(0, 0, 5),
  _pointer: { x: 0, y: 0, targetX: 0, targetY: 0 },
  _parallaxScale: { x: 0.35, y: 0.25 },
  _pointerBound: false,
  _boundMouseMove: null,
  _boundMouseLeave: null,

  init(options = {}) {
    const aspect = options.aspect || 1.6;
    const fov = options.fov || this._defaultFov;

    if (!this.camera) {
      this.camera = new THREE.PerspectiveCamera(fov, aspect, this._defaultNear, this._defaultFar);
    } else {
      this.camera.fov = fov;
      this.camera.aspect = aspect;
    }

    if (options.position) {
      this._basePosition.copy(options.position);
      this._targetPosition.copy(options.position);
      this._currentPosition.copy(options.position);
      this.camera.position.copy(options.position);
    } else {
      this.camera.position.copy(this._basePosition);
    }

    if (options.target) {
      this.target.copy(options.target);
    }

    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();

    this.bindPointerEvents();
    return this.camera;
  },

  updateAspect(aspect) {
    if (!this.camera) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    PerformanceGovernor.markDirty();
  },

  bindPointerEvents() {
    if (this._pointerBound || typeof window === 'undefined') return;
    this._pointerBound = true;

    this._boundMouseMove = (e) => {
      if (FallbackController.isReducedMotion()) {
        this._pointer.targetX = 0;
        this._pointer.targetY = 0;
        return;
      }

      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      this._pointer.targetX = (e.clientX - halfW) / halfW;
      this._pointer.targetY = (e.clientY - halfH) / halfH;
      PerformanceGovernor.markDirty();
    };

    this._boundMouseLeave = () => {
      this._pointer.targetX = 0;
      this._pointer.targetY = 0;
      PerformanceGovernor.markDirty();
    };

    window.addEventListener('pointermove', this._boundMouseMove, { passive: true });
    document.addEventListener('pointerleave', this._boundMouseLeave, { passive: true });
  },

  unbindPointerEvents() {
    if (!this._pointerBound || typeof window === 'undefined') return;
    this._pointerBound = false;

    if (this._boundMouseMove) {
      window.removeEventListener('pointermove', this._boundMouseMove);
      this._boundMouseMove = null;
    }
    if (this._boundMouseLeave) {
      document.removeEventListener('pointerleave', this._boundMouseLeave);
      this._boundMouseLeave = null;
    }
  },

  update(delta = 0.016) {
    if (!this.camera) return;

    if (!FallbackController.isReducedMotion()) {
      // Smooth lerp pointer parallax
      const lerpFactor = Math.min(1.0, delta * 4.0);
      this._pointer.x += (this._pointer.targetX - this._pointer.x) * lerpFactor;
      this._pointer.y += (this._pointer.targetY - this._pointer.y) * lerpFactor;

      const offsetX = this._pointer.x * this._parallaxScale.x;
      const offsetY = -this._pointer.y * this._parallaxScale.y;

      this.camera.position.x = this._currentPosition.x + offsetX;
      this.camera.position.y = this._currentPosition.y + offsetY;
      this.camera.position.z = this._currentPosition.z;
    } else {
      this.camera.position.copy(this._currentPosition);
    }

    this.camera.lookAt(this.target);
  },

  transitionTo(position, target, duration = 0.8) {
    if (!this.camera) return Promise.resolve();

    if (FallbackController.isReducedMotion() || duration <= 0) {
      if (position) {
        this._basePosition.copy(position);
        this._currentPosition.copy(position);
      }
      if (target) {
        this.target.copy(target);
      }
      this.camera.position.copy(this._currentPosition);
      this.camera.lookAt(this.target);
      PerformanceGovernor.markDirty();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const gsap = typeof window !== 'undefined' && window.gsap ? window.gsap : null;
      if (gsap) {
        const tl = gsap.timeline({
          onUpdate: () => {
            PerformanceGovernor.markDirty();
          },
          onComplete: () => {
            resolve();
          },
        });

        if (position) {
          tl.to(
            this._currentPosition,
            {
              x: position.x,
              y: position.y,
              z: position.z,
              duration,
              ease: 'power2.out',
            },
            0
          );
        }

        if (target) {
          tl.to(
            this.target,
            {
              x: target.x,
              y: target.y,
              z: target.z,
              duration,
              ease: 'power2.out',
            },
            0
          );
        }
      } else {
        // Fallback without GSAP
        if (position) this._currentPosition.copy(position);
        if (target) this.target.copy(target);
        this.camera.position.copy(this._currentPosition);
        this.camera.lookAt(this.target);
        PerformanceGovernor.markDirty();
        resolve();
      }
    });
  },

  dispose() {
    this.unbindPointerEvents();
    this.camera = null;
  },
};

if (typeof window !== 'undefined') {
  window.CameraRig = CameraRig;
}
