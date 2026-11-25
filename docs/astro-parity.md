# Astro parity: harness and behaviour checklist

The contract for this migration is **zero functional regressions**. Every route,
interaction, cached shell and metadata behaviour that works on the Jekyll site
must work on the Astro build, and a behaviour that cannot be verified holds the
switch rather than shipping.

## Harness

```bash
# Capture a build (run from the repo root)
node .shots/parity.cjs capture _site .shots/astro-parity/base
node .shots/parity.cjs capture dist  .shots/astro-parity/astro
node .shots/parity.cjs compare .shots/astro-parity/base .shots/astro-parity/astro
```

`.shots/` is gitignored, so captures stay local. `compare` exits non-zero and
prints the offending route, file or character offset. The script is CommonJS
(`.cjs`) because the repo's `package.json` declares `"type": "module"`.

What a capture records:

- `manifest.sha256` — every file in the build, hashed. Two values are normalised
  so an unchanged rebuild compares equal: the per-build cache timestamp in
  `sw.js` (`asarav-shell-<timestamp>`) and `<lastmod>` in `sitemap.xml`.
- `routes.txt` — the 12 published routes.
- `sitemap-urls.txt` — the 11 `<loc>` entries.
- `head/<route>.html` — the `<head>` contents, one tag per line, comments and
  inter-tag whitespace removed.
- `text/<route>.txt` — body text with scripts, styles, tags and entities
  normalised, so markup changes are allowed but copy changes are not.
- `scripts/<route>.json` — script `src` values in document order, plus inline
  script count.
- `meta.json` — file count, total bytes, per-route bytes and image counts.

The current baseline (Jekyll 4.4.1, `master` before the scaffold):

| Field | Value |
|---|---|
| Files | 462 |
| Total bytes | 538,429,324 |
| Routes | 12 |
| Sitemap URLs | 11 |
| `/consumption/` HTML | 4,805,332 bytes, 3,192 `<img>` |

**Proven non-vacuous:** an unchanged rebuild compares equal (`PASS`); each of a
changed file (`robots.txt`), an unexpected extra file, and a changed `<head>`
tag on `/about/` makes `compare` exit 1 with the specific difference named; a
deleted route fails capture with `route /log/ missing`.

## Behaviour checklist

Each row is checked on the Astro build before the switch. "Working" is what has
to be observable, not merely what has to be present in the markup.

### Shell (every route)

| # | Behaviour | Trigger | Working looks like | Route |
|---|---|---|---|---|
| 1 | Early `js` class | Load with JS | `<html class="js">` set before first paint | all |
| 2 | Typing fallback | Block `hero-typed.js`, wait 5 s | `js` class removed, hero copy visible | `/` |
| 3 | Motion fallback | Block motion scripts, wait 1.5 s | `js-motion` removed, content visible without animation | all |
| 4 | Image root contract | Inspect `body` | `data-image-root="/assets/images/"` present | all |
| 5 | Skip link | Press Tab on load | "Skip to content" focuses `#content` | all |
| 6 | Scroll progress | Scroll | Bar tracks document position | all |
| 7 | Title rule | Load `/` and `/about/` | Home title bare; others `Title \| asarav` | both |
| 8 | Verification + theme meta | View source | `google-site-verification`, `theme-color #070b10` | all |
| 9 | Preloads/preconnects | Network panel | Homepage tile preloaded; three preconnects | `/` |
| 10 | Bootstrap CDN | Network panel | CSS + bundle from jsDelivr with SRI attributes | all |
| 11 | Page stylesheet | View source | One `/assets/css/pages/<page>.css` link, not all of them | 8 pages |
| 12 | JSON-LD | View source | Layout block + blocks on `/books/`, `/projects/` | all + 2 |
| 13 | Speculation rules | View source | `speculationrules` prefetch present | all |
| 14 | Calendar data | Console | `window.__calendar` is a non-empty array | all |
| 15 | Script order | View source | Same `defer` order as baseline capture | all |

### Interaction

| # | Behaviour | Trigger | Working looks like | Route |
|---|---|---|---|---|
| 16 | Typing hero | Visit | Types, pauses when tab hidden, resumes | `/` |
| 17 | Nav states | Scroll, hover, press | Scrolled styling, ice hover, signal press, brand canvas draws | all |
| 18 | Brand canvas | Hover wordmark | Canvas animation + `data-brand-hover` | all |
| 19 | Background fractal | Visit | Canvas paints, non-blank | most |
| 20 | Fractal opt-out | Visit page with `background_fractal: false` | No background canvas script | per page |
| 21 | Footer field | Scroll to footer | Canvas paints | all |
| 22 | 404 fractal | Visit `/404.html` | Canvas paints | 404 |
| 23 | Weather + city layers | Visit, scroll | Layers paint, stand down offscreen | `/` |
| 24 | Matrix rain | Visit | Rain canvas animates | `/` |
| 25 | Fireworks | Visit on a calendar date | Bursts render | calendar pages |
| 26 | Ambient sound | Click toggle | Audio starts/stops, state persists | all |
| 27 | Data saver | `data-saver` set | Effects reduce | all |
| 28 | Consumption filters | Select type | List filters; chronology band sticks | `/consumption/` |
| 29 | Music player | Press play | Audio plays, player state updates | `/music/` |
| 30 | Projects paging | Next page | Next batch renders without reload | `/projects/` |
| 31 | Media fallback | Block a CDN image | Placeholder appears, no broken icon | all |
| 32 | Unity build | Open a game | WebGL scene boots and accepts input | one game |
| 33 | p5/ml5 demo | Open demo | Sketch renders | demo page |
| 34 | Service worker | DevTools offline, reload `/projects/` | Cached shell serves; cache name rolls per build | all |
| 35 | SW precache list | `node .shots/check-shell.sh` (CI) | 13 entries, all present in the build | build |
| 36 | Machine-readable files | Fetch directly | `projects.json`, `llms.txt`, `llms-full.txt` serve | root |
| 37 | Sitemap | Fetch `/sitemap.xml` | 11 URLs, same set as baseline | root |

