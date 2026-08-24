# ⛓️‍💥 Uncage — Project Memory & Session Handoff

> **Date:** August 19, 2026  
> **Status:** All core phases complete (Single Page, Multi-Page Crawler, HTML-to-JSX AST Compiler, Vite Scaffolder, 25+ Critical Bugs Patched, 0 TypeScript Errors). Ready for Open-Source Polish & Launch.

---

## 1. Executive Summary & Mission

**Uncage** is an open-source, developer-first website cloner and code exporter.
- **Competitor Target:** Services like `NoCodeXport.com` charge recurring paywalls to export locked website builds (Framer, Webflow, WordPress).
- **Core Philosophy:** 100% open-source, deterministic, local execution (no mandatory cloud LLM API keys required).
- **Output Standard:** Generates a production-ready, clean **Vite + React 18 + TypeScript + React Router** codebase (`npm install && npm run dev` runs out of the box).

---

## 2. Architecture Overview

```
Target URL (Framer / WP / Webflow)
              │
              ▼
    [1. Stealth Crawler]  (src/extractor.ts)
    - Playwright Chromium with stealth plugins
    - BFS link crawler (discovers internal same-origin routes)
    - Global network interceptor (images, stylesheets, fonts, JS, media)
    - URL hash deduplication (`logo-a8f3b2.png`)
    - Recursive dynamic module scanner (`downloadMissingDeps`)
    - Local asset rewriter (HTML & downloaded CSS `url()`)
              │
              ▼
   [2. HTML-to-JSX Compiler]  (src/parser.ts)
   - Cheerio DOM traversal to valid React JSX AST
   - SVG tag restoration (`clippath` -> `clipPath`, `lineargradient` -> `linearGradient`)
   - SVG & HTML attribute camelCasing (`stroke-width` -> `strokeWidth`, `tabindex` -> `tabIndex={0}`)
   - CSS inline style parser with vendor prefix & semicolon safety
   - HTML entity escaping (`&`, `<`, `>`, `{`, `}`)
   - Safe stringification of inline `<script>` & `<style>` tags via `JSON.stringify`
   - Internal `<a>` tags -> `<Link to="...">` React Router components
   - Safe component naming (`/404` -> `Page404.tsx`, `/` -> `Home.tsx`)
   - Guaranteed `<>` fragment encapsulation
              │
              ▼
     [3. Vite Scaffolder]  (src/assembler.ts)
     - Scaffolds `package.json`, `tsconfig.json`, `vite.config.ts`
     - Global `<head>` extraction & sanitizer (removes duplicate `<title>`, meta, and conflicting hydration scripts)
     - Multi-page React Router (`App.tsx`) with route deduplication and 404 fallback
     - Custom `serve-mjs-raw` Vite middleware with query parameter stripping (`?t=...`, `?import`)
```

---

## 3. Chronological Evolution & Milestone History

### Phase 1: Foundation & Stealth Browser
- Initialized TypeScript CLI with `commander`, `playwright-extra`, and `puppeteer-extra-plugin-stealth` to bypass Cloudflare and bot shields.

### Phase 2: Network Asset Harvesting
- Implemented `context.route('**/*')` network interception.
- Handled CORS headers (`access-control-allow-origin: *`) and saved images, CSS, fonts, and scripts to `src/assets/`.

### Phase 3 & 4: DOM Capture & Static Synthesis
- Captured post-rendered HTML DOM state and rewrote all remote URLs to local asset paths.

### Phase 5: Transition from Raw HTML to Pure React AST
- User requested transitioning from raw HTML to clean React components.
- Developed `src/parser.ts` to convert HTML DOM directly into clean JSX components.
- Restructured generated asset folder to Vite standard `src/assets/`.

### Phase 6: Multi-Page Crawler & React Router
- Transformed single-page extraction into an automated BFS crawler.
- Generates `src/pages/*.tsx` for each internal route.
- Translates internal anchor links to React Router `<Link>` components.
- Dynamically generates `src/App.tsx` router with fallback routes.

### Bug Hunt Swarm & Hardening (Latest Milestone)
- Dispatched an auditor swarm across `extractor.ts`, `parser.ts`, and `assembler.ts`.
- Identified and eliminated **25+ critical bugs** (detailed below).
- Verified `npx tsc --noEmit` on the codebase with **0 errors**.

---

## 4. Comprehensive Bug Log & Fixes Applied

### `src/extractor.ts` (Crawler & Asset Interceptor)
1. **4xx/5xx Error Body Pollution:** Fixed `route.fetch()` saving HTTP 404/500 error pages as corrupted `.png`/`.js` assets. Added `if (!response.ok())` check.
2. **Asset Filename Collision Overwrite:** Assets with identical basenames from different paths (e.g. `/icons/close.svg` vs `/modal/close.svg`) were overwriting each other. Added MD5 URL hashing (`${baseName}-${urlHash}${ext}`).
3. **Zombie Browser Leaks:** Wrapped browser execution in `try ... finally { await browser.close(); }`.
4. **Unrewritten `<head>` URLs:** `originalHead` was previously extracted before asset mapping. Now passed through `rewriteHtml` before assembler injection.
5. **SPA Infinite Network Idle Hang:** `waitUntil: 'networkidle'` caused timeouts on sites with WebSockets or background polling. Changed to `waitUntil: 'domcontentloaded'` with a 5s soft idle state.
6. **Non-HTML Binary Crawl Traps:** Filtered binary file extensions (`.pdf`, `.zip`, `.png`, etc.) out of the crawl queue.
7. **Infinite Crawl Guard:** Added `maxPages: 50` limit and normalized trailing slashes and hash fragments.
8. **Missing Module Scanner Multi-Origin:** Enhanced `downloadMissingDeps` to track parent module base directories for accurate relative import resolution.
9. **Unrewritten Downloaded CSS:** Added `rewriteCssFiles` to parse downloaded `.css` files and replace remote `url(...)` declarations with local paths.
10. **Windows File Path Sanitization:** Sanitized all output folder and raw HTML filenames to avoid `ENOENT` on illegal characters (`:`, `?`, `*`, `"`).
11. **Decompression Header Collisions:** Stripped `content-encoding` and `content-length` from intercepted headers before `route.fulfill`.

