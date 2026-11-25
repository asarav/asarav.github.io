# Performance scoreboard

Measured on the Jekyll build (`_site`, Jekyll 4.4.1) before the Astro scaffold,
served by a local static server on `127.0.0.1:4173`. Lighthouse 12, headless
Chrome, one run per route and preset — directional, not statistical.

## Route metrics

| Route | Preset | Score | LCP | CLS | TBT | Transfer | Requests |
|---|---|---|---|---|---|---|---|
| `/` | mobile | 55 | 11,265 ms | 0.068 | 517 ms | 1,954 KB | 37 |
| `/` | desktop | 88 | 2,190 ms | 0.008 | 30 ms | 2,061 KB | 36 |
| `/projects/` | mobile | 46 | 13,286 ms | 0.000 | 754 ms | 100,455 KB | 74 |
| `/projects/` | desktop | 81 | 1,848 ms | 0.189 | 61 ms | 85,866 KB | 71 |
| `/consumption/` | mobile | 42 | 29,948 ms | 0.034 | 502 ms | 6,201 KB | 43 |
| `/consumption/` | desktop | 57 | 5,198 ms | 0.006 | 23 ms | 6,172 KB | 44 |

Raw reports and `summary.json`: `.shots/astro-parity/perf/` (gitignored).

## Build metrics

| Metric | Value | Note |
|---|---|---|
| `/consumption/` HTML | 4,805,332 B | 3,192 `<img>` rendered from a 1,374 KB `consumption.yaml` |
| `/projects/` HTML | 93,700 B | but ~84 MB of images/GIFs behind it |
| `main.css` | 65,634 B | unminified, one file for every route |
| Page stylesheets | 78,373 B total | one loaded per page, never all |
| JS | 331,517 B total | `site-motion.js` alone is 109 KB on every route |
| Images | 54 MB | 24 MB of it is 21 GIFs; largest 9 MB |
| `<img>` hygiene | 97 tags | 88 lazy, ~30 without width/height |
| Fonts | 5 families / 6 weights | single third-party CSS request |
| Build files | 462 | 538,429,324 B total, dominated by games/videos |

## Targets

| Change | Target | Status |
|---|---|---|
| `compressHTML` on `/consumption/` | ≤ 1 MB | **not met** — 4,246,842 B; see Phase 6 |
| Image dimensions on the ~30 tags lacking them | CLS 0 | **partly met** — games/books annotated, `/about/` and `/log/` exempt; see Phase 6 |
| CSS minification | `main.css` ≤ 50 KB | **not met** — 50,544 B (1.1 % over); a second csso pass reached 45,689 B but changed rendered pixels and was reverted; see Phase 6 |
| JS bundling | ≤ 150 KB on `/` | deferred (post-switch) |
| Consumption pagination | ≤ 300 KB | deferred (post-switch, needs sign-off) |
| GIF → video | −20 MB of image weight | deferred (post-switch) |

## Phase 2 measurements

Measured on this machine after `rm -rf dist && pnpm build`.

| Metric | Baseline (Jekyll) | Astro Phase 2 | Delta |
|---|---|---|---|
| `/` HTML | 28,371 B | 22,178 B | −6,193 B (−21.8 %), entirely `compressHTML` + collapsed head whitespace |
| `main.css` | 65,634 B | 65,639 B | +5 B: the corrected `@font-face` URL (`../fonts/…` → `/assets/fonts/…`) |
| Page sheets (9) | 78,373 B | 78,373 B | byte-identical |
| `dist/` | 462 files, 538,429,324 B, 12 routes | 449 files, 510 MB, 1 route + `/sw.js` + 2 sitemap files | fewer pages, same image/game payload |
| Build wall time | not timed in Phase 0 | 3.6 s (CSS 1.1 s + Astro 1.5 s) | — |
| SW shell | 5 fixed paths | 6 (`/` + 5), per-build cache name | +1 path |
| Offline `/` | — | renders from cache: 7 tiles, body background `rgb(7, 11, 16)` | pass |

The 21.8 % HTML cut is the only rendering-affecting change so far, and it is
whitespace only: head/text/script parity for `/` is green. It is the local proof
of the `compressHTML` target for `/consumption/` (the 4.8 MB page) in Phase 6,
which is still unstarted. Minification and image work remain untouched, so the
`main.css ≤ 50 KB` and CLS targets are unchanged.

## Phase 3 measurements

All twelve routes are rendered by Astro now, so every HTML page can be compared
with its Jekyll baseline. Measured after `rm -rf dist && pnpm build`.