## Gate log

| Gate | Result |
|---|---|
| Baseline captured: 462 files / 12 routes / 11 sitemap URLs | pass |
| Unchanged rebuild compares equal | pass |
| Injected file-content delta fails | pass |
| Injected extra-file delta fails | pass |
| Injected head delta fails | pass |
| Deleted route fails capture | pass |
| Lighthouse + byte baseline captured | pass (6 runs) |
| `pnpm build` succeeds | pass (0 pages at scaffold stage) |
| `public/` mirrored byte-for-byte in `dist/` (445 files) | pass |

## Phase 2 — styles, shell, SEO, generated service worker

### What the harness treats as equivalent

| Normalisation | Why |
|---|---|
| `<meta … />` vs `<meta …>` | Astro emits HTML void tags without the XHTML slash; same DOM |
| `&amp;` vs `&` in a title/og/twitter value | the Jekyll title held a bare `&`, Astro escapes it; same text |
| whitespace inside inline `<script>` bodies, including around `{ } [ ] , ; :` | `__calendar` is pretty-printed by Liquid and compact from `JSON.stringify`; same data |
| comments and whitespace between tags | formatting only |

Baseline note: `.shots/astro-parity/base` was re-captured **from the frozen Jekyll build `.shots/build-base`** after these normalisations were added. It is still Jekyll output; nothing was captured from `dist/`. A second independent capture of `.shots/build-base` compares equal to `base`, so the harness is still self-consistent.

### Head diff for `/`, line by line

`PARITY_ROUTES=root node .shots/parity.cjs routes .shots/astro-parity/base .shots/astro-parity/astro`

| # | Baseline | Astro | Reason |
|---|---|---|---|
| 1 | `<meta name="generator" content="Jekyll v4.4.1">` | `<meta name="generator" content="Astro v7.4.13">` | the generator meta names the generator, so it cannot be preserved truthfully. It is registered in `DOCUMENTED_HEAD_DIFFS` in `.shots/parity.cjs`, so the run reports it as `documented:` and substitutes it instead of silently ignoring it. |

Every other head line is identical after normalisation, in this order: charset, viewport, color-scheme, five preconnects + dns-prefetch, title, author, keywords, google-site-verification, the early `js`/`js-motion` script, theme-color, favicons, `__calendar`, the home `projects.jpg` preload, the font/jsdelivr preconnects, Bootstrap CSS + SRI, Google Fonts CSS, `/assets/css/main.css`, the full `jekyll-seo-tag` set (generator, og:title, author, og:locale, description, og:description, canonical, og:url, og:site_name, og:type, twitter:card, twitter:title), both JSON-LD blocks, and `speculationrules`. Body text is identical and the script order and `inlineCount: 6` match.

### Phase 2 gate log

| Gate | Result |
|---|---|
| `pnpm build` (CSS then Astro) | pass — 1 page + `/sw.js`, 3.6 s wall |
| `dist/assets/css/main.css` at the unhashed root-absolute path | pass — 65,639 B |
| Nine page sheets at `/assets/css/pages/*.css` | pass — 144,012 B across all ten sheets |
| `pnpm public:check` | pass — 445 files byte-for-byte; no relative asset URL in `dist/index.html` |
| CSS diff, `main.css` | one line: `../fonts/white-rabbit.ttf` → `/assets/fonts/white-rabbit.ttf` (+5 B), the planned fix |
| CSS diff, nine page sheets | identical, byte for byte |
| Head/text/script parity for `/` | pass, with the single documented line above |
| `pnpm check:sw` | pass — 6 precached paths all present; `asarav-shell-<14 digits>`; no `addAll`; no `skipWaiting`; network-first |
| Fresh-profile SW install + offline `/` | pass — 10/10 CDP checks in Chrome 157 headless |
| JS-blocked fallbacks | pass — `js` removed by the 5 s timer, `js-motion` by 1.5 s, copy still readable |
| Injected phantom precache path | pass (fails loudly) — `FAIL: 1 precached path(s) missing from the build: /assets/css/does-not-exist.css` |
| Injected hashed `main.css` | pass (fails loudly) — `check:sw` reports the path missing, `public:check` reports `missing from build (1): assets/css/main.css` |
| Injected `skipWaiting()` | pass (fails loudly) — `FAIL: skipWaiting() would swap the worker mid-session` |
| Injected `<title>` mutation | pass (fails loudly) — head and body-text diff, exit 1 |

