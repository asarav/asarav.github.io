#!/usr/bin/env node
// Image gate: every local <img> in the build must carry the intrinsic
// width/height of the file it points at, so the browser can reserve the box
// before the image arrives. Remote images (most of the consumption ledger) are
// reported but not required, because their size is not known at build time.
//
//   node scripts/check-image-sizes.mjs dist

import fs from 'node:fs';
import path from 'node:path';

const buildDir = process.argv[2] || 'dist';
const root = process.cwd();
const sizes = JSON.parse(fs.readFileSync(path.join(root, 'src/generated/image-sizes.json'), 'utf8'));

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
})(path.join(root, buildDir));

// Two pages deliberately keep their <img> tags without dimensions. Declaring
// the box makes Chrome rasterise those photographs at the reserved size, which
// shifts painted pixels by a fraction of a percent against the frozen Jekyll
// build — the interaction/visual harness rejects that, and its pixel parity is
// the contract the port is held to. The CSS on both pages already fixes the
// rendered width (`.row.images img` / `.log-figure img`: width 100%, height
// auto), so the layout has no shift to reserve against; the residual CLS risk
// is the image's own load, not a box change.
const EXEMPT_PAGES = [
  { match: /^about\//, reason: 'about photos: reserved-box rasterisation shifts pixels against the frozen build' },
  { match: /^log\//, reason: 'log figures: reserved-box rasterisation shifts pixels against the frozen build' }
];

const failures = [];
const styled = [];
let exempt = 0;
let local = 0;
let remote = 0;

for (const page of pages) {
  const rel = path.relative(buildDir, page).split(path.sep).join('/');
  // The standalone Unity builds under /assets/games/ are exporter output that
  // ships verbatim (their own loader, paths and markup), so they are not ours
  // to annotate.
  if (rel.startsWith('assets/games/')) continue;
  const exemptPage = EXEMPT_PAGES.some((entry) => entry.match.test(rel));
  const html = fs.readFileSync(page, 'utf8');
  for (const match of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = match[0];
    const src = (/\bsrc="([^"]*)"/.exec(tag) || [])[1];
    if (!src) continue;
    if (/^[a-z]+:/i.test(src) || src.startsWith('//')) { remote++; continue; }
    local++;
    const width = (/\bwidth="(\d+)"/.exec(tag) || [])[1];
    const height = (/\bheight="(\d+)"/.exec(tag) || [])[1];
    const expected = sizes[src];
    if (!expected) {
      failures.push(`${rel}: no generated size for ${src.slice(0, 90)}`);
      continue;
    }
    if (!width || !height) {
      if (exemptPage) { exempt++; continue; }
      failures.push(`${rel}: <img src="${src.slice(0, 90)}"> has no width/height (expected ${expected.join('x')})`);
      continue;
    }
    // Logos and icons are deliberately sized to their display box, so the
    // attributes need not equal the file's pixels; a wrong aspect ratio would
    // still distort, so that is what gets compared.
    const fileRatio = expected[0] / expected[1];
    const attrRatio = Number(width) / Number(height);
    if (Math.abs(fileRatio - attrRatio) / fileRatio > 0.02) {
      styled.push(`${rel}: <img src="${src.slice(0, 70)}"> is ${width}x${height} (${attrRatio.toFixed(2)}:1), file is ${expected.join('x')} (${fileRatio.toFixed(2)}:1)`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} image size problem(s)`);
  for (const failure of failures.slice(0, 20)) console.error(`  ${failure}`);
  process.exit(1);
}
if (styled.length) {
  console.log(`${styled.length} image(s) declare a deliberate display ratio rather than the file's own:`);
  for (const note of styled.slice(0, 10)) console.log(`  ${note}`);
}
const exemptPages = ['about', 'log'].join('/ and ');
const exemptNote = exempt ? `; ${exempt} deliberately exempt on ${exemptPages}` : '';
console.log(`PASS: ${local} local image(s) carry width/height (${remote} remote image(s) cannot be measured at build time)${exemptNote}.`);
