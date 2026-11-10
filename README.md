<p align="center">
  <img src="./media/logo.svg" alt="Uncage logo" width="120" height="120" />
</p>

# Uncage

<p align="center">
  <a href="https://www.npmjs.com/package/@nightteye/uncage"><img src="https://img.shields.io/npm/v/@nightteye/uncage.svg?style=flat&color=red" alt="npm version"></a>
  <a href="https://github.com/Nightteye/uncage/stargazers"><img src="https://img.shields.io/github/stars/Nightteye/uncage?style=flat&color=yellow" alt="GitHub Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.13.0-green.svg" alt="Node.js"></a>
</p>

Uncage is a local website cloner that captures rendered websites (Framer, Webflow, React SPAs, and static sites) into standalone, portable HTML, CSS, and JavaScript bundles. It runs 100% on your machine with zero cloud dependencies, complete with a multi-instance browser UI and a scriptable CLI.

> [!IMPORTANT]
> ### Static HTML Pivot
> Uncage exclusively outputs clean, standalone Static HTML, CSS, and JavaScript. The experimental React TSX/JSX cloner is paused indefinitely. Read the [pivot announcement](docs/ANNOUNCEMENT.md) for full context.

> [!WARNING]
> Only clone sites you own or have permission to capture. Uncage executes target-site JavaScript in a local Playwright browser; exports may still require manual review for complex dynamic application behavior.

---

## Quick Start

Requires Node.js 22.13 or newer. Install Chromium once with `npx playwright install chromium` before your first clone.

Run Uncage immediately anywhere using `npx`:

```bash
# Launch the Web UI at http://localhost:8787
npx @nightteye/uncage

# Or clone directly via CLI
npx @nightteye/uncage https://example.com
```

---

## Key Features

- **Full Browser-Grade Capture**: Uses Playwright with stealth plugins to execute client-side JavaScript, hydration, and animations before capture.
- **Local Web UI (`localhost:8787`)**: Real-time browser dashboard featuring a responsive 2x2 multi-instance grid with independent live logs.
- **Concurrent Queue**: Export up to 3 websites simultaneously with automatic worker concurrency throttling.
- **One-Click `.ZIP` Streaming**: Download your complete cloned site as a clean, ready-to-deploy `.zip` archive on the fly.
- **Automated Preview Servers**: Cloned instances automatically launch local preview servers on ports in the `7000` series (`http://127.0.0.1:7000`, `7001`...).
- **Persistent Sessions**: Instances survive browser refreshes and tab switches without losing state.
- **Polite Crawl Discovery**: Respects `robots.txt` and `Crawl-delay` by default, discovers sitemap pages, and supports depth and priority limits.
- **Export Quality Report**: Each export includes `export-report.json`; the Web UI also shows page, asset, missing-reference, and external-resource counts.
- **Safe CSS Defaults**: CSS is minified, but selectors are preserved unless you opt in to `--purge-css`.
- **Plugin Hooks**: Customize page capture, asset handling, HTML rewriting, and final output from `uncage.config.ts`.

---

## Installation

### Option 1: Global CLI (Recommended)

```bash
npm install -g @nightteye/uncage

# Run anywhere
uncage https://example.com
```

### Option 2: From Source

```bash
git clone https://github.com/Nightteye/uncage.git
cd uncage
npm install
npx playwright install chromium

# Launch the Web UI
npm start
```

---

## Plugins & Config

Uncage loads an optional `uncage.config.ts` from the folder where you run it. The same hooks work for direct CLI exports and Web UI jobs. See the [plugin guide](docs/PLUGIN-GUIDE.md) for the hook API and an example.

Only add config files you trust. Uncage executes the config locally.

---

## Browser Web UI

The browser UI is the fastest way to clone and monitor websites:

> [!CAUTION]
> **No Web UI Contributions Accepted**
> The design and functionality of the Web UI are considered final. Please do not submit issues, feature requests, or Pull Requests attempting to redesign, enhance, or alter the Web UI. We are strictly focusing on the core crawler and export pipeline. Any UI-focused PRs will be automatically closed.

Launch the UI:

```bash
npm start
# or specify a custom port:
npx @nightteye/uncage --port 9000
```

1. Open `http://localhost:8787`.
2. Paste the target URL and click **Start Export**.
3. Use **Fine-tune** to set a page-depth limit, respect or ignore robots rules, or crawl only priority pages.
4. Watch live logs and review the export quality report in the instance card.
5. Click **Preview ↗** to view your clone or **.ZIP** to download the archive.

---

## CLI Reference

### Basic Syntax

```bash
uncage [url] [options]
```

*(Omit `[url]` to launch the web UI).*

### Options Table

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <dir>` | Site hostname | Name of the subfolder under `output/` |
| `--ui` | `false` | Launch the Web UI even when a URL is supplied |
| `--port <number>` | `8787` | Port for the Web UI server |
| `--max-pages <number>` | `50` | Maximum number of pages to crawl |
| `--max-depth <number>` | Unlimited | Maximum link depth from the seed (0 = seed page only) |
| `--priority-only` | `false` | Crawl only the seed, navigation, and sitemap pages with priority ≥ 0.5 |
| `--timeout <ms>` | `30000` | Page navigation timeout in milliseconds |
| `--no-headless` | `false` | Show the Chromium browser window while crawling |
| `--safe-mode` | `false` | Disable JavaScript execution; faster, but cannot render SPAs |
| `--skip-deps` | `false` | Skip recursive dynamic JavaScript module scanning |
| `--max-memory <mb>` | `0` (unlimited) | Memory cap for page buffers |
| `--allow-url <glob>` | None | Whitelist asset URLs matching pattern (can repeat) |
| `--block-url <glob>` | None | Blacklist asset URLs matching pattern (can repeat) |
| `--purge-css` | `false` | Remove unused CSS selectors to make files smaller; may affect dynamic styles |
| `--no-purge` | Default behavior | Legacy flag to keep all CSS selectors |
| `--keep-analytics` | `false` | Keep tracking scripts (Google Analytics, Segment, etc.) |
| `--ignore-robots` | `false` | Bypass robots.txt rules and crawl-delay (use only with permission) |

### Common CLI Examples

```bash
# Clone only the homepage (single page):
uncage https://example.com --max-depth 0

