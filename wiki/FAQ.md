# FAQ

## What sites can Uncage clone?

Uncage works best with static sites built on frameworks like Framer, Webflow, and similar tools. It can also handle server-rendered sites and simple SPAs. Sites with heavy client-side rendering or login requirements may not export cleanly.

## Does it clone the CMS or backend?

No. Uncage only captures what the browser sees. It downloads the rendered HTML, CSS, JavaScript, images, and fonts. It does not copy databases, APIs, server logic, or CMS content management systems. The output is a static snapshot of the site as it appeared at the time of cloning.

## Is this legal?

Uncage is a tool. What you do with it is your responsibility. Only clone sites you own or have explicit permission to copy. Respect copyright, terms of service, and robots.txt. The tool is intended for archiving, offline use, and development purposes.

## Does it work on Windows, macOS, and Linux?

Yes. Uncage runs on all three platforms. It uses Node.js and Playwright, both of which are cross-platform.

## Can I run multiple exports at the same time?

Yes. The web UI supports up to 3 concurrent exports. Each one gets its own instance card with live progress. You can also queue more -- they will start automatically when a slot opens up.

## Where are the exported files saved?

All exports go to the `output/` folder in the project root. Each export gets its own subfolder named after the site's hostname (for example, `output/example.com/`).

## Can I deploy the exported files to a hosting service?

Yes. The output is plain HTML, CSS, and JavaScript. You can upload it to any static hosting service like Netlify, Vercel, Cloudflare Pages, GitHub Pages, or any web server.

## Why does the export look different from the original site?

A few common reasons:
- **Dynamic content**: Content loaded by JavaScript after page load may not appear.
- **CSS purging**: The optimizer may have removed CSS classes that are applied dynamically. Try exporting with `--no-purge`.
- **Missing assets**: Some resources (lazy-loaded images, web fonts loaded conditionally) may not have been intercepted during the crawl.
- **External APIs**: If the site fetches data from an API, that data will not be available in the static export.

## Does it handle single-page applications (SPAs)?

Partially. Uncage renders each page in a real browser, so it captures the fully rendered HTML. However, client-side routing in SPAs means that the crawler may not discover all routes. Use `--max-depth` and `--max-pages` to control how far it explores.

## What is "Safe mode"?

Safe mode disables JavaScript execution in the browser. The crawler only downloads the raw HTML that the server sends, without running any scripts. This is faster and avoids errors from broken JavaScript, but it cannot render SPAs or sites that require JavaScript to display content.

## Can I resume a failed export?

Not currently. If an export fails or is interrupted, you need to start it again from scratch. The previous partial output will remain in the `output/` folder.

## How do I update Uncage?

```bash
cd uncage
git pull
npm install
```
