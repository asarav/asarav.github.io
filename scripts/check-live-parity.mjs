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
//            with the generator meta dropped; body markup; script src order.
//            `/floor-0/` carries a generated build date, normalised on that
//            route only. `/projects/` normalises only the 20 demo media tiles
//            (GIF <img> on the live site, poster <img> + <video data-src> in
//            the build), pairing them by file stem, so every other byte of that
//            document still has to match. `/consumption/` compares rendered
//            entries rather than markup, because the build deliberately drops
//            the data-* attributes the live site repeats on every card; entries
//            the live site does not serve yet are reported and counted, while any
//            change to an entry it does serve fails.
//   css      byte-identical once the site serves this build. A pre-cutover
//            deployment is unminified, so for that shape the live sheet is
//            compared at declaration level against the expanded src/styles
//            compile (the basis check:css uses), allowing the @font-face URL
//            fix and the dead rules Phase 6 removed.
//   js       byte-identical once deployed; for a pre-cutover deployment the
//            live source is re-minified with the build's terser options first.
//            `consumption.js` is listed as pending: this build replaces the
//            data-* lookups with DOM derivation, so it cannot match until it
//            ships. The shipped file must still be valid minified output.
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
// Scripts whose shipped bytes intentionally differ from the deployed ones until
// this build ships. Everything not listed here must match exactly.
const PENDING_SCRIPTS = new Map([
  [
    'consumption.js',
    'the attribute trim replaces the data-item-id/completion-date/title/type lookups with DOM derivation, so the shipped file cannot match the live one until it deploys'
  ]
]);
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

function bodyOf(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : '';
}

function firstDiff(label, a, b) {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  return `${label} differs at character ${at} of ${a.length} vs ${b.length}: live "${a.slice(at, at + 80)}" vs build "${b.slice(at, at + 80)}"`;
}

/* -------------------------------------------------- /projects/ media swap */

// /projects/ replaced its 20 demo GIFs with MP4s. Only those elements are
// rewritten: a build tile (poster <img> + <video> + <source data-src>) and its
// live GIF <img> both become one stem token, so (a) the pairing is checked by
// file stem (Darwin.gif ↔ Darwin.mp4) and (b) every other byte of the document
// — including the 21 pre-existing videos — still has to match exactly.
const PROJECT_MEDIA_BUILD =
  /<span class="gif-video"><img [^>]*?src="([^"]+)\.poster\.jpg"[^>]*><video [^>]*>(?:<source [^>]*?data-src="([^"]+)\.mp4"[^>]*>)?<\/video><\/span>/g;
const PROJECT_MEDIA_LIVE = /<img [^>]*?src="([^"]+)\.gif"[^>]*>/g;

function normaliseProjectMedia(html, side) {
  const stems = [];
  const mismatched = [];
  const out = html.replace(side === 'live' ? PROJECT_MEDIA_LIVE : PROJECT_MEDIA_BUILD, (match, src, video) => {
    const stem = src.split('/').pop();
    stems.push(stem);
    // Inside a build tile the poster and the MP4 must name the same demo.
    if (side === 'build' && video && video.split('/').pop() !== stem) mismatched.push(`${stem} poster vs ${video.split('/').pop()} video`);
    return `<media-demo stem="${stem}">`;
  });
  return { html: out, stems, count: stems.length, mismatched };
}

function compareProjectMarkup(liveHtml, buildHtml) {
  const live = normaliseProjectMedia(liveHtml, 'live');
  const build = normaliseProjectMedia(buildHtml, 'build');
  if (build.mismatched.length) return `demo tile pairs the wrong poster and video: ${build.mismatched.slice(0, 3).join(', ')}`;
  if (live.count !== build.count) {
    return `media tile count differs: live ${live.count} demo GIF(s) vs build ${build.count} video tile(s)`;
  }
  if (live.stems.join('|') !== build.stems.join('|')) {
    const at = live.stems.findIndex((stem, i) => stem !== build.stems[i]);
    return `demo media pairing differs at tile ${at + 1}: live ${live.stems[at]} vs build ${build.stems[at]}`;
  }
  if (live.html !== build.html) return firstDiff('body markup', live.html, build.html);
  return null;
}

/* ------------------------------------------- /consumption/ entry compare */

// The build drops the four data-* attributes the live page repeats on all 1597
// cards (verified rendering-identical by the CDP harness), so markup cannot be
// compared there. Instead compare what the page renders, entry by entry:
//   * every entry the live site serves must be present, unchanged;
//   * extra entries are allowed only if their title is listed here as pending a
//     deploy, and they are reported by name. Delete the title from this list
//     once that entry is live, so the build must match the site exactly again;
//   * each page's "Chronology · N entries" counter must agree with its own cards.
const PENDING_ENTRY_TITLES = ['A Room with a View'];