# Limit crawling to navigation pages and high-priority sitemap entries:
uncage https://example.com --priority-only

# Clone with a custom output directory:
uncage https://example.com -o my-portfolio

# Watch the browser live during crawl (useful for debugging):
uncage https://example.com --no-headless

# Opt in to removing unused CSS selectors for a smaller export:
uncage https://example.com --purge-css
```

---

## Output Structure

All exports are written to `output/<folder-name>/`:

```text
output/example.com/
├── index.html              # Clean root homepage
├── about.html              # Multi-page static route
├── contact.html            # Multi-page static route
├── assets/                 # Rewritten local assets
│   ├── css/                # Harvested stylesheets
│   ├── js/                 # Bundled scripts & ES modules
│   ├── images/             # Images (svg, png, webp, jpg)
│   ├── fonts/              # Downloaded webfonts (woff2, ttf)
│   └── media/              # Audio & video resources
├── asset-map.json          # Mapping of original remote URLs to local files
├── export-report.json      # Page and asset counts, missing and external references
├── .uncage-manifest.json   # Files generated by this export
├── package.json            # Local preview runner
└── README.md               # Quick instructions for the exported site
```

When you export to the same folder again, old generated pages and assets are moved to `output/.uncage-archive/<folder-name>/`. Files you added to the export stay in place. You can delete the archive after reviewing it.

CSS is minified while all selectors are preserved by default. Use `--purge-css` only when a smaller export matters more than preserving styles added by JavaScript.

---

## Preview & Deployment

### Local Preview

```bash
cd output/example.com
npm run preview
```

*(If you used the Web UI, an automated preview server is already launched for you).*

### Deployment

Because the export is 100% static HTML, CSS, and JS, you can deploy the folder directly to any host:

- **Vercel**: `vercel output/example.com`
- **Netlify**: Drag-and-drop the folder into [app.netlify.com/drop](https://app.netlify.com/drop)
- **Cloudflare Pages / GitHub Pages / AWS S3 / Nginx / Apache**

---

## Polite Crawling & robots.txt

By default, Uncage checks `robots.txt` before crawling:
- Uses rules for the `Uncage` user agent, falling back to `*`, and applies the most specific matching `Allow` or `Disallow` rule.
- Respects the declared `Crawl-delay`; if `robots.txt` cannot be fetched, it warns and continues. If the seed page is disallowed, it stops before starting the browser.
- Finds sitemaps listed in `robots.txt`, then tries `/sitemap.xml` and `/sitemap_index.xml`. Sitemap indexes are followed, and only allowed same-origin pages are added.
- Treats sitemap pages as direct discoveries at depth 1. `--max-depth 0` keeps only the seed; omitting the option allows unlimited link depth.
- Keeps `--max-pages` as a hard page limit, even when sitemaps list more pages.
- With `--priority-only`, crawls the seed, navigation links, and sitemap entries with priority `0.5` or higher.

Use `--ignore-robots` only when you have permission to bypass the target site's rules. It also disables `Crawl-delay`; asset allow/block filters remain separate from robots rules.

## Export Quality & CSS

Every completed export includes `export-report.json`, which lists missing pages, missing assets, broken local references, and external resources, along with page and asset totals. The Web UI shows the same report in the completed export card.

Uncage minifies CSS while keeping all selectors by default, including selectors used by client-side scripts. `--purge-css` opts in to removing selectors that appear unused in the captured pages; check the report and preview the export afterward.

---

## Troubleshooting

- **Styles or assets missing**: Check `export-report.json` for missing local references. If you used `--purge-css`, retry without it to preserve dynamic classes.
- **Missing deeper pages**: The default cap is 50 pages. Increase `--max-pages 200` or adjust `--max-depth`.
- **Crawl is slow**: Use `--skip-deps` to skip deep transitive JS module scanning, or `--safe-mode` for simple sites.
- **Port 8787 already in use**: Start with `--port 9000`.
- **Playwright browser missing**: Run `npx playwright install chromium`.

---

## Documentation & Links

- **[Wiki](https://github.com/Nightteye/uncage/wiki)**: Full guides, architecture breakdown, and FAQs
- **[v1.1.0 release announcement](https://github.com/Nightteye/uncage/blob/main/docs/ANNOUNCEMENT-v1.1.0.md)**: Crawl discovery, export reports, and plugin hooks
- **[Security Policy](SECURITY.md)**: Threat model and vulnerability reporting
- **[Code of Conduct](CODE_OF_CONDUCT.md)**: Community standards and guidelines
- **[npm Package](https://www.npmjs.com/package/@nightteye/uncage)**: Official npm registry page

---

## Development

```bash
npm run typecheck       # TypeScript checks (strict)
npm test                # Run Vitest test suite
npm run test:coverage   # Coverage report
```

---

## License

Distributed under the [MIT License](LICENSE).
