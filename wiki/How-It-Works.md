# How It Works

## Overview

Uncage clones websites by launching a real browser (Chromium via Playwright), loading each page, intercepting every network request, and saving the results as static files. The output is a self-contained folder that can be opened directly in a browser or deployed to any static host.

## Pipeline

The cloning process runs in this order:

### 1. Browser Launch

A headless Chromium browser starts up using Playwright with stealth plugins. The stealth plugins prevent the browser from being detected as automated, which avoids getting blocked by anti-bot systems.

### 2. Page Crawling

The crawler visits the seed URL first. It then discovers links on that page and adds them to a queue. Each link is visited in turn, up to the configured depth and page limits.

Before crawling, the tool checks `robots.txt` (unless told to ignore it) to respect the site's crawling rules. If a sitemap is available, it uses that to discover pages as well.

### 3. Network Interception

While each page loads, every network request is intercepted. The tool looks at each response and sorts it by content type:

- **HTML** is saved as page files.
- **CSS** goes to `assets/css/`.
- **JavaScript** goes to `assets/js/`.
- **Images** go to `assets/images/`.
- **Fonts** go to `assets/fonts/`.
- **Other files** (video, WASM, JSON) go to their respective folders under `assets/`.

### 4. URL Rewriting

All URLs in the saved HTML and CSS files are rewritten to point to local paths instead of remote servers. For example, `https://cdn.example.com/style.css` becomes `assets/css/style-abc123.css`.

This step also handles:
- Relative URLs
- CSS `url()` references
- Inline styles
- srcset attributes on images

### 5. JavaScript Dependency Resolution

Modern websites use JavaScript modules that import other modules. The tool scans each downloaded JS file for `import` statements and dynamically imported modules, then downloads those dependencies too. This continues recursively until all dependencies are resolved.

### 6. Static HTML Compilation

Each crawled page's HTML is processed:
- Duplicate meta tags and title tags are removed.
- Analytics and tracking scripts are stripped (unless `--keep-analytics` is set).
- Internal links between pages are rewritten to point to the correct local HTML files.

### 7. CSS Purging (Optional)

PurgeCSS runs over the CSS files and removes any classes that are not used in the HTML. This reduces file size. This step can be skipped with `--no-purge` if it removes classes that are added dynamically by JavaScript.

### 8. Asset Consolidation

During crawling, assets are saved under `public/assets/`. In this final step, they are moved to the root `assets/` directory for a cleaner structure.

### 9. Project Scaffolding

The tool generates:
- A `package.json` with a `preview` script.
- A `README.md` with basic instructions.
- An `asset-map.json` that maps original URLs to local file paths.

## Output Structure

```
output/example.com/
  index.html
  about.html
  contact.html
  assets/
    css/
    js/
    images/
    fonts/
    media/
    wasm/
    data/
  asset-map.json
  package.json
  README.md
```
