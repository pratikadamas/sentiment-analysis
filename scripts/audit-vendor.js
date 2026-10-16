import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const manifestPath = path.join(rootDir, 'static', 'js', 'lib', 'vendor', 'vendor.manifest.json');
const vendorDir = path.join(rootDir, 'static', 'js', 'lib', 'vendor');

console.log('Vendor Audit');
console.log('────────────');

if (!fs.existsSync(manifestPath)) {
  console.error(`✗ Error: Manifest file not found at ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  const content = fs.readFileSync(manifestPath, 'utf8');
  manifest = JSON.parse(content);
} catch (err) {
  console.error(`✗ Error parsing vendor.manifest.json: ${err.message}`);
  process.exit(1);
}

const entries = Object.entries(manifest);
if (entries.length === 0) {
  console.error('✗ Error: vendor.manifest.json is empty');
  process.exit(1);
}

let passed = 0;
let failed = 0;

for (const [key, meta] of entries) {
  if (!meta || typeof meta !== 'object' || !meta.file || !meta.sha384) {
    console.error(`✗ [${key}]: Malformed manifest entry (missing 'file' or 'sha384')`);
    failed++;
    continue;
  }

  const filePath = path.join(vendorDir, meta.file);
  if (!fs.existsSync(filePath)) {
    console.error(`✗ ${meta.file} (Missing file: ${filePath})`);
    failed++;
    continue;
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha384').update(fileBuffer).digest('base64');
    const computedSri = `sha384-${hash}`;

    if (computedSri !== meta.sha384) {
      console.error(`✗ ${meta.file} (SRI hash mismatch!)\n    Expected: ${meta.sha384}\n    Actual:   ${computedSri}`);
      failed++;
    } else {
      console.log(`✓ ${meta.file} (${meta.version})`);
      passed++;
    }
  } catch (err) {
    console.error(`✗ ${meta.file} (Read error: ${err.message})`);
    failed++;
  }
}

console.log('');
if (failed === 0) {
  console.log(`${passed}/${entries.length} vendors verified.`);
  process.exit(0);
} else {
  console.error(`Vendor audit FAILED: ${failed} issue(s) detected.`);
  process.exit(1);
}
