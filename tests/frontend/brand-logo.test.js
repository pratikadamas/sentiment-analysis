/**
 * Sentiment Pulse - 2D Brand Logo & Premium Typography Test Suite
 * Verified via Node.js native test runner: node --test tests/frontend/brand-logo.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MicroInteractions } from '../../static/js/lib/motion/micro.js';
import { AnimationManager } from '../../static/js/lib/motion/animation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('2D Brand Logo & Premium Typography Subsystem', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'templates/index.html'), 'utf-8');
  const appCss = fs.readFileSync(path.join(rootDir, 'static/css/app.css'), 'utf-8');

  describe('Markup & DOM Hierarchy', () => {
    it('contains the desktop sidebar 2D logo container with aria-hidden', () => {
      assert.ok(indexHtml.includes('id="sidebar-brand-logo"'));
      assert.ok(
        indexHtml.includes(
          'class="brand-2d-container relative w-10 h-10 select-none flex-shrink-0"'
        )
      );
      assert.ok(indexHtml.includes('id="sidebar-brand-logo" aria-hidden="true"'));
    });

    it('contains semantic 2D SVG brand mark elements and geometry', () => {
      assert.ok(indexHtml.includes('class="brand-2d-svg'));
      assert.ok(indexHtml.includes('class="brand-badge-bg"'));
      assert.ok(indexHtml.includes('class="brand-ring-outer"'));
      assert.ok(indexHtml.includes('class="brand-ring-inner"'));
      assert.ok(indexHtml.includes('class="brand-sentiment-arc"'));
      assert.ok(indexHtml.includes('class="brand-pulse-wave"'));
      assert.ok(indexHtml.includes('class="brand-wave-highlight"'));
      assert.ok(indexHtml.includes('class="brand-beacon-aura"'));
      assert.ok(indexHtml.includes('class="brand-beacon-node"'));
      assert.ok(indexHtml.includes('class="brand-beacon-core"'));
    });

    it('contains brand gradient defs for high-fidelity 2D color harmony', () => {
      assert.ok(indexHtml.includes('id="brand-bg-grad"'));
      assert.ok(indexHtml.includes('id="brand-border-grad"'));
      assert.ok(indexHtml.includes('id="brand-ring-grad"'));
      assert.ok(indexHtml.includes('id="brand-wave-grad"'));
      assert.ok(indexHtml.includes('id="brand-highlight-grad"'));
      assert.ok(indexHtml.includes('id="brand-sentiment-grad"'));
      assert.ok(indexHtml.includes('id="brand-beacon-glow"'));
    });

    it('upgrades brand typography with high-contrast text and pulse gradient', () => {
      assert.ok(indexHtml.includes('class="brand-pulse-gradient"'));
      assert.ok(indexHtml.includes('Sentiment<span class="brand-pulse-gradient">Pulse</span>'));
      assert.ok(indexHtml.includes('class="brand-version-badge">v2.0</span>'));
      assert.ok(indexHtml.includes('Intelligence Platform'));
    });

    it('provides accessible screen-reader announcement without duplicate speech', () => {
      assert.ok(indexHtml.includes('<span class="sr-only">SentimentPulse</span>'));
      assert.ok(indexHtml.includes('aria-label="SentimentPulse Home"'));
      // Verifies exact string is present for backend asset test compatibility
      assert.ok(indexHtml.includes('SentimentPulse'));
    });

    it('provides consistent 2D brand marks across mobile header and drawer', () => {
      assert.ok(indexHtml.includes('class="brand-2d-container mobile-size'));
      // Count brand-header-link occurrences (desktop sidebar, mobile bar, mobile drawer = 3)
      const count = (indexHtml.match(/class="brand-header-link/g) || []).length;
      assert.equal(
        count,
        3,
        'Should have exactly 3 branded header links (desktop, mobile top, mobile drawer)'
      );
    });
  });

  describe('CSS 2D Engine & Styling Tokens', () => {
    it('is strictly 2D without 3D perspective or dimensional translateZ on the logo', () => {
      assert.ok(!appCss.includes('perspective: 600px;'));
      assert.ok(!appCss.includes('transform-style: preserve-3d;'));
      assert.ok(!appCss.includes('translateZ('));
      assert.ok(!appCss.includes('@keyframes brand-float-3d'));
    });

    it('defines 2D container sizing and hover micro-interactions in app.css', () => {
      assert.ok(appCss.includes('.brand-2d-container'));
      assert.ok(appCss.includes('.brand-2d-container.mobile-size'));
      assert.ok(appCss.includes('.brand-header-link:hover .brand-2d-container'));
    });

    it('defines 2D keyframe animations for waveform, rings, sentiment arc, and beacon', () => {
      assert.ok(appCss.includes('@keyframes brand-wave-travel {'));
      assert.ok(appCss.includes('@keyframes brand-ring-breathe {'));
      assert.ok(appCss.includes('@keyframes brand-sentiment-breathe {'));
      assert.ok(appCss.includes('@keyframes brand-beacon-pulse {'));
      assert.ok(appCss.includes('@keyframes brand-aura-pulse {'));
      assert.ok(appCss.includes('.brand-pulse-gradient {'));
    });

    it('provides accessible prefers-reduced-motion overrides disabling animation', () => {
      assert.ok(appCss.includes('@media (prefers-reduced-motion: reduce)'));
      assert.ok(appCss.includes('animation: none !important;'));
      assert.ok(
        appCss.includes(
          '.brand-wave-highlight {\n    animation: none !important;\n    display: none !important;'
        )
      );
    });

    it('provides document hidden battery saver state', () => {
      assert.ok(appCss.includes('.brand-2d-paused'));
      assert.ok(appCss.includes('animation-play-state: paused !important;'));
    });
  });

  describe('MicroInteractions Lifecycle & Compatibility', () => {
    it('exposes initBrandLogoParallax and initBrandLogo on MicroInteractions', () => {
      assert.equal(typeof MicroInteractions.initBrandLogoParallax, 'function');
      assert.equal(typeof MicroInteractions.initBrandLogo, 'function');
    });

    it('safely executes init and destroy in non-browser Node environment', () => {
      MicroInteractions.init();
      MicroInteractions.initBrandLogoParallax();
      MicroInteractions.destroy();
      assert.equal(MicroInteractions._initialized, false);
      assert.equal(MicroInteractions._brandCleanups.length, 0);
    });

    it('respects reduced-motion setting in AnimationManager', () => {
      AnimationManager.setReducedMotion(true);
      assert.equal(AnimationManager.isReducedMotion(), true);
      // Clean up state
      AnimationManager.setReducedMotion(false);
    });
  });
});
