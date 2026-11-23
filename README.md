# Avinash Saravanan's Personal Website

A Jekyll-based personal portfolio website showcasing projects, games, music, books, and media consumption.

## Prerequisites

- **Ruby** 3.2+ (required by the current locked dependencies)
- **Bundler** (Ruby dependency manager)

## Installation

### 1. Install Ruby
Download from [ruby-lang.org](https://www.ruby-lang.org/) or use a version manager (rbenv, RVM).

### 2. Install Bundler
```bash
gem install bundler
```

### 3. Install Dependencies
```bash
bundle install
```

## Running the Server

### Development Mode (basic)
```bash
bundle exec jekyll serve
```
Builds the site and serves at `http://localhost:4000`

### Development Mode (with live reload)
```bash
bundle exec jekyll serve --livereload
```
Automatically reloads the page when you save changes.

### Update Dependencies
```bash
bundle update
```
Updates all gems to their latest compatible versions.

## Project Structure

```
.
├── _config.yml              # Jekyll configuration
├── _data/                   # YAML data used by page templates
├── _includes/               # Shared HTML partials and inline UI icon sprite
├── _layouts/                # Shared page layouts
├── _sass/                   # Shared Sass variables and partials
├── assets/
│   ├── css/
│   │   ├── main.scss        # Global styles; emitted as main.css
│   │   ├── pages/           # Page-specific SCSS
│   │   └── unity-theme.css  # Theme used inside the standalone Unity builds
│   ├── games/               # Standalone Unity game builds
│   ├── icons/
│   │   └── tech-sprite.svg  # Monochrome brand icons for the About stack
│   ├── images/              # Site, project, and game images
│   ├── js/                  # Site and page JavaScript
│   ├── music/               # Audio files
│   ├── projects/            # Downloadable/model project files and demos
│   └── videos/              # Video files
├── index.html               # Home page
├── pages/                   # Content templates with explicit permalinks
├── llms.txt                 # Curated agent-readable site summary
├── llms-full.txt            # Long-form agent-readable site reference
├── projects.json            # Machine-readable index of all project records
└── _site/                   # Generated site output (git-ignored)
```

Page templates are grouped under `pages/`; their explicit permalinks keep the
published routes independent of their source location. Static media and
standalone builds are grouped by type under `assets/`, alongside the site's
styles, icons, and scripts. Jekyll publishes this tree under `/assets/`.

## Build notes

The `Gemfile` carries Jekyll 4 and the two plugins the site loads
(`jekyll-seo-tag`, `jekyll-sitemap`). It is the file CI and
`.github/workflows/pages.yml` both build from, so a local build, the checks, and
the deployed site come from one toolchain. GitHub Pages no longer builds the
branch with its own gem set; publish from **Settings → Pages → Source: GitHub
Actions** for the workflow to take effect.

The old `github-pages` pin to `232` existed because `233` needs a native
`openssl` build that does not install on Windows. Jekyll 4 ships
`sass-embedded`, which has Windows binaries, so that constraint is gone,
along with the plugin set and `rubyzip` that came in with it.
`sass.sourcemap: never` in `_config.yml` keeps stylesheet source maps out of
the published site.

If a build fails with `Permission denied` under `_site/assets/videos/`, stop any
running Jekyll server, remove `_site`, and rebuild.

## Key Technologies

- **Jekyll** 4.4 - Static site generator, built and deployed by GitHub Actions
- **Bootstrap** 5.3.8 - Responsive CSS framework
- **p5.js** 1.11.13 and **ml5.js** 0.12.2 - Legacy interactive machine-learning demos
- **SCSS** - CSS preprocessing
- **Vanilla JavaScript** - ES6+ for interactivity (no jQuery)

## Recent Updates (2026)

### Bootstrap 5 Upgrade
- ✅ Upgraded from Bootstrap 4.0.0 to Bootstrap 5.3.8 (CDN)
- ✅ Replaced data-toggle/data-target with data-bs-toggle/data-bs-target in nav and footer
- ✅ Replaced ml-auto with ms-auto (Bootstrap 5 margin utilities)
- ✅ Updated tooltip initialization to Bootstrap 5 API (footer.js)
- ✅ Replaced deprecated .jumbotron with .page-top across HTML and SCSS (Bootstrap 5 removed jumbotron)

### JavaScript Modernization
- ✅ Removed jQuery dependency from core functionality
- ✅ Converted jQuery selectors to vanilla JavaScript DOM APIs
- ✅ Converted scroll handlers to vanilla JavaScript (scrollIntoView)
- ✅ Updated tooltip initialization to vanilla JS (Bootstrap 5 API)
- ✅ Removed unused helper functions

### HTML Improvements
- ✅ Removed duplicate footer HTML markup
- ✅ Fixed duplicate navigation element IDs
- ✅ Added alt text to all footer social media icons
- ✅ Updated copyright year to dynamic

### Code Quality
- ✅ Converted all absolute image URLs to relative paths
- ✅ Added clarifying comments to SCSS files
- ✅ Simplified responsive design patterns
- ✅ Enhanced `.gitignore` to exclude IDE files and build caches

## Tips & Tools

### Image Optimization
For resizing and optimizing images for web:
- [WebResizer](http://webresizer.com/resizer/)
- [TinyPNG](https://tinypng.com/)

### Free Image Resources
- [Pixabay](https://pixabay.com/)
- [Pexels](https://www.pexels.com/)
- [Unsplash](https://unsplash.com/)

## Build & Deployment

### Local Build
```bash
bundle exec jekyll build
```
Generates the static site in `_site/` directory.

### GitHub Pages
The site is automatically deployed to GitHub Pages when pushed to the main branch.

**Note:** The repository must remain public for free GitHub Pages hosting.

## Troubleshooting

**Port already in use (4000)?**
```bash
bundle exec jekyll serve --port 4001
```

**Cache issues?**
```bash
bundle exec jekyll clean
bundle exec jekyll serve
```

**Dependency conflicts?**
```bash
bundle install
```

## License

This website and its content are the property of Avinash Saravanan.

## Contact

For inquiries, see [Contact Page](https://asarav.github.io/contact/)