All four injected breaks were reverted and every gate re-passed afterwards.

### Still open after Phase 2

- `/sitemap.xml`: `@astrojs/sitemap` emits `sitemap-index.xml` + `sitemap-0.xml`. A custom endpoint must reproduce the single `/sitemap.xml` with 11 URLs before row 37 can pass.
- 11 routes are not ported, so the full-manifest `parity.cjs compare` (462 files, 12 routes) stays red until Phases 3–7.
- `.github/workflows/site-checks.yml` still drives the Jekyll build, which cannot build this tree any more. It fails on this branch by design and is replaced in Phase 8.
- The Jekyll-era `node .shots/check-shell.sh` (asserting ≥ 13 entries) is superseded by `scripts/check-sw-shell.mjs`, which asserts the 6 real paths. The CI step must call the new script in Phase 8.

## Phase 3 — the remaining eleven routes

Every baseline route now renders from Astro. `pnpm build` emits twelve HTML routes plus a single `/sitemap.xml`, `/sw.js` and the mirrored `public/` tree.

### How each page was ported

- **Literal bodies** (`/about/`, `/contact/`, `/floor-0/`, `/hidden/`, `/404.html`, `/projects/`): the Jekyll body was lifted verbatim, with the `relative_url`/`absolute_url` filters resolved to the root-absolute paths they already produced. `/projects/` keeps its embedded `CollectionPage` JSON-LD as the original text via `set:html`, so that block is byte-identical. Two unclosed `<p>` elements in the source (browsers auto-closed them) are closed properly so Astro's stricter parser accepts the page; the rendered text is unchanged.
- **Data pages**: `/consumption/` renders both list views from `consumption.yaml` (then in `_data/`, now `src/data/`) (1,596 entries, 3,192 rows) through `ConsumptionItem.astro`; `/log/` groups entries by year and slugifies the anchors with the same rule Liquid used; `/music/` keeps both layouts and reproduces kramdown's `markdownify` for the descriptions (folded lines joined, straight apostrophes → typographic ones, inline HTML preserved); `/games/` keeps the per-game column width (`12 / images.length`) and `/books/` builds its schema.org graph from the same data the essay list renders.
- **Inline HTML in data**: 18 consumption explanations, 1 game explanation and 2 log explanations contain inline `<a>` tags. Jekyll printed those fields raw, so they use `set:html`; escaping them would have changed the copy (this was caught by the body-text diff on `/consumption/`, `/log/` and `/games/` before it shipped).

### Per-route parity

`node .shots/parity.cjs compare .shots/astro-parity/base .shots/astro-parity/astro` — head, body text and script order against the frozen Jekyll build.

| Route | Head | Body text | Scripts (src count / inline count) |
|---|---|---|---|
| `/` | generator line only | identical | identical (10 / 6) |
| `/about/` | generator line only | identical | identical (10 / 6) |
| `/projects/` | generator line only | identical | identical (11 / 7) |
| `/games/` | generator line only | identical | identical (10 / 6) |
| `/books/` | generator line only | identical | identical (10 / 7) |
| `/consumption/` | generator line only | identical | identical (11 / 6) |
| `/log/` | generator line only | identical | identical (10 / 6) |
| `/music/` | generator line only | identical | identical (11 / 6) |
| `/contact/` | generator line only | identical | identical (10 / 6) |
| `/floor-0/` | generator line only | build date (documented) | identical (10 / 6) |
| `/hidden/` | generator line only | identical | identical (10 / 6) |
| `/404.html` | generator line only | identical | identical (10 / 6) |

Both SEO JSON-LD shapes were reproduced exactly, including the rule jekyll-seo-tag applies: a page with an `image` is a `WebPage` with `og:image`, `twitter:image` and a `summary_large_image` card; a directory page without one stays a `WebSite` with `name`; a standalone `.html` page is always a `WebPage` without `name`. `/404.html` canonicalises to `/404.html`, not `/404/`.

### Documented exceptions, one line each

| Difference | Reason |
|---|---|
| `<meta name="generator" content="Jekyll v4.4.1">` → `Astro v7.4.13` on all 12 routes | the generator meta names the generator |
| `/floor-0/` body prints this build's date instead of the frozen build's | `{{ site.time }}` is the build timestamp by definition; the harness normalises it to `BUILD_DATE` and reports it as documented |
| HTML bytes differ on all 11 compared pages | `compressHTML`, HTML void tags instead of XHTML `/>`, and escaped entities; head, text and script order above are what guard the output |
| `assets/css/main.css` one line | `@font-face` `../fonts/white-rabbit.ttf` → `/assets/fonts/white-rabbit.ttf`, +5 B (planned fix) |
| `sw.js` | generated: precache list now covers every emitted route, cache name carries the build stamp |
| `Games/index.html` (baseline) vs `games/index.html` (Astro) | case-only artifact: the frozen build directory was created as `Games/` on a case-insensitive filesystem; the route is `/games/` and the new build writes `games/` |
| `assets/css/unity-theme.css` missing | dead stylesheet deleted in Phase 1, referenced nowhere |
| `CHANGELOG.md`, `SECURITY.md` | Jekyll published them implicitly as static files; they now live in `public/` so the same URLs keep serving |

