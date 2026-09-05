# CLI Reference

## Basic Usage

```bash
npx tsx src/index.ts [url] [options]
```

If you omit the URL, the web UI opens instead.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `url` | No | The target URL to clone. If not provided, the web UI launches. |

## Options

### Output

| Flag | Default | Description |
|------|---------|-------------|
| `-o, --output <dir>` | Site hostname | Name of the output folder inside `output/`. |

### Crawling

| Flag | Default | Description |
|------|---------|-------------|
| `--max-pages <number>` | 50 | Maximum number of pages to crawl. |
| `--max-depth <number>` | Unlimited | Maximum link depth from the seed page. 0 means only the seed page. |
| `--timeout <ms>` | 30000 | How long to wait for each page to load, in milliseconds. |
| `--ignore-robots` | Off | Ignore robots.txt rules. Only use this on sites you own. |
| `--priority-only` | Off | Only crawl pages with a sitemap priority of 0.5 or higher. |

### Browser

| Flag | Default | Description |
|------|---------|-------------|
| `--no-headless` | Off | Show the browser window while crawling. Useful for debugging. |
| `--safe-mode` | Off | Disable JavaScript execution. Faster, but cannot render single-page apps. |

### Assets

| Flag | Default | Description |
|------|---------|-------------|
| `--skip-deps` | Off | Skip recursive JavaScript module dependency resolution. |
| `--allow-url <pattern>` | None | Allow asset URLs matching this glob pattern. Can be used multiple times. |
| `--block-url <pattern>` | None | Block asset URLs matching this glob pattern. Can be used multiple times. |
| `--max-memory <mb>` | 0 (unlimited) | Maximum memory in MB for page buffers. |

### Post-Processing

| Flag | Default | Description |
|------|---------|-------------|
| `--no-purge` | Off | Skip PurgeCSS. Keeps all CSS classes, even unused ones. Turn this on if the export looks broken. |
| `--keep-analytics` | Off | Keep third-party analytics and tracking scripts in the export. |

### Web UI

| Flag | Default | Description |
|------|---------|-------------|
| `--ui` | Off | Open the web UI even when a URL is provided. |
| `--port <number>` | 8787 | Port for the web UI server. |

## Examples

Clone a single page:

```bash
npx tsx src/index.ts https://example.com --max-depth 0
```

Clone an entire site with a custom output folder:

```bash
npx tsx src/index.ts https://example.com -o my-site
```

Clone with the browser visible (for debugging):

```bash
npx tsx src/index.ts https://example.com --no-headless
```

Clone without CSS purging (if the export looks broken):

```bash
npx tsx src/index.ts https://example.com --no-purge
```

Launch the web UI on a different port:

```bash
npx tsx src/index.ts --port 9000
```
