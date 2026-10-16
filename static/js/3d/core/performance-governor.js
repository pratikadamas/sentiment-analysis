/**
 * Sentiment Pulse - 3D Performance Governor (performance-governor.js)
 * Manages rendering budgets, dynamic DPR limits, background pause, and frame rate throttling.
 */

export const PerformanceGovernor = {
  _initialized: false,
  _isPageVisible: true,
  _isPaused: false,
  _targetFps: 60,
  _maxDpr: 2.0,
  _minDpr: 1.0,
  _currentDpr: 1.0,
  _fpsSamples: [],
  _lastFrameTime: 0,
  _qualityTier: 'high', // 'high' | 'medium' | 'low'
  _dirty: true,
  _listeners: new Set(),

  init(options = {}) {
    if (this._initialized) return;
    this._initialized = true;

    this._maxDpr = options.maxDpr || (this.isMobile() ? 1.5 : 2.0);
    this._minDpr = options.minDpr || 1.0;
    this._calculateInitialDpr();

    if (typeof document !== 'undefined') {
      this._isPageVisible = !document.hidden;

      document.addEventListener('visibilitychange', () => {
        const visible = !document.hidden;
        this._isPageVisible = visible;
        if (!visible) {
          this.pause();
        } else {
          this.resume();
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        // Soft pause background loop if idle
        this.markDirty();
      });
    }
  },

  isMobile() {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  },

  _calculateInitialDpr() {
    if (typeof window === 'undefined') {
      this._currentDpr = 1.0;
      return;
    }
    const rawDpr = window.devicePixelRatio || 1.0;
    this._currentDpr = Math.min(Math.max(rawDpr, this._minDpr), this._maxDpr);
  },

  getDpr() {
    return this._currentDpr;
  },

  setDpr(dpr) {
    this._currentDpr = Math.min(Math.max(dpr, this._minDpr), this._maxDpr);
    this.markDirty();
  },

  markDirty() {
    this._dirty = true;
  },

  isDirty() {
    return this._dirty;
  },

  clearDirty() {
    this._dirty = false;
  },

  pause() {
    if (this._isPaused) return;
    this._isPaused = true;
    this._notifyStateChange(false);
  },

  resume() {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.markDirty();
    this._notifyStateChange(true);
  },

  isPaused() {
    return this._isPaused || !this._isPageVisible;
  },

  recordFrame(now) {
    if (!this._lastFrameTime) {
      this._lastFrameTime = now;
      return;
    }

    const delta = now - this._lastFrameTime;
    this._lastFrameTime = now;

    if (delta > 0) {
      const fps = 1000 / delta;
      this._fpsSamples.push(fps);
      if (this._fpsSamples.length > 60) {
        this._fpsSamples.shift();
      }

      // Dynamic quality adaptation if frame drops persist
      if (this._fpsSamples.length >= 30) {
        const avgFps = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
        if (avgFps < 30 && this._qualityTier === 'high') {
          this._qualityTier = 'medium';
          this.setDpr(1.0);
        } else if (avgFps < 20 && this._qualityTier === 'medium') {
          this._qualityTier = 'low';
          this.setDpr(1.0);
        }
      }
    }
  },

  getQualityTier() {
    return this._qualityTier;
  },

  onStateChange(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
      return () => this._listeners.delete(callback);
    }
    return () => {};
  },

  _notifyStateChange(active) {
    this._listeners.forEach((fn) => {
      try {
        fn(active);
      } catch (err) {
        console.warn('[PerformanceGovernor] Error in state listener:', err);
      }
    });
  },

  reset() {
    this._fpsSamples = [];
    this._lastFrameTime = 0;
    this._qualityTier = 'high';
    this._calculateInitialDpr();
    this.markDirty();
  },
};

if (typeof window !== 'undefined') {
  window.PerformanceGovernor = PerformanceGovernor;
}