`main.css` is otherwise identical and all nine page sheets are byte-identical to the Jekyll build. The Bootstrap 5.3.8 SRI link and the Google Fonts link in the head are unchanged on every route.

### Sitemap

`@astrojs/sitemap` is gone (dependency and integration). `src/pages/sitemap.xml.ts` writes the single `/sitemap.xml`: it lists the pages that exist, skips `404.astro`, honours `export const sitemap = false;` (set on the consumption ledger), lists the static `.html` file from `public/`, and orders pages the way jekyll-sitemap did (home sorts as `index.html`). Output is identical to the baseline, `<lastmod>` included for the verification file; 11 URLs exactly.

### Service worker on the full build

`pnpm check:sw`: 15 paths (10 routes + `main.css`, `site-motion.js`, `media-fallback.js`, `projects.json`, `llms.txt`), 556 KiB installed, per-build cache name, no `addAll`, no `skipWaiting`, network-first. Two deliberate exclusions: `404.html` is an error page rather than a route, and `/consumption/` opts out with `export const precache = false;` because its 4.2 MB of markup would be fetched during every first-visit install; the network-first handler still caches it the first time someone opens it.

Fresh-profile Chrome 157 over CDP, 11/11 checks: SW active, per-build cache, shell cached, offline reload of `/` renders (7 tiles, styled body), offline `/projects/` renders from cache, and with every site script blocked the 5 s / 1.5 s fallbacks still reveal the page.

### Injected breaks on the full build

| Break | Detector | Message |
|---|---|---|
| phantom precache `/log/does-not-exist/` | `pnpm check:sw` | `FAIL: 1 precached path(s) missing from the build: /log/does-not-exist/` |
| `dist/about/index.html` removed | `pnpm check:sw` | `FAIL: 1 precached path(s) missing from the build: /about/` |
| author name changed on `/books/` | `parity.cjs compare` | head and body-text diff, exit 1 |
| shared `site-motion.js` mutated | `parity.cjs compare` | `changed file contents (1): assets/js/site-motion.js` — the documented-file list does not swallow genuine asset changes |

All four were reverted; every gate re-passed afterwards.

### Still open after Phase 3

- The Jekyll tree (`_config.yml`, `_layouts/`, `_includes/`, `pages/`, root `index.html`/`404.html`, `_data/`) was still present at this point because the parity harness and `_data` loaders depended on it; Phase 8 (below) retires it, moves the data to `src/data/` and rewrites the CI workflows.
- `public/CHANGELOG.md` and `public/SECURITY.md` are copies of the root documents, kept because Jekyll served them. If they should stop being published, deleting the copies is the whole change.

## Phase 3 verification — interactions and rendered output

Phase 3's own gate compared markup: head, body text and script order. That says
nothing about whether the buttons, filters, player, lazy images or fractals still
*work*, so this pass drives both builds side by side in the same headless Chrome
and compares what a user would see and do.

`.shots/interact-checks.mjs` (gitignored, like the rest of `.shots/`) is the
harness. It serves the frozen Jekyll build on `127.0.0.1:4184` and `dist/` on
`127.0.0.1:4174`, opens one tab per build per route over CDP, and for each route:
loads the page, sweeps the whole document to trigger lazy images and reveal
observers, runs the route's interactions, records layout geometry and computed
styles, then freezes motion and takes three viewport screenshots (top, a
block-index anchor, bottom) at 1280×900. A second pass loads `/` and
`/consumption/` at 390×844 to drive the collapsed menu and the mobile list.

Verdict rules: any detail difference, any layout difference, any astro-only
console error, exception or HTTP ≥ 400, any missing screenshot, or any pixel
difference above 0.02 % blurred / 0.2 % exact fails the run and exits 1.
`PARITY_SELF=1 node .shots/interact-checks.mjs 9230` compares the baseline with
itself and is how the thresholds were shown to be achievable.

### Determinism

The page is not deterministic by itself: the hero picks its scene from the clock
and its particles from `Math.random()`, the hero note and the footer transmission
type themselves, the weather scene follows live weather, and the fractals paint
on animation frames. The harness therefore pins what can be pinned rather than
loosening thresholds:

| Surface | Why it cannot be compared frame-for-frame | What the harness does |
|---|---|---|
| Clock, `Math.random()` | hero scene tint is recomputed from `new Date()` every 30 s; particle fields are random per load | `Date` frozen to 2026-11-23T12:00Z, `Math.random` seeded, both installed before any page script runs |
| Live weather | hero background is chosen from an open-meteo/wttr.in lookup | those hosts are blocked for both builds, so both render the offline scene |
| Typing copy | `.hero-note`, `.hero-roles`, floor roles and typed explanations change line count, which changes page height | hidden in the layout/screenshot pass only; the body-text parity pass above already compares their text |
| Footer transmission | types random messages of varying length into a live region | hidden in both builds |
| Fractal / p5 canvases | paint on rAF, so two loads never share a frame | hidden in screenshots; the canvas census still asserts the element exists and, where readable, is painted (`getImageData`) |
| Native media chrome, player clock | video frames and `<audio>` UI are decoder/OS dependent | `audio`/`video` and the time/seek labels are hidden; player wiring is compared through classes and ARIA |
| Animated GIFs | `/projects/` has 20 GIF tags; in the captured state one of them is decoded and its frames advance on their own clock, so two loads differ by the frame | its pixels are masked (`visibility: hidden`); its box stays in the layout comparison and `public:check` hashes the file |
| Reveal animations | the scroll sweep starts 600 ms Web Animations transform reveals; `animation: none` does not stop those, and a section frozen mid-reveal is composited on its own layer, which rasterises a 1 px border on a different pixel row | every animation is jumped to its end state, repeatedly, until none are running before each capture; sections are taken off their own layer at freeze |
| Lazy images | one quiet half-second is not enough: an image can finish, shift the layout and pull the next batch into view | three consecutive quiet checks and a five-second floor before any measurement |
| Cold browser | the first route measured in a fresh Chrome paints differently from later ones (font atlas, compositing caches) | each build is loaded once and thrown away before measuring |
| Motion classes | `js-motion`, `motion-ready`, `fast-*`, `is-*` are timing-dependent | removed from the class census and from `html` at freeze |

These are harness normalisations of genuinely dynamic surfaces, not exceptions to
rendered output: everything that is static in the baseline is compared byte for
pixel, and the only remaining pixel difference is the `/floor-0/` build date
already listed above.

### Per-route interaction log

Every figure below was recorded in both builds and compared; `identical` means
the Astro value equalled the baseline value, not merely that the action did not
throw.

| Route | Exercised | Result |
|---|---|---|
| `/` | full scroll sweep, scroll-progress width at half scroll, `#down` chevron click, tile census, typed slogan readiness, skip-link focus, canvas census | identical — progress reached 640 px, chevron scrolled to y=500, 7 tiles, typed slogan ready, skip link focused at −47 px with its reveal transform |
| `/about/` | footnote count and `::after` tooltip content, tech-stack list, `/assets/icons/tech-sprite.svg` fetch, iframes, section ids | identical — 25 images loaded, 6 footnotes, 20 stack items, sprite HTTP 200, 2 map iframes, 16 sections |
| `/projects/` | section reveal on scroll (13 of 34 visible at load), videos, images | identical — 19 of 34 visible after the sweep, 18 `<video>`, sentinel state the same |
| `/games/` | game count and every play link's payload (local ones fetched) | identical — 7 games, 6 local payloads HTTP 200, 1 external link |
| `/books/` | essay list, ranks, cover image, Substack iframe | identical — 5 essays ranked 01–05, cover loaded, iframe present |
| `/consumption/` | both list views, year-jump select (dispatched `change`), chronology rail text, reveal count, first item metadata | identical — 1,596 items in both views, 24 year options, jump to 2026 moved scroll to y=29,240 and the rail from 15 JAN 2026 to 28 JAN 2026, 59 items revealed, first item unchanged |
| `/log/` | entry count, year headings, anchor uniqueness, figures | identical — 48 entries, years 2025–2018, 48 unique ids, first `dec-21-2025`, 11 figures |
| `/music/` | all 22 players enhanced, play/pause toggle, `aria-pressed`, mute toggle and class, second player | identical — 22/22 enhanced, toggle and mute wiring identical on both builds (the mp3s themselves are blocked in-page and checked separately, below) |
| `/contact/` | cards, hrefs, icon images | identical — 11 cards, 11 icons all loaded, same hrefs |
| `/floor-0/` | directory links, blueprint keys | identical — 9 links, 4 keys (the last-revised date is normalised) |
| `/hidden/` | note copy, back link | identical — same 40-character opening, back link `/` |
| `/404.html` | heading, link list, fractal canvas | identical — `NOTFOUND`, 7 links, fractal canvas present and painted |
| `/` and `/consumption/` at 390×844 | nav toggler open + close, mobile list, horizontal overflow | identical — menu opens and closes, mobile list 1,596 items, no horizontal overflow (scrollWidth 390/391 = innerWidth) |

Console and network: zero console errors, zero uncaught exceptions and zero HTTP
≥ 400 on all twelve routes in both builds. The failed requests are the ones the
harness blocks on purpose — one weather `Fetch` per route, plus the media
preloads the browser abandons on `/about/`, `/projects/` (videos) and `/music/`
(blocked mp3s) — and both builds produce exactly the same list.

