// Fails the build if an emitted page points at a root-relative-less asset URL.
// Jekyll resolved `{{ 'assets/...' | relative_url }}` to `/assets/...`; Astro
// emits whatever the template says, so a missing leading slash silently 404s
// every image on the page. This gate keeps that from coming back.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'dist';
const OK = /^(#|\/|https?:|mailto:|tel:|data:|blob:|javascript:|\?)/i;
const ATTRS = /\b(src|href|srcset|poster|action|formaction|data-src|data-srcset)="([^"]*)"/g;
const IGNORE_DIRS = [path.join(root, 'assets')];

function collectHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (IGNORE_DIRS.some((ignore) => full.startsWith(ignore))) continue;
    if (entry.isDirectory()) collectHtml(full, out);
    else if (full.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = collectHtml(root);
const problems = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(ATTRS)) {
    const attr = match[1];
    const value = match[2];
    if (!value.trim()) continue;
    const tokens = attr.endsWith('srcset') ? value.split(',').map((part) => part.trim().split(/\s+/)[0]) : [value.trim()];
    for (const token of tokens) {
      if (!token || OK.test(token)) continue;
      problems.push(`${file}: ${attr}="${token}"`);
    }
  }
}

if (problems.length) {
  console.error(`FAIL: ${problems.length} relative asset URL(s) would resolve against the page path:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`PASS: ${files.length} page(s) use root-absolute asset URLs only.`);
