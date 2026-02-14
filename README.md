# Avinash Saravanan's Personal Website

A Jekyll-based personal portfolio website showcasing projects, games, music, books, and media consumption.

## Prerequisites

- **Ruby** 2.7+ (required for Jekyll)
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
├── _data/                   # YAML data files (games, music, consumption log)
├── _includes/               # HTML partials (nav, footer)
├── _layouts/                # Page layouts
├── assets/css/              # SCSS stylesheets (compiled to CSS)
├── src/                      # Source assets and content
│   ├── assets/              # External service icons/logos
│   ├── games/               # Game builds
│   ├── html/                # Page HTML files
│   ├── images/              # Project images and backgrounds
│   ├── projects/            # Project files
│   ├── scripts/             # JavaScript files
│   └── videos/              # Project videos
└── _site/                   # Build output (git-ignored)
```

## Key Technologies

- **Jekyll** 3.9.5 - Static site generator
- **Bootstrap** 4.0.0 - Responsive CSS framework
- **SCSS** - CSS preprocessing
- **Vanilla JavaScript** - ES6+ for interactivity (no jQuery)

## Recent Updates (2026)

### JavaScript Modernization
- ✅ Removed jQuery dependency from core functionality
- ✅ Converted jQuery selectors to vanilla JavaScript DOM APIs
- ✅ Converted scroll handlers to vanilla JavaScript (scrollIntoView)
- ✅ Updated tooltip initialization to vanilla JS (Bootstrap 4 API)
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