| Route | Jekyll | Astro | Δ |
|---|---|---|---|
| `/` | 28,371 B | 22,180 B | −21.8 % |
| `/about/` | 60,557 B | 51,038 B | −15.7 % |
| `/projects/` | 93,821 B | 81,603 B | −13.0 % |
| `/consumption/` | 4,805,332 B | 4,246,842 B | −11.6 % |
| `/books/` | 36,564 B | 28,510 B | −22.0 % |
| `/games/` | 32,849 B | 24,535 B | −25.3 % |
| `/log/` | 52,278 B | 36,579 B | −30.0 % |
| `/music/` | 73,157 B | 58,106 B | −20.6 % |
| `/contact/` | 28,150 B | 21,873 B | −22.3 % |
| `/floor-0/` | 24,638 B | 19,265 B | −21.8 % |
| `/hidden/` | 22,779 B | 17,643 B | −22.5 % |
| `/404.html` | 23,093 B | 17,792 B | −23.0 % |
| **HTML total** | **5,281,589 B** | **4,625,966 B** | **−12.4 %** |

| Metric | Baseline | Astro Phase 3 |
|---|---|---|
| `dist/` files | 462 | 461 |
| `dist/` bytes | 538,429,324 | 515 MB (same image/game/video payload) |
| Build wall time | not timed | 5.2 s (CSS 1.1 s + Astro 2.2 s + bundling) |
| Sitemap | `sitemap.xml`, 11 URLs | `sitemap.xml`, 11 URLs, byte-identical apart from `<lastmod>` |
| CSS | 65,634 B + 78,373 B of sheets | 65,639 B + 78,373 B, sheets byte-identical |
| SW precache | 5 fixed paths | 15 paths, 556 KiB installed (consumption opted out at 4.2 MB) |

The gain is whitespace, not content: head, body text and script order are
green on all twelve routes. `/consumption/` still ships 4.2 MB of markup and
`/projects/` still transfers ~85 MB of imagery, so the Phase 6 targets
(pagination, image dimensions, CSS/JS minification) remain the real work.

Every change is measured against this table and reverted if a route regresses on
Lighthouse mobile. The two heaviest findings are recorded here so they are not
lost: `/consumption/` ships 4.8 MB of HTML on every visit, and `/projects/`
transfers roughly 85–100 MB of imagery.

## Phase 3 verification — Lighthouse and bytes on the final build

Same protocol as the baseline: Lighthouse 12, headless Chrome 157, one run per
route and preset, served from a plain local static server on `127.0.0.1:4174`
with no compression in either build. Every preset was then run a second time,
because the first pass moved enough to be worth checking.

| Route | Preset | Baseline score | Astro run 1 | Astro run 2 | LCP (base) | LCP (runs 1 / 2) | CLS (base / runs) | TBT (base / runs) |
|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 55 | 42 | 52, 55 | 11,265 ms | 11,339 / 11,337, 11,339 | 0.068 / 0.069 | 517 / 1,614, 584, 755 |
| `/` | desktop | 88 | 82 | 84 | 2,190 ms | 2,670 / 2,698 | 0.008 / 0.009 | 30 / 137, 25 |
| `/projects/` | mobile | 46 | 41 | 57 | 13,286 ms | 13,885 / 12,382 | 0.000 / 0.000, 0.010 | 754 / 1,046, 540 |
| `/projects/` | desktop | 81 | 70 | 80 | 1,848 ms | 1,827 / 1,826 | 0.189 / 0.287, 0.210 | 61 / 179, 53 |
| `/consumption/` | mobile | 42 | 30 | 48 | 29,948 ms | 28,779 / 27,356 | 0.034 / 0.050, 0.034 | 502 / 1,365, 323 |
| `/consumption/` | desktop | 57 | 56 | 59 | 5,198 ms | 5,018 / 4,512 | 0.006 / 0.011, 0.006 | 23 / 138, 28 |

What this does and does not say:

- **HTML weight is the real, deterministic win.** The twelve routes total
  4,625,966 B against 5,281,589 B, −655,623 B (−12.4 %), with `/consumption/`
  down 558,490 B (−11.6 %) and no route larger than its baseline.
- **Lighthouse cannot resolve the rest at one run per preset.** The `/` mobile
  runs range from 42 to 55 points and 584–1,614 ms of TBT on identical code;
  `/projects/` mobile ranges 41–57 and `/consumption/` mobile 30–48. The
  baseline's own 55 / 46 / 42 sit inside those ranges, so the score deltas are
  within measurement noise, not a regression signal.
