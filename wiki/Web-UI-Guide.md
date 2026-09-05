# Web UI Guide

## Opening the UI

```bash
npm start
```

This launches the web interface at `http://localhost:8787`. Your default browser will open automatically.

## Cloning a Site

1. Paste the full URL of the site you want to clone into the URL field (for example, `https://example.com`).
2. Optionally set a custom output folder name. It defaults to the site's hostname.
3. Click "Start Export".

An instance card will appear showing live progress. You can paste another URL and start a second export right away -- up to 3 run at the same time.

## Instance Cards

Each export gets its own card in the grid. The card shows:

- **Status pill** -- Queued, Running, Done, or Failed.
- **Live terminal** -- A scrolling log of what the cloner is doing.
- **Preview button** -- Opens the cloned site in a new tab (appears when done).
- **ZIP button** -- Downloads the entire export as a `.zip` file.

Cards survive page refreshes. If you reload or switch tabs and come back, your instances will still be there.

## Export Options

Click the "Advanced" toggle below the URL field to see these options:

| Option | Default | What it does |
|--------|---------|--------------|
| Max pages | 50 | Maximum number of pages to crawl. |
| Timeout | 30000 ms | How long to wait for each page to load. |
| Max link depth | Unlimited | 0 means only the page you entered. 1 means that page plus pages it links to. And so on. |
| Headless | On | When off, you can watch the browser crawl in real time. |
| Respect robots.txt | On | Follows the site's crawling rules. |
| Priority pages only | Off | When on, only crawls pages with a sitemap priority of 0.5 or higher. |
| Safe mode | Off | Disables JavaScript. Faster but cannot render single-page apps. |
| Skip JS dependency scanning | Off | Skips the step that finds and downloads JavaScript module imports. |
| Keep analytics | Off | Preserves tracking scripts like Google Analytics. |
| Skip CSS purge | Off | Keeps all CSS classes. Turn this on if the export looks broken. |

## Output Files

Exports are saved to `output/<folder-name>/`. Each export contains:

- HTML files for every crawled page.
- An `assets/` folder with CSS, JavaScript, images, fonts, and other resources.
- A `package.json` with a `preview` script for local testing.
- A `README.md` with basic instructions.

## Tips

- If a site looks broken after exporting, try turning on "Skip CSS purge". The purger sometimes removes classes that are added dynamically by JavaScript.
- Use "Max link depth: 0" if you only want a single page, not the whole site.
- The "Safe mode" option is useful for simple static sites. It skips JavaScript rendering, which makes the export much faster.
