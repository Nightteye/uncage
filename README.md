<p align="center">
  <img src="./media/logo.svg" alt="Uncage logo" width="120" height="120" />
</p>

# Uncage

Uncage is a local website cloner that captures a rendered site and exports a standalone static HTML, CSS, and JavaScript bundle. It includes a browser UI for simple use and a CLI for repeatable exports.

> [!IMPORTANT]
> ### Static HTML pivot
> Uncage now supports Static HTML, CSS, and JavaScript exports only. The React TSX/JSX cloner is paused indefinitely because it still has reliability issues. The code remains in the repository, and contributions to fix it are welcome. Read the full [pivot announcement](docs/ANNOUNCEMENT.md).

> [!WARNING]
> Only clone sites you own or have permission to capture. Uncage loads target-site JavaScript in a local Playwright browser, and an export can still need manual review for dynamic application behavior.

## What it exports

- Multi-page static HTML that can be opened directly or deployed to static hosting.
- Local copies of captured images, fonts, CSS, JavaScript, media, WASM, and JSON assets.
- Rewritten internal links and asset references for offline/static hosting use.
- A generated `package.json` with `npm run preview` for serving the export.

React/TSX/JSX export is currently paused. The dormant code remains in the repository, but every supported command produces static HTML/CSS/JS and the legacy `--format` and `--interactive` options are no longer available.

## Install

Uncage requires Node.js 18 or newer and npm.

```bash
git clone https://github.com/Nightteye/uncage.git
cd uncage
npm install
npx playwright install chromium
```

To use the package binary from another directory, install or link the package, then run `uncage`. If the package is available through npm in your environment, `npx uncage` runs the same binary.

## Quick start: browser UI

The UI is the easiest way to start:

> [!CAUTION]
> **No Web UI Contributions Accepted**
> The design and functionality of the Web UI are considered final. Please do not submit issues, feature requests, or Pull Requests attempting to redesign, enhance, or alter the Web UI. We are strictly focusing on the core crawler and export pipeline. Any UI-focused PRs will be automatically closed.

```bash
npm start
# equivalent: npm run ui
# installed binary: uncage
```

It opens `http://localhost:8787`, where you can enter a URL, choose an output folder, and monitor progress. When a clone finishes, Uncage will automatically host a live preview of your static export on an available port in the `7000` series and provide a clickable link right in the UI. Use `--port` to choose another UI port:

```bash
npm run uncage -- --ui --port 9000
```

## Direct CLI usage

Pass a URL to clone without opening the UI:

```bash
npm run uncage -- https://example.com -o example-clone
# installed binary
uncage https://example.com -o example-clone
```

The result is written to `output/<output-name>/`. `uncage --ui` opens the UI even when a URL is also supplied.

### Options

```text
Usage: uncage [url] [options]

  -o, --output <dir>          Output directory name
      --ui                    Open the web UI even when a URL is provided
      --port <number>         Web UI port (default: 8787)
      --max-pages <number>    Maximum pages to crawl (default: 50)
      --max-depth <number>    Maximum link depth; 0 is the seed only (default: unlimited)
      --priority-only         Crawl only the seed, navigation pages, and sitemap pages with priority >= 0.5
      --ignore-robots         Ignore robots.txt and Crawl-delay; use only with permission
      --timeout <ms>          Page navigation timeout (default: 30000)
      --no-headless           Show the browser while crawling
      --safe-mode             Disable page JavaScript; faster, but cannot render SPAs
      --skip-deps             Skip recursive JavaScript module dependency scanning
      --max-memory <mb>       Maximum buffer memory; 0 is unlimited
      --allow-url <pattern>   Allow matching asset URLs; may be repeated
      --block-url <pattern>   Block matching asset URLs; may be repeated
      --no-purge              Skip PurgeCSS optimization
      --keep-analytics        Retain third-party analytics and tracking scripts
```

Asset URL filters support `*`, `?`, and character ranges such as `[0-9]`. They never block page navigations.

## Polite crawl discovery

By default, Uncage reads `robots.txt` before crawling. It applies `Uncage` rules first, falls back to `User-agent: *`, obeys Allow/Disallow precedence, and honors `Crawl-delay`. A disallowed seed URL stops the crawl before browser launch.

It also discovers same-origin pages from `robots.txt` sitemap declarations and the common `/sitemap.xml` and `/sitemap_index.xml` locations. Sitemap URLs affect the crawl order only: `--max-pages` is always a hard cap. If `robots.txt` cannot be reached, Uncage logs a warning and continues without restrictions. Use `--ignore-robots` only when you have clear authorization.

## Preview and deploy an export

> [!NOTE]
> If you used the Web UI, your clone is automatically hosted on an available `7000` series port. You do not need to run manual preview commands unless you exported via the CLI.

```bash
cd output/example-clone
npm run preview
```

You can also open `index.html` directly in a browser. The export is static and can be deployed to services such as Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, Nginx, or Apache.

## Limits and troubleshooting

- Sites with authenticated content, CAPTCHAs, aggressive bot protection, or server-only application behavior may not export completely.
- Use `--no-purge` if JavaScript applies CSS classes dynamically and styles are missing in the result.
- Use `--skip-deps` for a faster export when transitive JavaScript module capture is unnecessary.
- Use `--safe-mode` for a more conservative static capture; it intentionally cannot render client-side applications.
- The crawler is not a substitute for a site's source code, licenses, or permission to reuse its design and content.

## Development

```bash
npm run typecheck
npm test
npm run test:coverage
```

The current test suite covers extraction rewrites, static assembly, filename and route handling, URL filtering, crawl-policy parsing, and queue ordering.

## Contributing

Issues and pull requests are welcome. Include the target URL (where sharing it is permitted), the command used, expected behavior, and a small description of the observed export issue.

## License

Distributed under the [MIT License](LICENSE).
