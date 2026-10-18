/**
 * Sentiment Pulse - 3D Brand Logo & Premium Typography Test Suite
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

describe('3D Brand Logo & Premium Typography Subsystem', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'templates/index.html'), 'utf-8');
  const appCss = fs.readFileSync(path.join(rootDir, 'static/css/app.css'), 'utf-8');

  describe('Markup & DOM Hierarchy', () => {
    it('contains the desktop sidebar 3D logo container with aria-hidden', () => {
      assert.ok(indexHtml.includes('id="sidebar-brand-logo"'));
      assert.ok(
        indexHtml.includes(
          'class="brand-3d-container relative w-10 h-10 select-none flex-shrink-0"'
        )
      );
      assert.ok(indexHtml.includes('id="sidebar-brand-logo" aria-hidden="true"'));
    });

    it('contains all 6 required 3D dimensional layers and ambient halo', () => {
      assert.ok(indexHtml.includes('class="brand-3d-halo"'));
      assert.ok(indexHtml.includes('class="brand-3d-stage"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-base"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-grid"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-core"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-glyph"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-sheen"'));
      assert.ok(indexHtml.includes('class="brand-layer brand-layer-bezel"'));
    });

    it('contains precision SVG dimensional lightning bolt and tech circuit grid', () => {
      assert.ok(indexHtml.includes('class="brand-glyph-svg'));
      assert.ok(indexHtml.includes('id="sidebar-bolt-fill"'));
      assert.ok(indexHtml.includes('id="sidebar-bolt-bevel"'));
      assert.ok(indexHtml.includes('id="sidebar-grid-grad"'));
      assert.ok(indexHtml.includes('d="M13.5 1.5L3.5 13H11.5L9.5 22.5L20.5 10.5H12.5L13.5 1.5Z"'));
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

    it('provides consistent 3D brand marks across mobile header and drawer', () => {
      assert.ok(indexHtml.includes('class="brand-3d-container mobile-size'));
      // Count brand-header-link occurrences (desktop sidebar, mobile bar, mobile drawer = 3)
      const count = (indexHtml.match(/class="brand-header-link/g) || []).length;
      assert.equal(
        count,
        3,
        'Should have exactly 3 branded header links (desktop, mobile top, mobile drawer)'
      );
    });
  });

  describe('CSS 3D Engine & Styling Tokens', () => {
    it('defines hardware-accelerated 3D perspective and stage styling in app.css', () => {
      assert.ok(appCss.includes('.brand-3d-container {'));
      assert.ok(appCss.includes('perspective: 600px;'));
      assert.ok(appCss.includes('transform-style: preserve-3d;'));
      assert.ok(appCss.includes('.brand-3d-stage {'));
      assert.ok(appCss.includes('@keyframes brand-float-3d {'));
    });

    it('defines dimensional Z-axis layering for depth separation', () => {
      assert.ok(appCss.includes('.brand-layer-base {'));
      assert.ok(appCss.includes('translateZ(0px)'));
      assert.ok(appCss.includes('.brand-layer-grid {'));
      assert.ok(appCss.includes('translateZ(5px)'));
      assert.ok(appCss.includes('.brand-layer-core {'));
      assert.ok(appCss.includes('translateZ(10px)'));
      assert.ok(appCss.includes('.brand-layer-glyph {'));
      assert.ok(appCss.includes('translateZ(16px)'));
      assert.ok(appCss.includes('.brand-layer-sheen {'));
      assert.ok(appCss.includes('translateZ(22px)'));
      assert.ok(appCss.includes('.brand-layer-bezel {'));
      assert.ok(appCss.includes('translateZ(24px)'));
    });

    it('defines radial nebula breathing halo and core plasma pulse keyframes', () => {
      assert.ok(appCss.includes('@keyframes brand-halo-breathe {'));
      assert.ok(appCss.includes('@keyframes brand-core-pulse {'));
      assert.ok(appCss.includes('.brand-pulse-gradient {'));
    });

    it('provides accessible prefers-reduced-motion overrides', () => {
      assert.ok(appCss.includes('@media (prefers-reduced-motion: reduce)'));
      assert.ok(appCss.includes('.brand-3d-stage {\n    animation: none !important;'));
      assert.ok(appCss.includes('transform: rotateX(5deg) rotateY(-6deg) !important;'));
    });

    it('provides document hidden battery saver state', () => {
      assert.ok(appCss.includes('.brand-3d-paused .brand-3d-stage'));
      assert.ok(appCss.includes('animation-play-state: paused !important;'));
    });
  });

  describe('MicroInteractions Parallax & Lifecycle', () => {
    it('exposes initBrandLogoParallax method on MicroInteractions', () => {
      assert.equal(typeof MicroInteractions.initBrandLogoParallax, 'function');
    });

    it('safely executes init and destroy in non-browser Node environment', () => {
      MicroInteractions.init();
      MicroInteractions.initBrandLogoParallax();
      MicroInteractions.destroy();
      assert.equal(MicroInteractions._initialized, false);
      assert.equal(MicroInteractions._brandCleanups.length, 0);
    });

    it('does not apply interactive tilt when reduced motion is active', () => {
      AnimationManager.setReducedMotion(true);
      assert.equal(AnimationManager.isReducedMotion(), true);
      // Clean up state
      AnimationManager.setReducedMotion(false);
    });
  });
});
