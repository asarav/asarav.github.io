#!/usr/bin/env node
// Fail loudly when the generated service worker precaches a path the build
// does not contain. The whole point of the repair is that a stale entry must
// never degrade the offline shell silently.
//
//   node scripts/check-sw-shell.mjs [buildDir]
//
// Mirrors the Jekyll-era CI step, but derives nothing from a fixed list: it
// parses dist/sw.js and checks every entry against dist/.

import fs from 'node:fs';
import path from 'node:path';

const buildDir = path.resolve(process.argv[2] || 'dist');
const swPath = path.join(buildDir, 'sw.js');

if (!fs.existsSync(swPath)) {
  console.error(`FAIL: ${path.relative(process.cwd(), swPath)} not found — the service worker was not generated.`);
  process.exit(1);
}

const source = fs.readFileSync(swPath, 'utf8');

if (source.includes('{{')) {
  console.error('FAIL: sw.js still contains template syntax.');
  process.exit(1);
}

const listMatch = source.match(/const SHELL_ASSETS = (\[[\s\S]*?\]);/);
if (!listMatch) {
  console.error('FAIL: could not find SHELL_ASSETS in sw.js.');
  process.exit(1);
}

let shell;
try {
  shell = JSON.parse(listMatch[1]);
} catch (error) {
  console.error(`FAIL: SHELL_ASSETS is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(shell) || shell.length === 0) {
  console.error('FAIL: SHELL_ASSETS is empty.');
  process.exit(1);
}

const cacheMatch = source.match(/const CACHE_NAME = '([^']+)'/);
if (!cacheMatch || !/asarav-shell-\d{14}/.test(cacheMatch[1])) {
  console.error('FAIL: CACHE_NAME is not a per-build asarav-shell-<14digit> value.');
  process.exit(1);
}

// Keep the repair itself from silently regressing. Comments are stripped first so
// prose that names addAll()/skipWaiting() cannot trip the check.
const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const contract = [
  [/\baddAll\(/, true, 'install uses cache.addAll (must add one URL at a time)'],
  [/self\.addEventListener\('fetch'/, false, 'no fetch handler'],
  [/fetch\(event\.request\)\.then/, false, 'fetch handler is not network-first'],
  [/self\.skipWaiting\(/, true, 'skipWaiting() would swap the worker mid-session']
];
for (const [pattern, mustBeAbsent, message] of contract) {
  const present = pattern.test(code);
  if (mustBeAbsent ? present : !present) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const missing = shell.filter((url) => {
  const file = url === '/' ? 'index.html' : url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
  return !fs.existsSync(path.join(buildDir, file));
});

const bytes = shell.reduce((total, url) => {
  const file = url === '/' ? 'index.html' : url.endsWith('/') ? `${url.slice(1)}index.html` : url.slice(1);
  const full = path.join(buildDir, file);
  return total + (fs.existsSync(full) ? fs.statSync(full).size : 0);
}, 0);

if (missing.length) {
  console.error(`FAIL: ${missing.length} precached path(s) missing from the build:`);
  for (const url of missing) console.error(`  ${url}`);
  process.exit(1);
}

console.log(`PASS: ${shell.length} precached paths all exist (${cacheMatch[1]}), ${(bytes / 1024).toFixed(0)} KiB installed.`);
for (const url of shell) console.log(`  ${url}`);
