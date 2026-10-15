import { execSync } from 'node:child_process';
import fs from 'node:fs';

const targetDir = process.argv[2] || 'reports/phase7-pre';
fs.mkdirSync(targetDir, { recursive: true });

const routes = [
  { name: 'root', url: 'http://127.0.0.1:8000/' },
  { name: 'overview', url: 'http://127.0.0.1:8000/#overview' },
  { name: 'analyze', url: 'http://127.0.0.1:8000/#analyze' },
  { name: 'explorer', url: 'http://127.0.0.1:8000/#explorer' },
  { name: 'analytics', url: 'http://127.0.0.1:8000/#analytics' },
  { name: 'import-export', url: 'http://127.0.0.1:8000/#import-export' },
  { name: 'history', url: 'http://127.0.0.1:8000/#history' },
];

for (const r of routes) {
  const outputPath = `${targetDir}/${r.name}.json`;
  if (fs.existsSync(outputPath) && targetDir.includes('pre')) {
    console.log(`Skipping already completed ${r.name}`);
    continue;
  }
  console.log(`Auditing ${r.name} (${r.url})...`);
  const cmd = `npx lighthouse "${r.url}" --output=json --output-path="${outputPath}" --chrome-flags="--headless" --quiet`;
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`Saved ${outputPath}`);
  } catch (err) {
    console.error(`Failed auditing ${r.name}:`, err.message);
  }
}
