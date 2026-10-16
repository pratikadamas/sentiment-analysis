/**
 * Sentiment Pulse - Motion Presets & Timing Tokens (presets.js)
 * Centralizes standard durations, easings, and animation preset configurations.
 */

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  view: 0.35,
};

export const EASINGS = {
  outExpo: 'power3.out',
  outQuart: 'power4.out',
  spring: 'back.out(1.7)',
  springTight: 'back.out(2.2)',
  inOutSoft: 'power2.inOut',
  inSoft: 'power2.in',
  outSoft: 'power2.out',
};

export const PRESETS = {
  viewIn: {
    from: { opacity: 0, y: 12 },
    to: { opacity: 1, y: 0, duration: DURATIONS.view, ease: EASINGS.outExpo },
  },
  viewOut: {
    to: { opacity: 0, y: -8, duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  staggerUp: {
    from: { opacity: 0, y: 16 },
    to: { opacity: 1, y: 0, duration: DURATIONS.base, stagger: 0.05, ease: EASINGS.outExpo },
  },
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1, duration: DURATIONS.base, ease: EASINGS.outSoft },
  },
  fadeOut: {
    to: { opacity: 0, duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  popIn: {
    from: { opacity: 0, scale: 0.88 },
    to: { opacity: 1, scale: 1, duration: DURATIONS.view, ease: EASINGS.spring },
  },
  shake: {
    keyframes: [
      { x: -6 },
      { x: 6 },
      { x: -4 },
      { x: 4 },
      { x: -2 },
      { x: 2 },
      { x: 0 },
    ],
    duration: DURATIONS.slow,
    ease: EASINGS.inOutSoft,
  },
  spring: {
    from: { scale: 0.92 },
    to: { scale: 1, duration: DURATIONS.slow, ease: EASINGS.spring },
  },
  toastIn: {
    from: { opacity: 0, y: 20, scale: 0.95 },
    to: { opacity: 1, y: 0, scale: 1, duration: DURATIONS.base, ease: EASINGS.outExpo },
  },
  toastOut: {
    to: { opacity: 0, y: 10, scale: 0.95, duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  drawerIn: {
    from: { x: '-100%' },
    to: { x: '0%', duration: DURATIONS.base, ease: EASINGS.outExpo },
  },
  drawerOut: {
    to: { x: '-100%', duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  barGrow: {
    from: { scaleX: 0, transformOrigin: 'left center' },
    to: { scaleX: 1, duration: DURATIONS.slow, ease: EASINGS.outExpo },
  },
  cardEnter: {
    from: { opacity: 0, y: 14 },
    to: { opacity: 1, y: 0, duration: DURATIONS.base, stagger: 0.06, ease: EASINGS.outExpo },
  },
  press: {
    to: { scale: 0.97, duration: DURATIONS.fast, ease: EASINGS.outSoft },
  },
  hoverLift: {
    to: { y: -2, duration: DURATIONS.fast, ease: EASINGS.outSoft },
  },
  badgePop: {
    from: { scale: 0.88, opacity: 0.8 },
    to: { scale: 1, opacity: 1, duration: DURATIONS.fast * 1.5, ease: EASINGS.springTight },
  },
  modalEnter: {
    from: { opacity: 0, scale: 0.96, y: 4 },
    to: { opacity: 1, scale: 1, y: 0, duration: DURATIONS.base, ease: EASINGS.outExpo },
  },
  modalExit: {
    to: { opacity: 0, scale: 0.96, y: 2, duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  rowEnter: {
    from: { opacity: 0, y: 8 },
    to: { opacity: 1, y: 0, duration: DURATIONS.base, ease: EASINGS.outExpo },
  },
  rowExit: {
    to: { opacity: 0, scale: 0.98, duration: DURATIONS.fast, ease: EASINGS.inSoft },
  },
  resultCardEnter: {
    from: { opacity: 0, scale: 0.98, y: 8 },
    to: { opacity: 1, scale: 1, y: 0, duration: DURATIONS.view, ease: EASINGS.outExpo },
  },
  tokenBar: {
    from: { scaleX: 0, transformOrigin: 'left center' },
    to: { scaleX: 1, duration: DURATIONS.slow, ease: EASINGS.outExpo },
  },
  tokenFade: {
    from: { opacity: 0, y: 2 },
    to: { opacity: 1, y: 0, duration: DURATIONS.fast * 1.2, ease: EASINGS.outSoft },
  },
  progressMorph: {
    to: { scale: 0.98, opacity: 0.92, duration: DURATIONS.fast, ease: EASINGS.outSoft },
  },
  progressPulse: {
    keyframes: [
      { opacity: 0.4, scale: 0.92 },
      { opacity: 1, scale: 1 },
      { opacity: 0.4, scale: 0.92 },
    ],
    duration: 1.2,
    ease: EASINGS.inOutSoft,
  },
  successPop: {
    from: { scale: 0.85, opacity: 0 },
    to: { scale: 1, opacity: 1, duration: DURATIONS.base, ease: EASINGS.springTight },
  },
  errorShake: {
    keyframes: [
      { x: 0 },
      { x: -4 },
      { x: 4 },
      { x: -3 },
      { x: 3 },
      { x: -1 },
      { x: 1 },
      { x: 0 },
    ],
    duration: 0.35,
    ease: EASINGS.inOutSoft,
  },
  celebrationBurst: {
    from: { scale: 0.94, opacity: 0, y: 6 },
    to: { scale: 1, opacity: 1, y: 0, duration: DURATIONS.slow, ease: EASINGS.spring },
  },
};

/**
 * Retrieve a preset configuration clone with optional overrides.
 * @param {string} name - Preset name
 * @param {Object} [overrides={}] - Optional property overrides
 * @returns {Object}
 */
export function getPreset(name, overrides = {}) {
  const preset = PRESETS[name];
  if (!preset) {
    console.warn(`[Presets] Unknown preset "${name}". Returning empty configuration.`);
    return { to: { opacity: 1, ...overrides } };
  }

  // Deep clone to prevent mutation
  const clone = JSON.parse(JSON.stringify(preset));

  if (overrides && typeof overrides === 'object') {
    if (overrides.from && clone.from) {
      Object.assign(clone.from, overrides.from);
    }
    if (overrides.to && clone.to) {
      Object.assign(clone.to, overrides.to);
    } else {
      // Merge top-level overrides into 'to' block if applicable
      Object.assign(clone.to || (clone.to = {}), overrides);
    }
  }

  return clone;
}

if (typeof window !== 'undefined') {
  window.MotionPresets = {
    DURATIONS,
    EASINGS,
    PRESETS,
    getPreset,
  };
}

export default {
  DURATIONS,
  EASINGS,
  PRESETS,
  getPreset,
};
