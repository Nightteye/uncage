# Troubleshooting

## The exported site looks broken or unstyled

**Cause**: PurgeCSS removed CSS classes that are added dynamically by JavaScript at runtime. The purger only sees classes in the static HTML, so it thinks the dynamic ones are unused.

**Fix**: Re-export with CSS purging disabled:

```bash
npx tsx src/index.ts https://example.com --no-purge
```

Or in the Web UI, check "Skip CSS purge" under Advanced options.

---

## Some pages are missing from the export

**Cause**: The default page limit is 50, or the depth limit cut off deeper pages.

**Fix**: Increase the limits:

```bash
npx tsx src/index.ts https://example.com --max-pages 200 --max-depth 5
```

---

## The export takes a very long time

**Cause**: The site has many pages, or JavaScript dependency resolution is scanning a large module tree.

**Fix**: Try these options to speed things up:

- Lower `--max-pages` to limit scope.
- Set `--max-depth 1` or `--max-depth 2` to avoid crawling deep into the site.
- Use `--skip-deps` to skip JavaScript module scanning.
- Use `--safe-mode` to disable JavaScript entirely (fastest, but cannot render SPAs).

---

## Images or fonts are missing

**Cause**: The browser may not have loaded those resources during the crawl (lazy-loaded content, or the page was not scrolled).

**Fix**: Currently there is no automatic scroll-to-bottom feature. If important assets are missing, try visiting the page with `--no-headless` to see what is happening during the crawl.

---

## "EPERM" or "Access denied" errors on Windows

**Cause**: Another program (antivirus, file indexer, or a previous Node process) has a lock on files in the output directory.

**Fix**:
1. Close any file explorer windows pointing to the `output/` folder.
2. Stop any running Uncage server processes.
3. Try again. If the problem persists, restart your terminal.

---

## The site blocks the crawler

**Cause**: Some sites detect automated browsers and serve a CAPTCHA or blank page.

**Fix**: Uncage uses stealth plugins to avoid detection, but some sites are aggressive. There is no guaranteed workaround. Only clone sites you have permission to access.

---

## Port 8787 is already in use

**Cause**: Another instance of Uncage (or another program) is using that port.

**Fix**: Start the UI on a different port:

```bash
npx tsx src/index.ts --port 9000
```

---

## "Playwright browser not found" error

**Cause**: Playwright's Chromium binary was not installed.

**Fix**:

```bash
npx playwright install chromium
```