Audio payloads (`/music/`): the 22 preload streams starve the harness's HTTP/1.1
server, so they are blocked in-page and fetched directly instead. Both builds
serve the same 11 tracks with HTTP 200 (not 206 — the harness asks for the whole
object), `audio/mpeg`, and byte counts from 768,070 B to 9,969,441 B.

### Screenshot comparison

Thirty-six viewport screenshots per build. Pixel counts are exact differences at
threshold 12/765 per pixel, with a 3 px blur pass on top:

| Route | top | mid | bottom |
|---|---|---|---|
| `/` | 0.000 % | 0.000 % | 0.000 % |
| `/about/` | 0.000 % | 0.000 % | 0.000 % |
| `/projects/` | 0.000 % | 0.000 % | 0.000 % |
| `/games/` | 0.000 % | 0.000 % | 0.000 % |
| `/books/` | 0.000 % | 0.000 % | 0.000 % |
| `/consumption/` | 0.000 % | 0.000 % | 0.000 % |
| `/log/` | 0.000 % | 0.000 % | 0.000 % |
| `/music/` | 0.000 % | 0.000 % | 0.000 % |
| `/contact/` | 0.000 % | 0.000 % | 0.000 % |
| `/floor-0/` | 0.000 % | 0.006 % | 0.006 % |
| `/hidden/` | 0.000 % | 0.000 % | 0.000 % |
| `/404.html` | 0.000 % | 0.000 % | 0.000 % |

`/floor-0/` is the build-date line documented above (73–74 differing pixels in a
14-row band, 0.008 % after blurring). Everything else is pixel-identical,
including the 4.2 MB `/consumption/` page and the 34-section `/projects/` page.
The full run was executed twice in a row and produced the same table both times.

### Regressions found and fixed in this pass

Two real output bugs were caught by the interactive pass and fixed in source:

1. `/about/`, `/contact/` and `/projects/` emitted relative asset URLs
   (`assets/...` instead of `/assets/...`) — 118 attributes and 11 `srcset`s.
   On `/about/` the browser resolved them against the page URL, so the harness's
   own request log and the page's lazy images diverged. Fixed in the three page
   components; `scripts/check-relative-urls.mjs` (`pnpm check:urls`) now fails
   the build if any page emits an asset reference without a leading slash.
2. The same pages wrote raw spaces inside `srcset` candidate URLs, which makes
   the browser drop the remaining candidates and fall back to the full-size
   image. That changed every image's rendered height by a sub-pixel amount and
   the page height by one pixel on `/about/`. The URLs are now `%20`-encoded; the
   `srcset` attribute is byte-identical to the baseline (9/9 candidates on
   `/about/`, 2/2 on `/projects/`) and `/about/` `scrollHeight` matches exactly
   (10,994 px).

### Injected runtime break (with the final harness)

The gate is only worth its green if it can go red. `pageScript="/assets/js/music-player.js"`
was deleted from `src/pages/music.astro`, the site rebuilt, and the harness run
on `/music/`:

```
FAIL: 11 interaction/visual difference(s)
  /music/ detail: enhanced: 22 != 0
  /music/ detail: muted: true != false
  /music/ layout: body.rect[3]: 2845 vs 2521
  /music/ layout: bodyScrollHeight: 2845 vs 2521
  /music/ top/mid/bottom: 25.237 % / 37.105 % / 11.568 % exact
```

The file was restored, the site rebuilt, and `/music/` re-ran green
(`details: identical`, `layout: identical`, 0.000 %).

### Gate log (final build)

| Gate | Result |
|---|---|
| `pnpm build` | pass — 12 pages in 2.13 s |
| `node .shots/interact-checks.mjs` (12 routes + 2 mobile) | pass — `PASS: 12 route(s) behave and render like the baseline.`, twice in a row |
| `node .shots/parity.cjs capture` + `compare` | pass — `PASS: build A and build B are equivalent.`, 462 vs 461 files, 12 routes, 11 sitemap URLs, only the documented differences |
| `/sitemap.xml` URL set | pass — 11 URLs, identical list to the baseline |
| `pnpm check:sw` | pass — 15 precached paths all present, per-build cache name |
| `pnpm public:check` | pass — 447 public files mirrored byte-for-byte in `dist/` |
| `pnpm check:urls` | pass — 13 pages use root-absolute asset URLs only |
| CSS | pass — 9 page sheets byte-identical; `main.css` differs only in the documented `@font-face` URL (+5 B); `unity-theme.css` gone as planned |

---

## Phase 6 — minification and image dimensions

Phase 6 keeps the same contract, so every byte it removes is guarded by
something that still compares against the frozen Jekyll build.

### Assets are built, not bundled

`scripts/build-assets.mjs` runs before `astro build` (and before `astro dev`):

| Source | Output | Tool |
|---|---|---|
| `src/styles/main.scss` + `src/styles/pages/*.scss` | `public/assets/css/**.css` | Dart Sass `expanded` → lightningcss `minify` |
| `src/scripts/*.js` (13 classic scripts) | `public/assets/js/*.js` | terser, `compress` only — identifiers are kept |
| `public/assets/images/**`, `public/assets/games/**` | `src/generated/image-sizes.json` | a small PNG/JPEG/GIF/WebP/SVG header reader |
| `src/legacy/unity-theme.css` | `public/assets/css/unity-theme.css` | copied verbatim |

