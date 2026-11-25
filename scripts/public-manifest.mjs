#!/usr/bin/env node
// List every file in public/ with its hash, or check that a build mirrors the
// tree byte-for-byte.
//
//   node scripts/public-manifest.mjs                 # list public/
//   node scripts/public-manifest.mjs --check dist    # compare public/ with dist/
//
// public/ is copied verbatim by the generator, so anything that changes here —
// a hashed filename, a moved asset, a stray source file — shows up as a diff
// rather than as a silent 404 on a precached path.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const checkMode = args[0] === '--check';
const srcDir = path.resolve('public');
const buildDir = checkMode ? path.resolve(args[1] || 'dist') : null;

function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

if (!fs.existsSync(srcDir)) {
  console.error(`public/ not found at ${srcDir}`);
  process.exit(2);
}

const files = walk(srcDir);
const manifest = new Map(files.map((rel) => [rel, hash(fs.readFileSync(path.join(srcDir, rel)))]));

if (!checkMode) {
  for (const [rel, digest] of manifest) console.log(`${digest}  public/${rel}`);
  console.error(`${files.length} files`);
  process.exit(0);
}

const buildFiles = new Set(fs.existsSync(buildDir) ? walk(buildDir) : []);
const missing = [];
const changed = [];

for (const [rel, digest] of manifest) {
  if (!buildFiles.has(rel)) {
    missing.push(rel);
    continue;
  }
  if (hash(fs.readFileSync(path.join(buildDir, rel))) !== digest) changed.push(rel);
}

if (missing.length || changed.length) {
  console.error(`FAIL: build does not mirror public/ (${files.length} source files)`);
  if (missing.length) console.error(`  missing from build (${missing.length}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`);
  if (changed.length) console.error(`  content differs (${changed.length}): ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? ', …' : ''}`);
  process.exit(1);
}

console.log(`PASS: ${files.length} public files mirrored byte-for-byte in ${path.relative(process.cwd(), buildDir)}/`);
