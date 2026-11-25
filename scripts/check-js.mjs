#!/usr/bin/env node
// JS gate. The scripts ship minified, so their bytes no longer match the
// tracked source. This proves the shipped files are exactly what terser makes
// of src/scripts (same options as scripts/build-assets.mjs), so a stale build,
// a hand-edited dist file or a dropped script fails loudly. Behavior itself is
// guarded by the 12-route interaction/visual harness.
//
//   node scripts/check-js.mjs dist

import fs from 'node:fs';
import path from 'node:path';
import { minify } from 'terser';

const buildDir = process.argv[2] || 'dist';
const root = process.cwd();
const sourceDir = path.join(root, 'src/scripts');
const shippedDir = path.join(root, buildDir, 'assets/js');

const sources = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.js')).sort();
const shipped = fs.existsSync(shippedDir) ? fs.readdirSync(shippedDir).filter((name) => name.endsWith('.js')).sort() : [];
const failures = [];
let total = 0;

for (const name of sources) {
  if (!shipped.includes(name)) {
    failures.push(`${name} is missing from ${buildDir}/assets/js`);
    continue;
  }
  const result = await minify(fs.readFileSync(path.join(sourceDir, name), 'utf8'), {
    compress: { passes: 2 },
    mangle: false,
    format: { comments: false }
  });
  const expected = result.code ?? '';
  const actual = fs.readFileSync(path.join(shippedDir, name), 'utf8');
  total += Buffer.byteLength(actual);
  if (actual !== expected) {
    failures.push(`${name} in ${buildDir} is not the minified build of src/scripts/${name} (stale build?)`);
  }
}

for (const name of shipped) {
  if (!sources.includes(name)) failures.push(`${name} is shipped but has no source in src/scripts`);
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} script problem(s)`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`PASS: ${sources.length} scripts are the minified build of src/scripts (${total} bytes shipped).`);