Filenames never change: `sw.js` precaches `/assets/css/main.css` and the shared
scripts by name, and every page links `/assets/css/pages/<page>.css`. The
generated directories are git-ignored; the sources moved to `src/styles` and
`src/scripts` are tracked.

Terser is configured with `mangle: false` on purpose. These are classic scripts
sharing one global scope, and inline page scripts and sibling files call each
other's top-level functions, so renaming identifiers would break the contract
the harness checks.

### The gates that replace "bytes are identical"

`parity.cjs` now documents three more file-level diffs — `main.css`, the nine
`assets/css/pages/*.css` sheets and the thirteen `assets/js/*.js` files — because
minified bytes cannot match the unminified baseline. Each one names the gate that
still proves equivalence:

- **`pnpm check:css`** parses the baseline and the current build into
  `media query + selector → property → value` maps and fails on any difference
  except the planned `@font-face` URL fix and the dead rules Phase 6 deleted
  (`.archive-intro`, `.archive-intro .archive-lede`, `.scene-timelapse-progress`,
  and four unused custom properties). It also fails if `dist/assets/css` is not
  exactly the minified build of `src/styles`, so a stale build cannot pass. A
  second value-compressing pass was tried and reverted — see the note below.
- **`pnpm check:js`** re-runs terser over `src/scripts` with the build's options
  and requires byte identity with `dist/assets/js`, and fails on a shipped script
  without a source. Behaviour itself is the harness's job.
- **`pnpm check:images`** requires every local `<img>` to carry intrinsic
  width/height (and a matching aspect ratio), with `/about/` and `/log/` listed
  as documented exemptions — see `docs/perf.md` for the measured reason.
- The 12-route interaction/visual harness is unchanged and still the authority on
  whether minification changed behavior: it drove both builds through every
  route and passed.

### Results

| Metric | Baseline | Phase 6 |
|---|---|---|
| `main.css` | 65,634 B | 50,544 B (−23.0 %) |
| Page sheets (9) | 78,373 B | 62,828 B (−19.8 %) |
| JS (13 files) | 331,517 B | 150,864 B (−54.5 %) |
| Local `<img>` with width+height | 67 of 97 | 127 of 127 non-exempt |

The `main.css ≤ 50 KB` and `/consumption/ ≤ 1 MB` targets in `docs/perf.md` were
not fully met; that file records the exact shortfall and the arithmetic behind it
rather than adjusting the threshold.

One attempt to close the last 544 B is worth recording here because the parity
gates are what rejected it: a second `csso` pass (`restructure:false`) took
`main.css` to 45,689 B, but it merges 49 rule blocks (moving declarations between
media queries) and rewrites gradient stop positions, and the 12-route harness
then reported 22 differences — a computed `background-image` mismatch on `/` and
screenshot diffs on `/music/` and `/contact/`. It was reverted; `docs/perf.md`
carries the numbers and the log path.

---

## Phase 8 — Jekyll and CI cutover

### What was retired

- `_config.yml`, `_layouts/`, `_includes/`, `pages/` (13 Liquid templates), the
  root `index.html` and `404.html`, `Gemfile`/`Gemfile.lock`, `_site/` and
  `.jekyll-cache/` are deleted from the tree.
- The YAML data moved with history: `_data/` → `src/data/`, and
  `loadData()` in `src/lib/site.ts` reads `src/data/<file>`.
- `docs/TRANSLATIONS.md` was rewritten off the Jekyll assumptions (plugins,
  `_config.yml`, Liquid includes) onto the Astro routing/`src/data` model, and
  `README.md` now documents the pnpm/Astro workflow, the asset build and the
  gates instead of Bundler and `bundle exec jekyll`.

### One plan assumption was wrong, and the fix is recorded here

Phase 1 called `assets/css/unity-theme.css` "referenced nowhere" and deleted it.
It is referenced: every standalone Unity build under `public/assets/games/*/`
links it as `/assets/css/unity-theme.css`. `check:links` caught six 404s (plus a
fragment-only `url(%23n)` false positive, now skipped). The file is restored at
`src/legacy/unity-theme.css`, published at the same URL by the asset build, and
now hash-matches the baseline, so the old "deleted in Phase 1" parity entry is
gone.

### Workflows

- `.github/workflows/site-checks.yml` builds with pnpm
  (`pnpm install --frozen-lockfile`, `pnpm build`) on every push and pull
  request, then runs `check:sw`, `public:check`, `check:urls`, `check:css`,
  `check:js`, `check:images`, `check:links`. The Lighthouse job builds the same
  way and serves `dist/` with `pnpm preview --port 4000` for LHCI.
