#!/usr/bin/env node
// Internal link gate. html-proofer used to do this on the Jekyll build; the
// site no longer builds with Ruby, so this checks the same thing directly:
// every href/src in the build that points inside the site resolves to a file
// that exists. External URLs are not contacted (they answer bots with 403s) —
// only the build's own links are verified.
//
//   node scripts/check-links.mjs dist

import fs from 'node:fs';
import path from 'node:path';

const buildDir = path.resolve(process.argv[2] || 'dist');
const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(html|css|js|xml)$/.test(entry.name)) pages.push(full);
  }
})(buildDir);

function exists(routePath) {
  const clean = decodeURIComponent(routePath.split('#')[0].split('?')[0]);
  const target = path.join(buildDir, clean);
  if (!target.startsWith(buildDir)) return true; // leave ../ escapes to check:urls
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  if (fs.existsSync(path.join(target, 'index.html'))) return true;
  if (fs.existsSync(target + '.html')) return true;
  return false;
}

const missing = new Map();
let checked = 0;

for (const file of pages) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(buildDir, file).split(path.sep).join('/');
  const attributes = /\.html$/.test(file)
    ? [...text.matchAll(/\b(?:href|src|poster)="([^"]*)"/g), ...text.matchAll(/\bsrcset="([^"]*)"/g).flatMap((match) => match[1].split(',').map((part) => [null, part.trim().split(/\s+/)[0]]))]
    : [...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)];
  for (const match of attributes) {
    const raw = (match[1] || '').trim();
    // Skip absolute URLs, protocol-relative links and in-page references;
    // minifiers may percent-encode the leading "#" of a fragment.
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|%23)/i.test(raw)) continue;
    const resolved = raw.startsWith('/') ? raw : '/' + path.posix.join(path.posix.dirname(rel), raw);
    const route = path.posix.normalize(resolved);
    checked++;
    if (!exists(route)) {
      const key = `${route} <- ${rel}`;
      missing.set(key, raw);
    }
  }
}

if (missing.size) {
  console.error(`FAIL: ${missing.size} internal link(s) do not resolve in ${path.basename(buildDir)}`);
  for (const [where, raw] of [...missing].slice(0, 25)) console.error(`  ${where} (${raw})`);
  process.exit(1);
}
console.log(`PASS: ${checked} internal link(s) across ${pages.filter((file) => file.endsWith('.html')).length} page(s) resolve in the build.`);
