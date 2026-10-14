import fs from 'node:fs';

const files = {
  '/ (Root)': 'reports/baseline-root.json',
  '#overview': 'reports/baseline-overview.json',
  '#analyze': 'reports/baseline-analyze.json',
  '#explorer': 'reports/baseline-explorer.json',
  '#analytics': 'reports/baseline-analytics.json',
  '#import-export': 'reports/baseline-imports.json',
};

console.log('| Route | Performance | Accessibility | Best Practices | SEO |');
console.log('| :--- | :---: | :---: | :---: | :---: |');

for (const [name, file] of Object.entries(files)) {
  if (fs.existsSync(file)) {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const c = r.categories;
    const p = Math.round((c.performance?.score || 0) * 100);
    const a = Math.round((c.accessibility?.score || 0) * 100);
    const bp = Math.round((c['best-practices']?.score || 0) * 100);
    const s = Math.round((c.seo?.score || 0) * 100);
    console.log(`| ${name} | ${p} | ${a} | ${bp} | ${s} |`);
  }
}