- html-proofer is gone with Ruby. Its internal-link coverage is replaced by
  `scripts/check-links.mjs`, which resolves every `href`/`src`/`srcset`/CSS
  `url()` in the build against the build itself (662 links across 23 documents on
  this build). External URLs are still not contacted; they answered bots with
  403/999 before, so that check was non-blocking anyway.
- `.github/workflows/pages.yml` builds with pnpm and uploads `dist/` via
  `actions/upload-pages-artifact`; the `--baseurl` flag is gone because
  `astro.config.mjs` pins the custom domain root and asset URLs stay
  root-absolute.

### Gate log (final build, after Phase 6 + Phase 8)

| Gate | Result |
|---|---|
| `pnpm build` | pass — 12 pages, 462 files, 537,562,822 B in `dist/` |
| `node .shots/interact-checks.mjs` (12 routes + 2 mobile) | pass — `PASS: 12 route(s) behave and render like the baseline.` |
| `parity.cjs capture` + `compare` | pass — `PASS: build A and build B are equivalent.`, 462 files, 12 routes, 11 sitemap URLs, only the documented diffs (HTML bytes, minified CSS/JS, `sw.js`, generator meta, `/floor-0/` build date) |
| `/sitemap.xml` URL set | pass — 11 URLs, identical to the baseline list |
| `pnpm check:sw` | pass — 15 precached paths exist, 483 KiB installed, per-build cache name |
| `pnpm public:check` | pass — 448 public files mirrored byte-for-byte in `dist/` |
| `pnpm check:urls` | pass — 13 pages use root-absolute asset URLs only |
| `pnpm check:css` | pass — 10 stylesheets (113,372 B) match `src/styles`; only the `@font-face` fix and the documented dead-rule removals differ from the baseline |
| `pnpm check:js` | pass — 13 scripts are the minified build of `src/scripts` |
| `pnpm check:images` | pass — 127 local images carry dimensions; 36 documented exemptions |
| `pnpm check:links` | pass — 662 internal links resolve across 23 documents |
| `pnpm check:live` | pass — 12 routes, `main.css`, the three runtime scripts, `robots.txt`, `projects.json` and 11 sitemap URLs match `https://asarav.github.io`; `sw.js` reported, not compared (live 13 precached paths, build 15) |

### Live equivalence (`pnpm check:live`)

The parity capture above answers "is the build the same as the frozen Jekyll
baseline?". `scripts/check-live-parity.mjs` answers the other half — "is it the
same as what is deployed right now?" — by fetching `https://asarav.github.io`
and comparing it with `dist/`. It needs the network, so it is deliberately not
part of CI; run it after a build:

```bash
pnpm check:live                                              # https://asarav.github.io vs dist/
node scripts/check-live-parity.mjs --live https://staging.example.com --dist dist
```

| Compared | How, so the generator swap does not matter |
|---|---|
| 12 routes | `head` tags (comments, ` />` vs `>`, entity spelling, inline-JSON spacing, and the `generator` meta dropped), body text, and `<script src>` order. `/floor-0/` prints its build date, normalised on that route only. |
| `assets/css/main.css` | Declaration-level: media query + selector → property, compared against the expanded `src/styles` compile. That is the same basis `check:css` uses (which separately pins `dist/` to that compile), so minification is irrelevant; the Phase 6 dead-rule removals and the `@font-face` URL fix are allowed by name. |
| `site-motion.js`, `consumption.js`, `background-fractal.js` | The live file re-minified with the build's terser options must equal the shipped file byte-for-byte — which also proves the CRLF working copies carry no content drift. |
| `robots.txt`, `projects.json` | Byte-identical (CRLF tolerated). |
| `sitemap.xml` | Same `<loc>` set; `<lastmod>` is a build value and is ignored. |
| `sw.js` | Reported, never compared. The worker is generated here on purpose: the live site still precaches 13 paths under `asarav-shell-v2` with `cache.addAll`, while the new build precaches 15 paths under a per-build cache name with per-URL installs. `check:sw` and the offline service-worker checks in the harness cover the behaviour. |

Result on 2026-11-24 against the final 462-file, 537,562,822 B build (route
lines elided; it is the same sentence for all twelve):

```text
ok    /: head, body text and script order match
...   (all 12 routes, including /floor-0/ and /404.html)
ok    main.css: every selector, media query and declaration matches the live stylesheet
ok    assets/js/site-motion.js: live source re-minified with the build options matches the shipped file
ok    assets/js/consumption.js: live source re-minified with the build options matches the shipped file
ok    assets/js/background-fractal.js: live source re-minified with the build options matches the shipped file
ok    robots.txt: byte-identical to the live site
ok    projects.json: byte-identical to the live site
ok    sitemap.xml: same 11 URLs (lastmod ignored)
note  sw.js: generated on purpose — live precaches 13 paths, build precaches 15
PASS: the build serves the same content as the live site
```

The gate can go red: appending `<p>PROBE</p>` to `dist/about/index.html` and a
line to `dist/robots.txt` made it exit 1 with
`FAIL /about/: body text differs at character 14604: live "" vs build " PROBE"`
and `FAIL robots.txt: live and build bytes differ`; restoring both files returned
it to `PASS`.
