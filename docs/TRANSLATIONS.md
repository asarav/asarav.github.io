# Translation / i18n Plan

## Current state

- Static Jekyll site (3.10.0) deployed to GitHub Pages via the default `github-pages` gem build.
- No i18n infrastructure exists: no `lang` attributes, no locale data, no translation files.
- Content lives in `_data/*.yaml` (consumption, games, music, books), `pages/*.html` (page markup), and `_includes/` (nav, footer).
- Copy is hard-coded English in templates and data files.

## Goal

Support multiple languages (at minimum English + one other) without breaking the existing build/deploy flow, while keeping URLs predictable (e.g. `/es/consumption/`).

## Constraints

1. GitHub Pages' default build only allows a whitelisted set of plugins. `jekyll-polyglot` is **not** in that whitelist, so it cannot be used with the default Pages builder.
2. To use polyglot (or any non-whitelisted plugin) we must switch to a **GitHub Actions workflow** that builds Jekyll and deploys the `_site` artifact to Pages (supported since 2022).
3. Data files (`_data/consumption.yaml` is ~18k lines) are huge; translating them fully is a large content effort, not just a code change.

## Recommended approach (phased)

### Phase 0 — Prerequisites (no code, low risk)

- Add `lang="en"` to `<html>` in `_layouts/default.html` (accessibility + SEO baseline).
- Add a language switcher placeholder in `_includes/nav.html` (disabled/English-only for now) so the UI slot exists.
- Document supported locales in `_config.yml` (e.g. `locales: [en, es]`).

### Phase 1 — Enable custom builds (unblocks plugins)

- Add `.github/workflows/pages.yml` using `actions/jekyll-build-pages` (or `bundle exec jekyll build`) + `actions/deploy-pages`.
- Switch Pages source from "Deploy from a branch" to "GitHub Actions".
- Keep `github-pages` gem for local dev, but allow `jekyll-polyglot` in CI via a separate `Gemfile.ci` or by adding the gem and running `bundle exec jekyll build` in the workflow.
- Verify the existing site builds identically before adding languages.

### Phase 2 — Introduce jekyll-polyglot

- Add `jekyll-polyglot` to a CI-only Gemfile.
- Configure in `_config.yml`:
  ```yaml
  languages: ["en", "es"]
  default_lang: "en"
  exclude_from_localization: ["assets", "src/images", "src/games"]
  url: https://asarav.github.io
  ```
- Move page files under language-aware paths or use `permalink: /:lang/...`.
- Use polyglot's `{% I18n for lang in site.languages %}` / `{{ site.data.i18n[page.lang][key] }}` for UI strings.
- Add `_data/i18n/en.yml` and `_data/i18n/es.yml` for nav labels, footer, button text, etc.

### Phase 3 — Translate content (largest effort)

- Translate static page copy in `pages/*.html` (about, contact, projects intro, games, books, music, log).
- For `_data` (consumption, games, music, books): either maintain parallel files per locale (`_data/es/consumption.yaml`) or keep English-only and translate only titles/explanations incrementally.
- Add `hreflang` alternates in `<head>`.

### Phase 4 — Polish

- Persist chosen language (localStorage) and redirect on first visit via a small script in `_layouts/default.html`.
- Translate `<title>`/meta via `jekyll-seo-tag` locale support.
- Add language switcher styling consistent with nav hover/press states.

## Files that will need changes

| File | Change |
|---|---|
| `_layouts/default.html` | `lang` attribute, hreflang, language switcher include |
| `_includes/nav.html` | language switcher UI |
| `_config.yml` | languages, polyglot config, plugins |
| `Gemfile` / new `Gemfile.ci` | polyglot gem (CI only) |
| `.github/workflows/pages.yml` | new — custom build + deploy |
| `pages/*.html` | wrap copy in i18n keys or create per-locale copies |
| `_data/i18n/*.yml` | new — UI strings |
| `assets/css/main.scss` | switcher styling |

## Open questions

- Which languages first? (Affects scope of Phase 3.)
- Should `_data/consumption.yaml` (18k lines) be translated at all, or stay English-only with translated chrome?
- Keep default Pages build (English only, no plugins) vs. migrate to Actions (required for any i18n plugin)?

## Effort estimate

- Phase 1–2 (infra + plugin wiring): small, ~1 day.
- Phase 3 (content): large, depends on number of languages and how much of `_data` is translated.
- Recommended: start with UI chrome only (Phase 2) and English + Spanish, then decide on data translation.