- **Nothing in the port can add main-thread work.** Every JS file is
  byte-identical to the Jekyll build (`pnpm public:check` hashes 447 files), the
  nine page stylesheets are byte-identical, and `main.css` differs by five bytes
  in one `@font-face` URL. TBT and CLS swings are the harness machine, not code.
- **Per-route transfer bytes vary by the hero image.** `/` moved from 1,954 KB to
  2,232–2,262 KB while its HTML shrank by 6 KB: the hero scene picks one of
  several photographs (`Math.random` is not seeded in Lighthouse), so route-level
  byte totals are not comparable run to run. `/consumption/`, which has no hero
  image, moved 6,201 → 5,790 KB, matching its HTML cut.

Build facts for the final tree: 461 files, 537,769,892 B (`dist/`), 12 HTML
routes, `main.css` 65,639 B (+5 B), page sheets 78,373 B (unchanged), 11 sitemap
URLs. Raw reports: `.shots/astro-visual/perf/` (gitignored).

The Phase 6 targets above are untouched by this pass: `/consumption/` still
ships 4.2 MB of markup, the ~30 `<img>` tags still lack dimensions, and CSS/JS
are still unminified. This verification only proves the port did not regress
what the baseline measured.

## Phase 6 measurements — minification, image dimensions, markup target

Measured after `pnpm build`
on the same machine, same protocol as the earlier phases. Assets are now built by
`scripts/build-assets.mjs`: Dart Sass → lightningcss for stylesheets, terser for
scripts, and a generated width/height map for local images.

### What changed in bytes

| Metric | Jekyll baseline | Astro after Phase 6 | Delta |
|---|---|---|---|
| `main.css` | 65,634 B | **50,544 B** | −15,090 B (−23.0 %) |
| Page sheets (9) | 78,373 B | **62,828 B** | −15,545 B (−19.8 %) |
| JS (13 files) | 331,517 B | **150,864 B** | −180,653 B (−54.5 %) |
| `site-motion.js` alone | 112,485 B | **55,051 B** | −51.4 % |
| `/consumption/` HTML | 4,805,332 B | **4,246,842 B** | −558,490 B (−11.6 %) |
| HTML, 12 routes | 5,281,589 B | **4,626,587 B** | −655,002 B (−12.4 %) |
| `<img>` tags with width+height | 67 of 97 | **127 of 127 local** | 36 tags exempt, see below |
| `dist/` | 462 files, 538,429,324 B | **462 files, 537,562,822 B** | −866,502 B |

### The three Phase 6 targets, honestly

**`/consumption/` ≤ 1 MB: not met, and not reachable under the parity contract.**
The page ships 4,246,842 B. Its rendered *body text alone* is 1,912,551 B, and
every character of it must appear twice — once in the desktop list, once in the
mobile list — because `parity.cjs` compares the static HTML text of each route
character for character against the frozen build. Regenerating the second list in
JavaScript or splitting the ledger across pages would change those characters,
i.e. break the gate the port is judged by. The only honest lever left is
consumption pagination, which the plan defers ("≤ 300 KB, needs sign-off"), so it
stays deferred rather than being invented here. `compressHTML` is doing its job
elsewhere: the same page was 4,805,332 B in Jekyll and every other route shrank
12–30 %.

**`main.css` ≤ 50 KB: not met by 544 B (1.1 %); the attempt to close it was
reverted, and this is the measurement that blocked it.**

Minification alone takes 65,634 B to 51,436 B. Phase 6 then deleted the rules
that nothing could ever match: `.archive-intro`/`.archive-lede` (no archive page
exists), `.scene-timelapse-progress` (site-motion.js only creates
`.scene-timelapse` and `.scene-timelapse--hero`), and four custom properties no
stylesheet or script reads (`--ink-soft`, `--surface-raised`, `--surface-glass`,
`--elev-3`) — 892 B, leaving 50,544 B. Everything still in the file is used: a
selector audit finds no dead rule (the `background-fractal__canvas`,
`weather-bg--*` and `--hero` classes that look absent from the HTML are assembled
at runtime, as `CLASS + '__canvas'` and `'weather-bg--' + type`), no custom
property is unread (29 definitions, 29 read), every `@keyframes` is referenced,
and the only duplicate rule left is 36 B.

**The 45,689 B attempt, and why it is not shipped.** A second pass with `csso`
(`restructure:false`) after lightningcss reached **45,689 B** for `main.css` and
56,204 B for the page sheets (101,893 B shipped). It was reverted because it does
not only rewrite values:

- it **merges 49 rule blocks**, folding declarations out of their original media
queries — e.g. `@media only screen and (width<=1199px)` blocks disappear into
another query — which changes which media those declarations apply to;
- it rewrites gradient stop positions (`0%` → `0`), so the computed
`background-image` string changes: `… rgba(6, 10, 15, 0.64) 0% …` becomes
`… 0px …`.
- on the 12-route interaction/visual harness that produced **22 differences**:
the `hero.backgroundImage` mismatch above on `/`, and screenshot diffs on
`/music/` bottom (0.007 % exact, 0.021 % blurred) and `/contact/` top, mid and
bottom (0.014 % exact, 0.042 % blurred). The harness log is kept at
`.shots/astro-visual/harness-csso-failure.log`.

Zero-regression outranks the 544 B, so the tree is back on the lightningcss-only
build — 50,544 B, every gate green, harness identical.

The remaining non-structural levers were measured and cannot close 544 B without
breaking a gate: lightningcss with modern targets produces a *larger* file
(50,595 B with Chrome 120, 50,846 B with Chrome/Edge/Firefox 120 + Safari 16);
feeding Dart Sass's own `compressed` output to lightningcss gives 50,487 B; the
four shadowed declarations in the source are worth ~110 B minified; there are no
unused custom properties, no unused keyframes and no dead selectors to remove.
That puts the best lawful result at ~50,300 B, still over the line, so the target
stays recorded as missed rather than met by changing what the page renders.

**Image dimensions: 36 of the ~30 originally-missing tags annotated, 36
deliberately left alone.**
`scripts/build-assets.mjs` reads every local PNG/JPEG/GIF/WebP/SVG and writes
`src/generated/image-sizes.json`; `/games/` (18 screenshots) and `/books/` (cover
plus article thumbnails) now render intrinsic `width`/`height` from it, and
`scripts/check-image-sizes.mjs` fails if a local image ships without them or with
a distorted ratio.

`/about/` (25 tags) and `/log/` (11 tags) are exempt on purpose. Declaring the box
for those photographs changes how Chrome rasterises them: the interaction/visual
harness then measures 0.18–0.52 % of pixels differing from the frozen build on
`/about/` (thin full-width bands, sub-1 % colour deltas — the same image decoded
at the reserved size) and a 12 px shift of a link on `/log/`. The harness was
bisected: with the attributes on all 25 about images 0.516 %, on the first 13
0.184 %, on the last 12 0.703 %, on none 0.000 %. Both pages already fix the
rendered width in CSS (`width: 100%; height: auto`), so there is no box to
reserve and the CLS risk is the image load itself, not a layout change. Pixel
parity is the contract, so the attributes were reverted there and the exemption
is written into the image gate with its reason rather than hidden.

### Lighthouse and transfer bytes on the final build

Same protocol as the earlier phases: Lighthouse 12, headless Chrome 157, one run
per route and preset, served from `.shots/serve.mjs` on `127.0.0.1:4174` with no
compression. One run per preset, so treat the scores as directional — the Phase 3
section already documents 10–15 point swings between identical runs. Transfer is
Lighthouse's `total-byte-weight`.

| Route | Preset | Score (baseline → now) | LCP | CLS | TBT | Transfer |
|---|---|---|---|---|---|---|
| `/` | mobile | 55 → **51** | 11,265 → 10,363 ms | 0.068 → 0.069 | 517 → 701 ms | 1,954 → 2,044 KB |
| `/` | desktop | 88 → **86** | 2,190 → 2,496 ms | 0.008 → 0.008 | 30 → 0 ms | 2,061 → 2,350 KB |
| `/projects/` | mobile | 46 → **40** | 13,286 → 11,934 ms | 0.000 → 0.000 | 754 → 1,457 ms | 100,455 → 25,486 KB |
| `/projects/` | desktop | 81 → **81** | 1,848 → 2,047 ms | 0.189 → 0.179 | 61 → 47 ms | 85,866 → 27,523 KB |
| `/consumption/` | mobile | 42 → **33** | 29,948 → 28,246 ms | 0.034 → 0.050 | 502 → 961 ms | 6,201 → 5,467 KB |
| `/consumption/` | desktop | 57 → **56** | 5,198 → 4,696 ms | 0.006 → 0.005 | 23 → 150 ms | 6,172 → 5,440 KB |

How to read this:

