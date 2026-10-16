/**
 * Tests for Vendor Loader (vendor-loader.js)
 * Verified via Node.js native test runner: node --test tests/frontend/vendor-loader.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { VendorLoader } from '../../static/js/lib/motion/vendor-loader.js';

describe('Vendor Loader Subsystem', () => {
  beforeEach(() => {
    VendorLoader.clearCache();
  });

  describe('Manifest Lookup & Integration', () => {
    it('retrieves the default embedded vendor manifest', async () => {
      const manifest = await VendorLoader.getManifest();
      assert.ok(manifest);
      assert.ok(manifest.gsap);
      assert.equal(manifest.gsap.file, 'gsap.min.js');
      assert.equal(manifest.gsap.version, '3.13.0');
      assert.ok(manifest.gsap.sha384.startsWith('sha384-'));
      assert.equal(manifest.gsap.tier, 1);
    });

    it('contains all required vendor libraries in manifest', async () => {
      const manifest = await VendorLoader.getManifest();
      const requiredVendors = ['gsap', 'scrollTrigger', 'flip', 'countUp', 'splitType', 'confetti', 'chart'];
      requiredVendors.forEach((vendor) => {
        assert.ok(manifest[vendor], `Manifest missing ${vendor}`);
        assert.ok(manifest[vendor].file, `${vendor} missing file property`);
        assert.ok(manifest[vendor].sha384, `${vendor} missing sha384 SRI hash`);
      });
    });

    it('handles unknown vendor gracefully and returns null', async () => {
      const result = await VendorLoader.loadVendor('nonExistentLibraryXYZ');
      assert.equal(result, null);
    });

    it('allows custom manifest override for specialized contexts', async () => {
      const customManifest = {
        mockVendor: {
          file: 'mock.min.js',
          version: '1.0.0',
          sha384: 'sha384-mockhash',
          global: 'MockVendor',
        },
      };
      VendorLoader.setManifest(customManifest);
      const manifest = await VendorLoader.getManifest();
      assert.equal(manifest.mockVendor.file, 'mock.min.js');
    });
  });

  describe('Promise Caching & Duplicate Loading', () => {
    it('returns the exact same Promise instance when loadVendor is called multiple times', () => {
      const promise1 = VendorLoader.loadVendor('gsap');
      const promise2 = VendorLoader.loadVendor('gsap');
      assert.equal(promise1, promise2, 'Concurrent calls to loadVendor must return cached Promise');
    });

    it('clears Promise cache upon calling clearCache()', () => {
      const promise1 = VendorLoader.loadVendor('gsap');
      VendorLoader.clearCache();
      const promise2 = VendorLoader.loadVendor('gsap');
      assert.notEqual(promise1, promise2, 'New Promise should be instantiated after clearCache()');
    });
  });

  describe('Global Resolution & Fallbacks', () => {
    it('resolves library immediately if global is already attached to window', async () => {
      const mockGlobal = { isMock: true, version: '9.9.9' };
      const hadWindow = 'window' in globalThis;
      const prevWindow = globalThis.window;
      globalThis.window = { MockLib: mockGlobal };

      VendorLoader.setManifest({
        mockLib: {
          file: 'mock-lib.min.js',
          global: 'MockLib',
          sha384: 'sha384-dummy',
        },
      });

      const loaded = await VendorLoader.loadVendor('mockLib');
      assert.deepEqual(loaded, mockGlobal);

      if (hadWindow) {
        globalThis.window = prevWindow;
      } else {
        delete globalThis.window;
      }
    });

    it('returns null on empty, undefined, or null vendor key', async () => {
      assert.equal(await VendorLoader.loadVendor(''), null);
      assert.equal(await VendorLoader.loadVendor(null), null);
      assert.equal(await VendorLoader.loadVendor(undefined), null);
    });
  });

  describe('SRI & Security Attributes', () => {
    it('never resolves to remote CDN URLs and strictly targets local static vendor directory', async () => {
      const manifest = await VendorLoader.getManifest();
      Object.values(manifest).forEach((entry) => {
        assert.ok(
          !entry.file.startsWith('http://') && !entry.file.startsWith('https://'),
          `Vendor file "${entry.file}" must be local, not CDN URL`
        );
      });
    });
  });
});
