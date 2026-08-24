# ⛓️‍💥 Uncage — Project Memory & Session Handoff

> **Date:** August 22, 2026  
> **Status:** Architecture understood, CODEBASE_ANALYSIS.md generated, 0 TS errors. Ready for Extreme QA Testing.

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
- Developed `src/parser.ts` to convert HTML DOM directly into clean JSX components.
- Restructured generated asset folder to Vite standard `src/assets/`.

### Phase 6: Multi-Page Crawler & React Router
- Transformed single-page extraction into an automated BFS crawler.
- Generates `src/pages/*.tsx` for each internal route.
- Translates internal anchor links to React Router `<Link>` components.
- Dynamically generates `src/App.tsx` router with fallback routes.

### Bug Hunt Swarm & Hardening
- Dispatched an auditor swarm across `extractor.ts`, `parser.ts`, and `assembler.ts`.
- Identified and eliminated **25+ critical bugs**.
- Verified `npx tsc --noEmit` on the codebase with **0 errors**.

### Latest Milestone: Codebase Analysis
- Architecture understood and documented (`CODEBASE_ANALYSIS.md` generated).
- Ensured a clean codebase with 0 TypeScript errors, readying the project for quality assurance.

---

## 4. Comprehensive Bug Log & Fixes Applied

*(See previous `SESSION_HANDOFF.md` for the full bug log detailing fixes across the crawler, compiler, and Vite scaffolder).*

---

## 5. Current File Inventory

```
uncage/
├── .gitignore               # Ignores node_modules, dist, output, .env
├── package.json             # "type": "module", dependencies: cheerio, commander, playwright-extra, etc.
├── tsconfig.json            # NodeNext configuration, includes src/, excludes output/ & node_modules/
├── SESSION_HANDOFF.md       # Previous complete state & context handoff
├── SESSION_HANDOFF_2.md     # Current updated handoff for Phase 8
├── CODEBASE_ANALYSIS.md     # Generated analysis file for architecture understanding
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

## 7. Next Steps for Next Session (Phase 8: Extreme QA Testing)

When starting the next session, the focus should be **Phase 8: Extreme QA Testing**:

1. **Benchmark Execution**: 
   - Perform extreme QA testing across the following targets:
     - Framer
     - Webflow
     - Modern SPAs
     - Multi-page benchmark sites
2. **Production Build Verification**: 
   - Ensure the generated projects are fully functional and pass production build requirements by running `npm run build` on the exported codebases.
3. **Open-Source Launch Prep**: 
   - Upon successful QA, proceed with documentation, licensing, and templates for open-source release.