### `src/parser.ts` (React JSX Compiler)
12. **SVG Intrinsic Element Lowercasing:** Cheerio lowercased SVG tags (`clipPath` -> `clippath`, `linearGradient` -> `lineargradient`), causing fatal `JSX.IntrinsicElements` TypeScript errors. Added comprehensive `svgTagMap`.
13. **Numeric Component Identifiers:** Routes like `/404` generated invalid JS identifiers (`import 404 from ...`). Added `toPascalCase` sanitizer that prefixes numbers (`Page404`).
14. **Fragment Wrapping Bugs:** Flawed `needsFragment` checks emitted invalid JSX on root text nodes or comments. Standardized on guaranteed `<>` wrappers.
15. **Unescaped `<` and `>` in Text Nodes:** Escaped `&`, `<`, `>`, `{`, `}` in text nodes to prevent JSX syntax errors.
16. **Octal Escapes & Template String Crashes:** Switched `<script>` and `<style>` inline code escaping from raw template literals to `JSON.stringify()`.
17. **CSS Vendor Prefix Corruption:** Fixed `parseStyle` turning `-ms-transform` into invalid `mstransform` (now `msTransform`) and `-webkit-` to `WebkitTransform`.
18. **CSS Semicolons in URLs:** Semicolons inside `url('data:...')` or quotes no longer prematurely split CSS rules.
19. **Boolean Attribute Normalization:** Normalized lowercase Cheerio boolean attributes (`disabled`, `checked`, `readonly`, etc.) to emit valid JSX booleans (`disabled={true}` / `disabled`) rather than strings.
20. **Link Conversion Edge Cases:** Handled relative URLs and explicitly skipped `<a>` tags with `download` attributes.

### `src/assembler.ts` (Vite Runtime & Scaffolder)
21. **Vite Middleware Query String Bypass:** `serve-mjs-raw` was bypassed by query strings (`.mjs?t=123` or `?import`), causing Vite to attempt parsing proprietary Framer scripts and crash. Now decodes and strips query strings.
22. **Rollup External Regex Production Build Crash:** Over-broad `external: [/\.js$/]` regex was excluding React itself from `npm run build`. Removed and scoped properly.
23. **Strict Unused Locals Compilation Failure:** Generated files with `import React from 'react'` failed `tsc` under React 18 JSX transform. Set `"noUnusedLocals": false` in generated `tsconfig.json`.
24. **Injected `<head>` Conflicts:** Stripped duplicate `<title>`, `<meta charset>`, viewport, and conflicting hydration/analytics scripts from the injected `<head>`.
25. **Duplicate Route Imports & 404 Catch-All:** Normalized routes and added `<Route path="*" element={<Home />} />`.
26. **Dependency Version Alignment:** Updated `@vitejs/plugin-react` to `^4.3.4` and added `@types/node: ^20.11.0`.

---

## 5. Current File Inventory

```
uncage/
├── .gitignore               # Ignores node_modules, dist, output, .env
├── package.json             # "type": "module", dependencies: cheerio, commander, playwright-extra, etc.
├── tsconfig.json            # NodeNext configuration, includes src/, excludes output/ & node_modules/
├── SESSION_HANDOFF.md       # Complete state & context handoff
├── docs/
│   ├── phases.md            # Original 6-phase engineering roadmap
│   └── memory/
│       └── changelog.md     # Phase-by-phase changelog
└── src/
    ├── index.ts             # CLI entrypoint (Commander orchestrator)
    ├── extractor.ts         # Stealth Playwright browser, BFS crawler, network interceptor
    ├── parser.ts            # Cheerio DOM to React 18 JSX AST compiler
    └── assembler.ts         # Vite project scaffolder, tsconfig, index.html & router generator
```

---

## 6. How to Run & Verify

### Run the Cloner CLI:
```bash
# Clone any website into a clean Vite React project:
npx tsx src/index.ts https://example.com -o my-clone
```

### Run the Generated Output:
```bash
cd output/my-clone
npm install
npm run dev      # Opens at http://localhost:3000
npm run build    # Typechecks and builds production bundle
```

### Typecheck the CLI Codebase:
```bash
npx tsc --noEmit # Verified: 0 errors
```

---

## 7. Next Steps for Next Session (Phase 7: Open Source Launch)

When starting the next session, the focus should be **Phase 7: Open-Source Launch Prep**:

1. **`README.md`**:
   - Compelling hero section & problem statement (the paywall alternative to NoCodeXport).
   - Features breakdown (Stealth crawler, React 18 + TS AST compilation, React Router, Asset extraction).
   - CLI Usage instructions and options (`-o, --output`).
   - Comparison matrix (Uncage vs Paid Exporters vs HTTrack/SingleFile).
   - Legal & Ethical use disclaimer.
2. **`LICENSE`**: MIT License.
3. **Community Files**:
   - `CONTRIBUTING.md`
   - `CODE_OF_CONDUCT.md`
   - GitHub Issue & Pull Request Templates (`.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`).
4. **CLI Enhancements (Optional Polish)**:
   - Add `--limit <number>` or `--max-depth <number>` CLI flag.
   - Add `--no-headless` flag for visual debugging.
