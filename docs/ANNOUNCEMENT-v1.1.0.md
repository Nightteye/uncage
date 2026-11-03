# Uncage v1.1.0: Smarter Crawling and Better Export Checks

Uncage v1.1.0 adds more control over which pages are crawled and makes it easier to check the exported site.

## What's new

- **Smarter page discovery:** Uncage reads `robots.txt`, follows sitemap files, and ranks pages from sitemaps and site navigation. It respects crawl rules and delay by default.
- **More crawl controls:** Set a maximum link depth or use `--priority-only` to focus on the seed page, navigation links, and high-priority sitemap pages. `--max-pages` stays a hard limit.
- **Export quality report:** Each export includes `export-report.json`. The Web UI also shows page, asset, missing-reference, and external-resource counts when a clone finishes.
- **Safer CSS defaults:** CSS is minified, while selectors are kept by default. Use `--purge-css` only when you want a smaller export and have checked that dynamic styles still work.
- **Plugin hooks:** Add an optional `uncage.config.ts` to customize page capture, downloaded assets, HTML rewriting, or final output. See the [plugin guide](PLUGIN-GUIDE.md).

## Try it

```bash
npx @nightteye/uncage@1.1.0
npx @nightteye/uncage@1.1.0 https://example.com --max-depth 2
```

The browser UI includes the crawl controls and shows the export quality report. The CLI supports the same crawl options.

Uncage exports static HTML, CSS, and JavaScript. The experimental React cloner remains paused indefinitely. See the [static HTML pivot announcement](ANNOUNCEMENT.md) for details.
