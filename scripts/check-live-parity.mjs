#!/usr/bin/env node
// Live parity: prove the built site serves the same content as the deployed
// https://asarav.github.io.
//
//   node scripts/check-live-parity.mjs [--live <origin>] [--dist <dir>]
//
// This is a network check, so it is not part of CI. It compares the twelve
// routes and the assets whose bytes are stable between the Jekyll deployment and
// the Astro build, normalising only what each generator legitimately changes:
//
//   routes   head tags (comments, XHTML void tags, entities, inline JSON spacing)
//            with the generator meta dropped; body text; script src order.
//            `/floor-0/` carries a generated build date, normalised on that
//            route only.
//   css      declaration-level equality against the expanded src/styles compile
//            (the same basis check:css uses, and check:css pins dist/ to that
//            compile), allowing the planned @font-face URL fix and the dead
//            rules Phase 6 removed.
//   js       the live file re-minified with the build's terser options must be
//            byte-identical to the shipped file.
//   data     robots.txt and projects.json byte-identical (CRLF tolerated).
//   sitemap  same <loc> set; <lastmod> is a build value and is ignored.
//   sw.js    generated on purpose: reported, not compared byte-for-byte.

import fs from 'node:fs';
import path from 'node:path';
import * as sass from 'sass';
import { minify } from 'terser';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const LIVE = option('--live', 'https://asarav.github.io').replace(/\/$/, '');
const DIST = option('--dist', 'dist');
const TIMEOUT = 25000;

const ROUTES = [
  { url: '/', file: 'index.html' },
  { url: '/about/', file: 'about/index.html' },
  { url: '/projects/', file: 'projects/index.html' },
  { url: '/games/', file: 'games/index.html' },
  { url: '/books/', file: 'books/index.html' },
  { url: '/consumption/', file: 'consumption/index.html' },
  { url: '/log/', file: 'log/index.html' },
  { url: '/music/', file: 'music/index.html' },
  { url: '/contact/', file: 'contact/index.html' },
  { url: '/floor-0/', file: 'floor-0/index.html' },
  { url: '/hidden/', file: 'hidden/index.html' },
  { url: '/404.html', file: '404.html' }
];
const SCRIPTS = ['site-motion.js', 'consumption.js', 'background-fractal.js'];
const TERSER_OPTIONS = { compress: { passes: 2 }, mangle: false, format: { comments: false } };

