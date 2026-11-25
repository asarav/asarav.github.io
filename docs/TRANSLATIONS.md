# Translation / i18n Plan

## Current state

- Static Astro site built with pnpm and deployed to GitHub Pages from
  `.github/workflows/pages.yml`.
- No i18n infrastructure exists: no locale data, no translation files, and the
  copy is hard-coded English.
- Content lives in `src/data/*.yaml` (consumption, games, music, log, medium),
  `src/pages/*.astro` (page markup), and `src/components/` (nav, footer,
  consumption item, player).
- `src/layouts/Base.astro` emits the document shell and `<html lang>`, and
  `src/lib/site.ts` supplies the title/canonical/JSON-LD helpers.

## Goal

Support multiple languages (at minimum English + one other) without breaking the
existing build/deploy flow or the service-worker shell, while keeping URLs
predictable (e.g. `/es/consumption/`).

## Constraints

1. Routes are directory-style with a trailing slash
   (`trailingSlash: 'always'`, `build.format: 'directory'`), and `sw.js`
   precaches the shell by fixed path. Any locale prefix has to be a real
   directory of pages, not a client-side switch, or the offline shell and the
   cached CSS/JS names stop matching.
2. Asset URLs are root-absolute everywhere, so a locale route keeps working
   without a `<base>` tag.
3. Data files (`src/data/consumption.yaml` is huge) are a content effort, not a
   code change: translating them fully is far larger than wiring the UI.
4. Astro's built-in i18n routing (`i18n` in `astro.config.mjs`) is the natural
   mechanism; there is no Jekyll plugin or Ruby toolchain involved anymore.

## Recommended approach (phased)

### Phase 0 — Prerequisites (no code, low risk)

- Keep `<html lang="en">` in `src/layouts/Base.astro` accurate (accessibility +
  SEO baseline).
- Add a language switcher slot in `src/components/nav.astro`
  (disabled/English-only at first) so the UI place exists.
- Declare the supported locales in one place, e.g. `src/lib/i18n.ts`, and read
  them from there in the layout and the switcher.

### Phase 1 — Route scaffolding

- Configure `i18n` in `astro.config.mjs` (`defaultLocale: 'en'`,
  `locales: ['en', 'es']`, `routing: { prefixDefaultLocale: false }`) so English
  stays at the current URLs.
- Move the existing pages under the default locale without changing their
  published paths, then add the prefixed locale directory.
- Extend `.github/workflows/site-checks.yml` with the route set for each locale
  (the gates already walk `dist/`, so they pick the new pages up automatically).
- Verify the English site is byte-identical before adding any language.

### Phase 2 — UI strings

- Add `src/data/i18n/en.yml` and `src/data/i18n/es.yml` for nav labels, footer,
  button text, and explanations.
- Load them through `src/lib/site.ts` and pass them down; do not inline strings
  in components.
- Add `hreflang` alternates in `Base.astro` and keep the canonical URL
  self-referential per locale.

### Phase 3 — Translate content (largest effort)

- Translate static page copy in `src/pages/**/*.astro` (about, contact, projects
  intro, games, books, music, log).
- For `src/data` (consumption, games, music, log): either maintain parallel
  files per locale (`src/data/es/consumption.yaml`) or keep English-only and
  translate only titles/explanations incrementally.
- Decide whether the consumption ledger stays English-only (it is a personal
  record; the chrome around it can still be translated).

### Phase 4 — Polish

- Persist the chosen language (localStorage) and redirect on first visit with a
  small script, keeping the no-JS default English.
- Translate `<title>`/meta through the helpers in `src/lib/site.ts`.
- Style the switcher consistently with the nav hover/press states in
  `src/styles/main.scss`.

## Files that will need changes

| File | Change |
|---|---|
| `astro.config.mjs` | `i18n` block, locale list |
| `src/layouts/Base.astro` | `lang` attribute, hreflang, switcher slot |
| `src/components/nav.astro` | language switcher UI |
| `src/lib/i18n.ts` / `src/lib/site.ts` | locale helpers, string loading |
| `src/pages/**` | per-locale route directories |
| `src/data/i18n/*.yml` | new — UI strings |
| `src/styles/main.scss` | switcher styling |
| `.github/workflows/site-checks.yml` | per-locale route expectations |

## Open questions

- Which languages first? (Affects scope of Phase 3.)
- Should `src/data/consumption.yaml` be translated at all, or stay English-only
  with translated chrome?
- Do the locale routes need their own service-worker shell entries, or should the
  shell list only the shared CSS/JS (current behaviour) and let each page cache
  itself on first visit?

## Effort estimate

- Phases 1–2 (routing + string layer): small, ~1 day.
- Phase 3 (content): large, depends on number of languages and how much of
  `src/data` is translated.
- Recommended: start with UI chrome only (Phase 2) and English + Spanish, then
  decide on data translation.
