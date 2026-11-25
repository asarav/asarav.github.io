#!/usr/bin/env node
// Build the site's static assets into fixed, unhashed URLs under public/.
//
// The service worker precaches /assets/css/main.css and the shared scripts by
// name, and every page links its own sheet at /assets/css/pages/<page>.css, so
// the output filenames are part of the contract. Astro's bundler would hash
// anything imported from src/, so everything is generated here instead:
//
//   src/styles/**/*.scss  -> public/assets/css/**.css        (minified)
//   src/scripts/*.js      -> public/assets/js/*.js           (minified)
//   public/assets/images  -> src/generated/image-sizes.json  (width/height map)
//
// CSS is compiled with the same Dart Sass version the Jekyll build used and
// then minified with lightningcss. A second value-compressing pass (csso) was
// measured at 45,689 B but reverted: it merges rule blocks and rewrites media
// queries and gradient stops, which changed rendered pixels. See docs/perf.md.
// Scripts are minified with terser but keep their identifiers, because inline
// page scripts and other files reach into the globals these classic scripts
// define.

import fs from 'node:fs';
import path from 'node:path';
import * as sass from 'sass';
import { transform } from 'lightningcss';
import { minify } from 'terser';

const root = process.cwd();
const styleDir = path.join(root, 'src/styles');
const scriptDir = path.join(root, 'src/scripts');
const cssOut = path.join(root, 'public/assets/css');
const jsOut = path.join(root, 'public/assets/js');
const sizeFile = path.join(root, 'src/generated/image-sizes.json');
const loadPaths = [path.join(styleDir, 'partials')];

/* ------------------------------------------------------------------ styles */

const sheets = [
  { from: path.join(styleDir, 'main.scss'), to: path.join(cssOut, 'main.css') },
  ...fs
    .readdirSync(path.join(styleDir, 'pages'))
    .filter((name) => name.endsWith('.scss'))
    .sort()
    .map((name) => ({
      from: path.join(styleDir, 'pages', name),
      to: path.join(cssOut, 'pages', name.replace(/\.scss$/, '.css'))
    }))
];

let cssTotal = 0;
for (const sheet of sheets) {
  // Expanded first: it is the readable form the Sass source compiles to, and
  // the CSS gate compares the minified output against it.
  const expanded = sass.compile(sheet.from, { loadPaths, style: 'expanded', sourceMap: false }).css;
  const { code } = transform({ filename: path.basename(sheet.to), code: Buffer.from(expanded), minify: true });
  fs.mkdirSync(path.dirname(sheet.to), { recursive: true });
  fs.writeFileSync(sheet.to, code);
  cssTotal += code.length;
  console.log(`${path.relative(root, sheet.to)}  ${code.length} bytes`);
}
// The vendored Unity builds under public/assets/games keep their own document
// and link this theme by root-absolute URL, so it ships with the stylesheets
// even though no Astro page uses it.
const legacyTheme = path.join(root, 'src/legacy/unity-theme.css');
if (fs.existsSync(legacyTheme)) {
  fs.writeFileSync(path.join(cssOut, 'unity-theme.css'), fs.readFileSync(legacyTheme));
  console.log('public/assets/css/unity-theme.css  copied for the vendored Unity builds');
}
console.log(`${sheets.length} stylesheets, ${cssTotal} bytes total`);

/* ----------------------------------------------------------------- scripts */

const scripts = fs.readdirSync(scriptDir).filter((name) => name.endsWith('.js')).sort();
let jsTotal = 0;
for (const name of scripts) {
  const source = fs.readFileSync(path.join(scriptDir, name), 'utf8');
  const result = await minify(source, {
    compress: { passes: 2 },
    // These are classic scripts: their top-level names are globals that inline
    // page scripts and sibling files call, so identifiers must survive.
    mangle: false,
    format: { comments: false }
  });
  if (!result.code) throw new Error(`terser produced no output for ${name}`);
  fs.mkdirSync(jsOut, { recursive: true });
  fs.writeFileSync(path.join(jsOut, name), result.code);
  jsTotal += Buffer.byteLength(result.code);
  console.log(`public/assets/js/${name}  ${source.length} -> ${Buffer.byteLength(result.code)} bytes`);
}
console.log(`${scripts.length} scripts, ${jsTotal} bytes total`);

/* ---------------------------------------------------------- image sizes */

// Width/height for every local image, so pages can reserve the right box
// before the file arrives (CLS). Remote images (most of the consumption list)
// are not fetched at build time and simply stay out of the map.
function imageSize(file) {
  const buffer = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.png' && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (ext === '.gif' && buffer.length > 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if ((ext === '.jpg' || ext === '.jpeg') && buffer.length > 4) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isStartOfFrame) {
          return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        }
        offset += 2 + length;
      }
      return null;
    }
    if (ext === '.webp' && buffer.length > 30) {
      const kind = buffer.toString('ascii', 12, 16);
      if (kind === 'VP8X') {
        return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      }
      if (kind === 'VP8 ') {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (kind === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
      return null;
    }
    if (ext === '.svg') {
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 2048));
      const width = /<svg[^>]*\bwidth="([\d.]+)/.exec(text);
      const height = /<svg[^>]*\bheight="([\d.]+)/.exec(text);
      if (width && height) return { width: Math.round(Number(width[1])), height: Math.round(Number(height[1])) };
      const box = /viewBox="([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(text);
      if (box) return { width: Math.round(Number(box[3])), height: Math.round(Number(box[4])) };
      return null;
    }
  } catch (error) {
    return null;
  }
  return null;
}

const imageRoots = [path.join(root, 'public/assets/images'), path.join(root, 'public/assets/games')];
const sizes = {};
for (const imageRoot of imageRoots) walkImages(imageRoot);

function walkImages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkImages(full); continue; }
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name)) continue;
    const size = imageSize(full);
    if (!size || !size.width || !size.height) continue;
    const url = '/' + path.relative(path.join(root, 'public'), full).split(path.sep).join('/');
    // Pages spell these URLs either raw or percent-encoded, so index both.
    sizes[url] = [size.width, size.height];
    sizes[url.replace(/ /g, '%20')] = [size.width, size.height];
  }
}

fs.mkdirSync(path.dirname(sizeFile), { recursive: true });
fs.writeFileSync(sizeFile, JSON.stringify(sizes, null, 0));
console.log(`src/generated/image-sizes.json  ${Object.keys(sizes).length} images`);