- **The bytes that are under our control all went down.** `/consumption/` moves
  6,201 → 5,467 KB mobile (HTML −558 KB, stylesheet −22 KB), and `/` and
  `/projects/` differ mostly by which hero photograph and how many lazy GIFs
  happened to be requested before the measurement stopped: the `<img>` payload is
  byte-identical (`public:check` hashes all 448 public files), so a 4× transfer
  difference on `/projects/` is lazy-load timing, not a payload change.
- **Scores moved inside the noise band this harness has already shown** (42–55 on
  `/` mobile, 41–57 on `/projects/` mobile, 30–48 on `/consumption/` mobile for
  the same code in Phase 3). The single-run `/consumption/` mobile TBT 502 → 961 ms
  was re-measured with ten alternating runs per side; see the next section.
- **CLS did not move to 0.** `/` stays at 0.069 and `/projects/` desktop at 0.179
  (both dominated by lazy imagery), and `/consumption/` mobile moved 0.034 → 0.050
  — inside the 0.034–0.050 band Phase 3 already measured across repeats. The
  width/height work on games and books has no measurable effect on these three
  routes because none of them is one of those pages; the exempt `/about/` and
  `/log/` tags are where CLS would have moved, and they were left alone to keep
  pixel parity (see above).

Raw reports and `summary.json`: `.shots/astro-visual/perf/` (gitignored).

## `/consumption/` mobile TBT — the ten-run answer

The single-run capture above measured TBT 502 ms on the Jekyll build and 961 ms
on the Astro build, which left the direction unexplained. Re-measured with the
same Lighthouse version and flags as Phase 0, both builds served by
`.shots/serve.mjs` (4184 baseline, 4174 Astro) with no compression, alternating
baseline → Astro inside every pair so machine drift hits both sides, ten runs per
side, same page and viewport (`.shots/tbt-compare.mjs`).

| Side (scripts as shipped) | TBT median | TBT range | LCP median | Main-thread work | Script evaluation |
|---|---|---|---|---|---|
| Jekyll baseline | **1,333 ms** | 862–1,885 | 32,327 ms | 14,696 ms | 4,577 ms |
| Astro, minified JS | **1,699 ms** | 721–2,169 | 28,224 ms | 13,096 ms | 4,772 ms |
| Astro, JS unminified (A/B) | **1,417 ms** | 1,133–1,891 | 29,376 ms | 13,044 ms | 5,033 ms |

What the numbers say:

- **The ranges overlap completely** (baseline 862–1,885 ms, Astro 721–2,169 ms),
  and the baseline alone spans 2.2× across ten runs of byte-identical code. The
  original 502 ms and 961 ms were two draws from distributions this wide.
- **Astro does less total work, not more.** Main-thread time is 14,696 → 13,096 ms
  (−10.9 %) and LCP lands 4.1 s earlier (32,327 → 28,224 ms); script evaluation
  differs by 4 % (4,577 → 4,772 ms). A workload regression would show the
  opposite sign on main-thread time.
- **Minification is not the driver.** The A/B replaced the thirteen shipped
  scripts in `dist/assets/js` with their unminified sources — the exact bytes the
  Jekyll build served — leaving HTML and CSS untouched: TBT median moved 1,699 →
  1,417 ms, back inside the baseline range. Terser's output is therefore not
  adding blocking time.
- **The long tasks are the same scripts on both sides.** Lighthouse attributes the
  biggest blocking chunks to `footer-fractal.js` (678–1,234 ms tasks on either
  build), the `/consumption/` inline script and `consumption.js` (600–1,070 ms).
  No port-owned script appears on one side only, and no script regressed when the
  per-script `bootup-time` medians are compared (`brand-mark.js` ≈ 6.7 s both,
  `consumption.js` 561 → 318 ms, inline page script 2,947 → 2,637 ms,
  `site-motion.js` 453 → 471 ms). Astro finishes loading ~4 s earlier, so more of
  the fixed canvas paint work falls inside Lighthouse's trace window — a
  window-relative effect, not added work.

**Verdict: not a reproducible regression, and not attributable to a change this
port introduced, so nothing is reverted.** The Phase 6 single-run figures stay in
the table above as captured; this section is their controlled re-measure, with
the raw reports in `.shots/astro-visual/tbt/` (`summary-minified.json` for the ten
shipped runs, `summary-unminified.json` for the A/B).

These runs were captured while the stylesheet briefly carried the 45,689 B csso
experiment that was later reverted (see the CSS target above). The shipped
stylesheet is 4,855 B larger — 0.09 % of the 5.4 MB page — so the TBT comparison
is unaffected by that difference, and the conclusion does not depend on which of
the two CSS builds was served.