function consumptionItems(body) {
  // The live cards carry data-* attributes after class, the build's do not;
  // only the opening tag matters here because the payload is compared as text.
  const parts = body.split(/(?=<div class="(?:row |mobile )?item info[^"]*"[^>]*>)/);
  return parts.slice(1).map((chunk) => textOf(chunk));
}

function compareConsumptionBody(liveHtml, buildHtml) {
  const liveItems = consumptionItems(liveHtml);
  const buildItems = consumptionItems(buildHtml);
  if (!liveItems.length || !buildItems.length) return 'could not find any consumption entries to compare';

  const counts = new Map();
  for (const item of liveItems) counts.set(item, (counts.get(item) || 0) + 1);

  const remaining = [];
  const extras = [];
  for (const item of buildItems) {
    const left = counts.get(item) || 0;
    if (left > 0) {
      counts.set(item, left - 1);
      remaining.push(item);
    } else {
      extras.push(item);
    }
  }

  const missing = [...counts.entries()].filter(([, left]) => left > 0).map(([item]) => item);
  if (missing.length) return `entry changed or missing from the build (${missing.length}): "${missing[0].slice(0, 90)}"`;
  if (remaining.join('\u0000') !== liveItems.join('\u0000')) return 'entries are in a different order than the live site';

  const unexpected = extras.filter((item) => !PENDING_ENTRY_TITLES.some((title) => item.includes(title)));
  if (unexpected.length) return `unexpected new entry (${unexpected.length}): "${unexpected[0].slice(0, 90)}"`;
  if (extras.length % 2 !== 0) return `pending entries appear ${extras.length} time(s); expected one per list`;

  const counter = (html) => {
    const match = html.match(/Chronology · (\d+) entries/);
    return match ? Number(match[1]) : NaN;
  };
  const liveCount = counter(liveHtml);
  const buildCount = counter(buildHtml);
  if (liveCount !== liveItems.length / 2) return `live page says ${liveCount} entries but renders ${liveItems.length / 2}`;
  if (buildCount !== buildItems.length / 2) return `build says ${buildCount} entries but renders ${buildItems.length / 2}`;

  return { pending: extras.length / 2, entries: buildCount };
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

    const liveBody = stripCr(bodyOf(liveComparable));
    const buildBody = stripCr(bodyOf(buildComparable));
    let consumptionFacts = null;

    if (route.url === '/consumption/') {
      const result = compareConsumptionBody(liveBody, buildBody);
      if (typeof result === 'string') {
        fail(`${route.url}: ${result}`);
        continue;
      }
      consumptionFacts = result;
    } else if (route.url === '/projects/') {
      const problem = compareProjectMarkup(liveBody, buildBody);
      if (problem) {
        fail(`${route.url}: ${problem}`);
        continue;
      }
    } else if (liveBody !== buildBody) {
      fail(`${route.url}: ${firstDiff('body markup', liveBody, buildBody)}`);
      continue;
    }

    const liveScripts = scriptSrcsOf(liveComparable);
    const buildScripts = scriptSrcsOf(buildComparable);
    if (liveScripts.join('|') !== buildScripts.join('|')) {
      fail(`${route.url}: script order differs: live [${liveScripts.join(', ')}] vs build [${buildScripts.join(', ')}]`);
      continue;
    }

    if (route.url === '/consumption/') {
      const { entries, pending } = consumptionFacts;
      pass(
        `${route.url}: head and script order match; ${entries} entries match live's ${entries - pending}` +
          (pending ? ` plus ${pending} pending deploy (${PENDING_ENTRY_TITLES.join(', ')})` : '')
      );
    } else if (route.url === '/projects/') {
      pass(`${route.url}: head and script order match; body markup identical apart from the 20 demo media tiles (GIF → poster + video, paired by file stem)`);
    } else {
      pass(`${route.url}: head, body markup and script order match`);
    }
  }
}

async function compareAssets() {
  const liveCss = await fetchText(`${LIVE}/assets/css/main.css`);
  const buildCssPath = path.join(DIST, 'assets/css/main.css');
  if (!fs.existsSync(buildCssPath)) {
    fail('assets/css/main.css missing from the build');
  } else {
    const shippedCss = fs.readFileSync(buildCssPath, 'utf8');
    if (stripCr(liveCss) === stripCr(shippedCss)) {
      pass('main.css: byte-identical to the deployed stylesheet');
    } else {
      // Pre-cutover: live is still the expanded Sass output.
      const problems = compareCss(liveCss);
      if (problems.length) {
        for (const problem of problems.slice(0, 8)) fail(`main.css: ${problem}`);
        if (problems.length > 8) console.error(`      ...and ${problems.length - 8} more`);
      } else {
        pass('main.css: deployed (unminified) stylesheet matches every selector, media query and declaration of src/styles');
      }
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
    if (stripCr(liveJs) === stripCr(shipped)) {
      pass(`assets/js/${name}: byte-identical to the deployed file`);
    } else if (stripCr(result.code) === stripCr(shipped)) {
      pass(`assets/js/${name}: deployed (unminified) source re-minified with the build options matches the shipped file`);
    } else if (PENDING_SCRIPTS.has(name)) {
      // Named exception: the shipped file must still be a complete, minified
      // build of its source, so a broken or half-written file cannot slip by.
      const check = await minify(shipped, TERSER_OPTIONS);
      if (!check.code || stripCr(check.code) !== stripCr(shipped)) {
        fail(`assets/js/${name}: shipped file is not stable minified output`);
        continue;
      }
      console.log(
        `note  assets/js/${name}: pending deploy — ${PENDING_SCRIPTS.get(name)} (live ${result.code.length} B, build ${shipped.length} B)`
      );
    } else {
      fail(`assets/js/${name}: neither the deployed file nor its re-minified source matches the shipped file (${result.code.length} vs ${shipped.length} B)`);
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
