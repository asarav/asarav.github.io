#!/usr/bin/env node
// CSS gate. The shipped stylesheets are minified, so a byte comparison against
// the unminified baseline is meaningless. This checks what actually matters:
//
//   1. dist/assets/css/**.css is exactly the minified build of src/styles, so a
//      stale build or a dropped rule fails loudly;
//   2. when the frozen Jekyll baseline is present (.shots/build-base), every
//      selector, media query, property and value still matches it, except the
//      planned @font-face URL fix and the dead rules Phase 6 removed (listed
//      below with a reason).
//
//   node scripts/check-css.mjs dist

import fs from 'node:fs';
import path from 'node:path';
import * as sass from 'sass';
import { transform } from 'lightningcss';

const buildDir = process.argv[2] || 'dist';
const root = process.cwd();
const styleDir = path.join(root, 'src/styles');
const loadPaths = [path.join(styleDir, 'partials')];
const baselineDir = path.join(root, '.shots/build-base/assets/css');

// Rules Phase 6 deleted because no page, script or stylesheet ever used them.
const DOCUMENTED_REMOVALS = [
  { selector: '.archive-intro', reason: 'no archive page exists; nothing renders or toggles this class' },
  { selector: '.archive-intro .archive-lede', reason: 'same block as .archive-intro' },
  { selector: '.scene-timelapse-progress', reason: 'site-motion.js only creates .scene-timelapse and .scene-timelapse--hero' }
];
const DOCUMENTED_PROPERTY_REMOVALS = [
  { selector: ':root', property: '--ink-soft', reason: 'never read by any stylesheet or script' },
  { selector: ':root', property: '--surface-raised', reason: 'never read by any stylesheet or script' },
  { selector: ':root', property: '--surface-glass', reason: 'never read by any stylesheet or script' },
  { selector: ':root', property: '--elev-3', reason: 'never read by any stylesheet or script' }
];

const sheets = [
  { name: 'main.css', from: path.join(styleDir, 'main.scss') },
  ...fs
    .readdirSync(path.join(styleDir, 'pages'))
    .filter((entry) => entry.endsWith('.scss'))
    .sort()
    .map((entry) => ({
      name: `pages/${entry.replace(/\.scss$/, '.css')}`,
      from: path.join(styleDir, 'pages', entry)
    }))
];

// Flatten a stylesheet into `media|selector -> {property: value}`, keeping the
// media query so a rule cannot silently move between breakpoints.
function declarations(css) {
  const map = new Map();
  function add(selector, body, media) {
    const key = `${media}|${selector.trim()}`;
    const props = map.get(key) || new Map();
    for (const declaration of body.split(';')) {
      const index = declaration.indexOf(':');
      if (index < 0) continue;
      props.set(declaration.slice(0, index).trim(), declaration.slice(index + 1).trim());
    }
    map.set(key, props);
  }
  function parse(text, media) {
    let buffer = '';
    let depth = 0;
    for (const character of text) {
      buffer += character;
      if (character === '{') depth++;
      else if (character === '}') {
        depth--;
        if (depth === 0) {
          const prelude = buffer.slice(0, buffer.indexOf('{')).trim();
          const body = buffer.slice(buffer.indexOf('{') + 1, buffer.lastIndexOf('}'));
          if (prelude.startsWith('@media')) parse(body, prelude);
          // @font-face carries declarations and is compared like a rule; other
          // at-rules (keyframes, view-transition) are covered by the visual pass.
          else if (!prelude.startsWith('@') || prelude.startsWith('@font-face')) add(prelude, body.replace(/\/\*[\s\S]*?\*\//g, ''), media);
          buffer = '';
        }
      }
    }
  }
  parse(css.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return map;
}

const failures = [];
let shippedBytes = 0;

for (const sheet of sheets) {
  const expanded = sass.compile(sheet.from, { loadPaths, style: 'expanded', sourceMap: false }).css;
  const minified = transform({ filename: sheet.name, code: Buffer.from(expanded), minify: true }).code.toString();
  const shippedPath = path.join(root, buildDir, 'assets/css', sheet.name);
  if (!fs.existsSync(shippedPath)) {
    failures.push(`${sheet.name} missing from ${buildDir}/assets/css`);
    continue;
  }
  const shipped = fs.readFileSync(shippedPath, 'utf8');
  shippedBytes += Buffer.byteLength(shipped);
  if (shipped !== minified) {
    failures.push(`${sheet.name} in ${buildDir} is not the minified build of src/styles (stale build?)`);
  }

  if (!fs.existsSync(baselineDir)) continue;
  const baselinePath = path.join(baselineDir, sheet.name);
  if (!fs.existsSync(baselinePath)) {
    failures.push(`${sheet.name} has no baseline counterpart`);
    continue;
  }
  const baseline = declarations(fs.readFileSync(baselinePath, 'utf8'));
  const current = declarations(expanded);
  const isMain = sheet.name === 'main.css';

  for (const [key, props] of baseline) {
    const selector = key.slice(key.indexOf('|') + 1);
    if (!current.has(key)) {
      const documented = isMain && DOCUMENTED_REMOVALS.some((entry) => entry.selector === selector);
      if (!documented) failures.push(`${sheet.name}: rule removed without a documented reason: ${key.slice(0, 100)}`);
      continue;
    }
    const now = current.get(key);
    for (const [property, value] of props) {
      if (!now.has(property)) {
        const documented = isMain && DOCUMENTED_PROPERTY_REMOVALS.some((entry) => entry.selector === selector && entry.property === property);
        if (!documented) failures.push(`${sheet.name}: ${selector} lost ${property}`);
        continue;
      }
      if (now.get(property) !== value) {
        const fontFaceFix = isMain && selector.startsWith('@font-face') && property === 'src' && value.includes('../fonts/white-rabbit.ttf') && now.get(property).includes('/assets/fonts/white-rabbit.ttf');
        if (!fontFaceFix) failures.push(`${sheet.name}: ${selector} ${property} is "${now.get(property)}", baseline had "${value}"`);
      }
    }
    for (const property of now.keys()) {
      if (!props.has(property)) failures.push(`${sheet.name}: ${selector} gained ${property}: ${now.get(property)}`);
    }
  }
  for (const key of current.keys()) {
    if (!baseline.has(key)) failures.push(`${sheet.name}: new rule: ${key.slice(0, 100)}`);
  }
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} CSS problem(s)`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
const against = fs.existsSync(baselineDir) ? 'src/styles and the frozen baseline' : 'src/styles';
console.log(`PASS: ${sheets.length} stylesheets match ${against} (${shippedBytes} bytes shipped, only the documented @font-face fix and dead-rule removals differ).`);