const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL  ${message}`);
};
const pass = (message) => console.log(`ok    ${message}`);

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

const stripCr = (text) => text.replace(/\r\n/g, '\n');

/* --------------------------------------------------------------- HTML shapes */

function headOf(html) {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}

// Same equivalences parity.cjs uses, plus the generator meta, which names the
// generator and therefore must change when Jekyll becomes Astro.
function normaliseHead(head) {
  return head
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .split(/(?=<)/)
    .map((chunk) =>
      chunk
        .replace(/&amp;/g, '&')
        .replace(/\s*\/>/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(<script\b[^>]*>)\s+/, '$1')
        .replace(/\s+(<\/script>)$/, '$1')
        .replace(/\s*([{}[\],;:])\s*/g, '$1')
    )
    .filter(Boolean)
    .filter((tag) => !/^<meta\b[^>]*\bname="generator"/i.test(tag))
    .join('\n');
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function scriptSrcsOf(html) {
  const srcs = [];
  const re = /<script\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const src = match[0].match(/\bsrc\s*=\s*"([^"]+)"/i);
    if (src) srcs.push(src[1]);
  }
  return srcs;
}

// `/floor-0/` prints the date it was built; that line is generated, not copy.
function normaliseBuildDate(html) {
  return html.replace(/<dd>\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*<\/dd>/g, '<dd>BUILD_DATE</dd>');
}

/* ------------------------------------------------------------------- CSS map */

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
          else if (!prelude.startsWith('@') || prelude.startsWith('@font-face')) {
            add(prelude, body.replace(/\/\*[\s\S]*?\*\//g, ''), media);
          }
          buffer = '';
        }
      }
    }
  }
  parse(css.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return map;
}

// The dead rules Phase 6 deleted; check:css documents them against the same
// baseline, so the live check allows exactly these and nothing else.
const DOCUMENTED_REMOVALS = new Set(['.archive-intro', '.archive-intro .archive-lede', '.scene-timelapse-progress']);
const DOCUMENTED_PROPERTY_REMOVALS = new Set([':root --ink-soft', ':root --surface-raised', ':root --surface-glass', ':root --elev-3']);

function compareCss(liveCss) {
  const expanded = sass.compile(path.join('src/styles/main.scss'), {
    loadPaths: [path.join('src/styles/partials')],
    style: 'expanded',
    sourceMap: false
  }).css;
  const live = declarations(liveCss);
  const build = declarations(expanded);
  const problems = [];

  for (const [key, props] of live) {
    const selector = key.slice(key.indexOf('|') + 1);
    if (!build.has(key)) {
      if (!DOCUMENTED_REMOVALS.has(selector)) problems.push(`rule missing from src/styles without a documented reason: ${key.slice(0, 110)}`);
      continue;
    }
    const now = build.get(key);
    for (const [property, value] of props) {
      if (!now.has(property)) {
        if (!DOCUMENTED_PROPERTY_REMOVALS.has(`${selector} ${property}`)) problems.push(`${selector} lost ${property}`);
        continue;
      }
      if (now.get(property) === value) continue;
      const fontFaceFix =
        selector.startsWith('@font-face') && property === 'src' &&
        value.includes('../fonts/white-rabbit.ttf') &&
        now.get(property).includes('/assets/fonts/white-rabbit.ttf');
      if (!fontFaceFix) problems.push(`${selector} ${property}: live "${value.slice(0, 70)}" vs build "${now.get(property).slice(0, 70)}"`);
    }
    for (const property of now.keys()) {
      if (!props.has(property)) problems.push(`${selector} gained ${property}: ${now.get(property)}`);
    }
  }
  for (const key of build.keys()) {
    if (!live.has(key)) problems.push(`rule in src/styles that the live site does not serve: ${key.slice(0, 110)}`);
  }
  return problems;
}

/* ---------------------------------------------------------------- comparisons */

async function compareRoutes() {
  for (const route of ROUTES) {
    const liveHtml = await fetchText(LIVE + route.url);
    const distPath = path.join(DIST, route.file);
    if (!fs.existsSync(distPath)) {
      fail(`${route.url}: ${distPath} is missing (run pnpm build)`);
      continue;
    }
    const buildHtml = fs.readFileSync(distPath, 'utf8');
    const liveComparable = route.url === '/floor-0/' ? normaliseBuildDate(liveHtml) : liveHtml;
    const buildComparable = route.url === '/floor-0/' ? normaliseBuildDate(buildHtml) : buildHtml;

    const liveHead = normaliseHead(headOf(liveComparable));
    const buildHead = normaliseHead(headOf(buildComparable));
    if (liveHead !== buildHead) {
      const liveLines = liveHead.split('\n');
      const buildLines = buildHead.split('\n');
      const index = liveLines.findIndex((line, i) => line !== buildLines[i]);
      fail(`${route.url}: head differs at line ${index + 1}: live "${(liveLines[index] || '(absent)').slice(0, 120)}" vs build "${(buildLines[index] || '(absent)').slice(0, 120)}"`);
      continue;
    }

    const liveText = textOf(liveComparable);
    const buildText = textOf(buildComparable);
    if (liveText !== buildText) {
      let at = 0;
      while (at < liveText.length && at < buildText.length && liveText[at] === buildText[at]) at++;
      fail(`${route.url}: body text differs at character ${at}: live "${liveText.slice(at, at + 80)}" vs build "${buildText.slice(at, at + 80)}"`);
      continue;
    }

    const liveScripts = scriptSrcsOf(liveComparable);
    const buildScripts = scriptSrcsOf(buildComparable);
    if (liveScripts.join('|') !== buildScripts.join('|')) {
      fail(`${route.url}: script order differs: live [${liveScripts.join(', ')}] vs build [${buildScripts.join(', ')}]`);
      continue;
    }

    pass(`${route.url}: head, body text and script order match`);
  }
}

async function compareAssets() {
  const liveCss = await fetchText(`${LIVE}/assets/css/main.css`);
  const buildCssPath = path.join(DIST, 'assets/css/main.css');
  if (!fs.existsSync(buildCssPath)) {
    fail('assets/css/main.css missing from the build');
  } else {
    const problems = compareCss(liveCss);
    if (problems.length) {
      for (const problem of problems.slice(0, 8)) fail(`main.css: ${problem}`);
      if (problems.length > 8) console.error(`      ...and ${problems.length - 8} more`);
    } else {
      pass('main.css: every selector, media query and declaration matches the live stylesheet (dead-rule removals and @font-face fix aside)');
    }
  }

  for (const name of SCRIPTS) {
    const liveJs = await fetchText(`${LIVE}/assets/js/${name}`);
    const buildPath = path.join(DIST, 'assets/js', name);
    if (!fs.existsSync(buildPath)) {
      fail(`assets/js/${name} missing from the build`);
      continue;
    }
    const result = await minify(liveJs, TERSER_OPTIONS);
    if (!result.code) {
      fail(`assets/js/${name}: terser produced no output for the live file`);
      continue;
    }
    const shipped = fs.readFileSync(buildPath, 'utf8');
    if (stripCr(result.code) !== stripCr(shipped)) {
      fail(`assets/js/${name}: re-minifying the live file does not match the shipped file (${result.code.length} vs ${shipped.length} B)`);
    } else {
      pass(`assets/js/${name}: live source re-minified with the build options matches the shipped file`);
    }
  }

  for (const name of ['robots.txt', 'projects.json']) {
    const liveText = await fetchText(`${LIVE}/${name}`);
    const buildPath = path.join(DIST, name);
    if (!fs.existsSync(buildPath)) {
      fail(`${name} missing from the build`);
      continue;
    }
    if (stripCr(liveText) !== stripCr(fs.readFileSync(buildPath, 'utf8'))) {
      fail(`${name}: live and build bytes differ`);
    } else {
      pass(`${name}: byte-identical to the live site`);
    }
  }

  const liveSitemap = await fetchText(`${LIVE}/sitemap.xml`);
  const buildSitemapPath = path.join(DIST, 'sitemap.xml');
  if (!fs.existsSync(buildSitemapPath)) {
    fail('sitemap.xml missing from the build');
  } else {
    const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const live = locs(liveSitemap);
    const build = locs(fs.readFileSync(buildSitemapPath, 'utf8'));
    if (live.join('|') !== build.join('|')) {
      fail(`sitemap URL set differs: ${live.length} live vs ${build.length} build`);
    } else {
      pass(`sitemap.xml: same ${live.length} URLs (lastmod ignored)`);
    }
  }

  // The worker is generated by this project, so it is expected to differ; report
  // what the difference is instead of pretending the bytes should match.
  const liveSw = await fetchText(`${LIVE}/sw.js`);
  const buildSwPath = path.join(DIST, 'sw.js');
  if (!fs.existsSync(buildSwPath)) {
    fail('sw.js missing from the build');
  } else {
    const buildSw = fs.readFileSync(buildSwPath, 'utf8');
    const shellOf = (text) => {
      const block = text.match(/SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]/);
      return block ? (block[1].match(/['"][^'"]+['"]/g) || []).length : 0;
    };
    const liveShell = shellOf(liveSw);
    const buildShell = shellOf(buildSw);
    const cache = (buildSw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '';
    console.log(`note  sw.js: generated on purpose — live precaches ${liveShell} paths, build precaches ${buildShell} (cache ${cache}); install/offline behaviour is covered by scripts/check-sw-shell.mjs and the service-worker CDP checks`);
    if (!/^asarav-shell-\d{14}$/.test(cache)) fail(`sw.js: generated cache name "${cache}" does not carry a build stamp`);
    if (buildShell !== 15) fail(`sw.js: expected 15 precached paths, found ${buildShell}`);
  }
}

/* ---------------------------------------------------------------------- main */

if (!fs.existsSync(DIST)) {
  console.error(`FAIL: ${DIST}/ not found — run pnpm build first`);
  process.exit(1);
}

console.log(`comparing ${LIVE} to ${DIST}/`);
try {
  await compareRoutes();
} catch (error) {
  fail(`routes: ${error.message}`);
}
try {
  await compareAssets();
} catch (error) {
  fail(`assets: ${error.message}`);
}

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} live-parity problem(s)`);
  process.exit(1);
}
console.log('\nPASS: the build serves the same content as the live site (generated values and documented minification aside).');
