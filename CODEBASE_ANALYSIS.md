# ⛓️‍💥 Uncage — Comprehensive Codebase Architecture & Understanding

> **Document Version:** 1.0.0  
> **Date:** August 19, 2026  
> **Status:** Production-Hardened (0 TypeScript Errors, Core Pipeline Complete)  
> **Target Phase:** Phase 7 (Open-Source Launch Prep)

---

## 1. Executive Summary & Mission

**Uncage** is an open-source, local-first, developer-focused website cloner and React code exporter.

### Core Value Proposition:
- **No Paywalls:** Direct open-source alternative to proprietary paywalled exporters like `NoCodeXport.com`.
- **100% Deterministic & Local:** Does not rely on cloud LLM APIs for translation. All extraction, compilation, and assembly happen locally on the user's machine.
- **Production-Ready Output:** Clones any target website (Framer, Webflow, WordPress, custom SPAs) and produces a clean **Vite + React 18 + TypeScript + React Router** application that can be run immediately with:
  ```bash
  npm install && npm run dev
  ```
- **Type-Safe & Error-Free:** Generates valid `.tsx` pages that pass strict TypeScript compilation (`tsc --noEmit`) with 0 errors.

---

## 2. Architecture & Pipeline Breakdown

```
Target URL (Framer / Webflow / WP / Custom)
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. CLI Orchestrator (src/index.ts)                          │
│    - Built with Commander.js                                │
│    - Registers stealth plugin on Chromium                   │
│    - Coordinates: Extract -> Compile -> Assemble            │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Stealth Crawler & Asset Harvester (src/extractor.ts)    │
│    - Playwright Chromium with stealth bot evasion           │
│    - Network Interception (`context.route('**/*')`)         │
│    - Global CORS bypass (`access-control-allow-origin: *`)   │
│    - Asset URL MD5 Hashing (`${baseName}-${hash}${ext}`)    │
│    - Categorized asset storage (`images`, `css`, `js`, ...) │
│    - BFS multi-page link crawler (same-origin, max 50 pages)│
│    - Dynamic JS module scanner (`downloadMissingDeps`)      │
│    - CSS `url()` rewriter & anti-bot script scrubber        │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. HTML-to-JSX AST Compiler (src/parser.ts)                 │
│    - Cheerio DOM parsing to React 18 JSX AST                │
│    - Case-sensitive SVG tag restoration (`svgTagMap`)       │
│    - SVG/HTML attribute camelCasing (`svgCamelCaseMap`)     │
│    - State-machine CSS inline style parser (`parseStyle`)   │
│    - Safe script/style tags via `dangerouslySetInnerHTML`   │
│    - Internal `<a>` tags -> `<Link to="...">` components    │
│    - PascalCase route sanitizer (`/404` -> `Page404`)       │
│    - Guaranteed fragment `<>` root encapsulation            │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Vite Scaffolder & Runtime Assembler (src/assembler.ts)   │
│    - Scaffolds `package.json`, `tsconfig.json`, `index.html`│
│    - Global `<head>` extraction, sanitization & injection   │
│    - Dynamic multi-page React Router in `src/App.tsx`       │
│    - Custom `serve-mjs-raw` Vite middleware with query      │
│      string stripping (`.mjs?t=...`, `?import`)             │
│    - 404 fallback routing & entrypoint `src/main.tsx`       │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
          output/<outputName>/
          (Ready to run Vite + React 18 + TS app)
```

---

## 3. Deep Dive into Core Modules

### 3.1. CLI Orchestrator (`src/index.ts`)
- **Initialization:** Applies `puppeteer-extra-plugin-stealth` directly to Playwright's `chromium` before executing command actions.
- **Command Routing:** Defines `uncage <url>` with `-o, --output <dir>` option, defaulting to the target hostname if omitted.
- **Linear Pipeline:**
  1. `extract(url, outputName)`: Intercepts assets, crawls routes, rewrites HTML/CSS, resolves dynamic imports.
  2. `compileToReact(outputDir, pages)`: Compiles all discovered pages into React 18 JSX components.
  3. `assemble(outputDir, url, originalHead, routes)`: Assembles the complete Vite application.

---

### 3.2. Stealth Crawler & Network Harvester (`src/extractor.ts`)
- **Browser Evasion:**
  - Bypasses Cloudflare, Datadome, and anti-bot systems via `puppeteer-extra-plugin-stealth`.
  - Launches Chromium with flags: `--disable-web-security`, `--disable-site-isolation-trials`, `--no-sandbox`.
  - Spoofs standard Windows 10 Chrome 131 Desktop User-Agent.
  - Process safety guaranteed via `try ... finally { await browser.close(); }` to prevent zombie instances.
- **Network Interception & Asset Harvesting:**
  - Intercepts all network traffic via `context.route('**/*')`.
  - Bypasses `data:` and `blob:` URIs.
  - Performs server-side fetches (`route.fetch()`) and verifies `response.ok()` to prevent saving 4xx/5xx error bodies.
  - Injects `access-control-allow-origin: *` and removes `content-encoding` and `content-length` headers.
  - Sorts assets by resource type into `src/assets/images`, `css`, `js`, `fonts`, and `media`.
- **Collision-Proof Asset Naming:**
  - Calculates an 8-character MD5 hash of the remote request URL:
    ```ts
    const fileName = `${baseName}-${urlHash}${ext}`;
    ```
  - Prevents filename collision when multiple assets share names across different paths (e.g. `/icons/close.svg` vs `/modal/close.svg`).
  - Infers correct file extensions using a comprehensive MIME type map fallback.
- **BFS Crawl Engine:**
  - Evaluates internal links with Cheerio (`$('a[href]')`).
  - Excludes `mailto:`, `tel:`, `javascript:`, hash links (`#`), and static binary extensions (`.png`, `.pdf`, `.zip`, etc.).
  - Restricts crawl strictly to `baseOrigin` with a hard limit of `maxPages = 50`.
  - Navigates with `waitUntil: 'domcontentloaded'` followed by a soft `networkidle` timeout (5s) and a 1.5s hydration delay to ensure client-side rendering (Framer/Webflow) completes.
- **HTML & CSS Rewriter:**
  - Replaces all absolute and root-relative URLs with local `/src/assets/...` paths.
  - Sorts `assetMap` keys descending by URL length before regex replacement to eliminate prefix collisions.
  - Rewrites inline CSS `url(...)` declarations and downloaded `.css` files.
  - Strips Cloudflare challenge tokens (`__CF$cv$params`), `cdn-cgi` scripts, and hidden tracking iframes.
- **Recursive Dynamic Module Scanner (`downloadMissingDeps`):**
  - Modern site builders (especially Framer) load JavaScript chunks dynamically via `import(...)` or `from "...mjs"`.
  - Scans downloaded `.js`/`.mjs` files up to depth 5 using regex.
  - Resolves relative imports against the parent chunk's remote URL base and downloads missing module chunks via Node `fetch()`.

---

### 3.3. HTML-to-JSX AST Compiler (`src/parser.ts`)
- **Cheerio DOM Traversal:** Reads post-rendered HTML for each route and traverses the `<body>` element.
- **SVG Intrinsic Element Restoration (`svgTagMap`):**
  - Fixes Cheerio's lowercase tag normalization by mapping 30+ SVG tags back to case-sensitive React intrinsic elements (`clippath` -> `clipPath`, `lineargradient` -> `linearGradient`, `fegaussianblur` -> `feGaussianBlur`, `foreignobject` -> `foreignObject`, etc.).
- **SVG & HTML Attribute Normalization (`svgCamelCaseMap` & `htmlAttrMap`):**
  - Maps `class` -> `className`, `for` -> `htmlFor`, `tabindex` -> `tabIndex={0}`, `crossorigin` -> `crossOrigin`, `srcset` -> `srcSet`.
  - Converts SVG attributes like `stroke-width` -> `strokeWidth`, `fill-rule` -> `fillRule`, `clip-path` -> `clipPath`, `viewbox` -> `viewBox`.
  - Preserves `data-*` and `aria-*` attributes verbatim.
- **Advanced State-Machine CSS Style Parser (`parseStyle`):**
  - Character-by-character scanner that respects quotes and nested parentheses.
  - Prevents breaking semicolons inside `url("data:...")` or CSS functions (`calc()`, `linear-gradient()`).
  - Supports CSS variables (`--custom-var: val`) and vendor prefixes (`-ms-` -> `msFlex`, `-webkit-` -> `WebkitTransform`).
- **Inline Script & Style Protection:**
  - Converts inline `<script>` and `<style>` blocks to `dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }}`.
  - Prevents JSX syntax errors from unescaped code, braces, or octal sequences.
- **Client-Side Routing Conversion:**
  - Replaces internal `<a>` tags with React Router `<Link to="...">` components (skipping external links and `download` anchors).
  - Automatically adds `import { Link } from 'react-router-dom';` when `<Link>` is used.
- **Identifier Sanitization (`toPascalCase`):**
  - Transforms route paths to valid PascalCase component names (e.g. `/` -> `Home`, `/about-us` -> `AboutUs`).
  - Prepends numbers (`/404` -> `Page404`) to prevent invalid JavaScript syntax.
- **Fragment Encapsulation:**
  - Wraps all component bodies inside React fragments (`<> ... </>`) to ensure single-root JSX compliance.

---

### 3.4. Vite Scaffolder & Runtime Assembler (`src/assembler.ts`)
- **Scaffolded Project Structure:**
  - Generates an independent `package.json` with React 18, React DOM, React Router DOM 6, Vite 6, and modern `@vitejs/plugin-react`.
  - Generates `tsconfig.json` targeting `ES2020`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, with `"noUnusedLocals": false` to prevent build issues with React 18 imports.
- **`<head>` Extraction & Sanitization:**
  - Extracts the original site's `<head>` tags (fonts, stylesheets, link tags).
  - Strips duplicate `<title>`, `<meta charset>`, viewport tags, and conflicting module/Framer hydration scripts.
  - Injects sanitized markup into `index.html` alongside `<div id="root"></div>` and `/src/main.tsx`.
- **Dynamic Multi-Page Router (`src/App.tsx`):**
  - Deduplicates routes and maps them to their respective page components.
  - Generates `<BrowserRouter>`, `<Routes>`, and individual `<Route path="..." element={<Component />} />`.
  - Injects a catch-all 404 fallback: `<Route path="*" element={<Home />} />`.
- **Custom `serve-mjs-raw` Vite Middleware:**
  - **The Problem:** Modern site JS chunks (like Framer runtime) in `src/assets/js/` crash Vite when requested with query strings (`.mjs?t=123` or `?import`).
  - **The Solution:** Custom Connect middleware strips query parameters, decodes the URI, and directly streams the raw JavaScript file with `Content-Type: application/javascript` and caching headers, bypassing Vite's internal AST transform pipeline.
  - `optimizeDeps.entries: ['src/main.tsx']` restricts pre-bundling scans to avoid parsing raw vendor assets.

---

## 4. Key Bugs Fixed & Verified (25+ Patches Applied)

| Area | Bug Description | Resolution Applied |
| :--- | :--- | :--- |
| **Extractor** | 4xx/5xx HTTP error responses saved as corrupted assets | Added `if (!response.ok())` guard before saving |
| **Extractor** | Identical asset basenames overwriting each other | Added MD5 URL hash: `${baseName}-${urlHash}${ext}` |
| **Extractor** | Zombie browser processes lingering after errors | Enclosed browser lifecycle in `try ... finally { await browser.close(); }` |
| **Extractor** | `<head>` containing unrewritten remote asset URLs | Passed `originalHead` through `rewriteHtml` before assembly |
| **Extractor** | SPA infinite network idle timeouts | Changed to `domcontentloaded` + soft 5s `networkidle` + 1.5s sleep |
| **Extractor** | Non-HTML binary files queued in link crawler | Added `STATIC_EXTENSIONS` blacklist filter |
| **Extractor** | Relative JS module imports failing to download | Added multi-origin base tracking in `downloadMissingDeps` |
| **Extractor** | Downloaded `.css` containing unrewritten `url()` | Added `rewriteCssFiles` to rewrite remote CSS declarations |
| **Extractor** | Windows illegal path characters causing `ENOENT` | Added `sanitizeFileName` replacing invalid characters with `_` |
| **Extractor** | Decompression header mismatches crashing `route.fulfill` | Stripped `content-encoding` and `content-length` headers |
| **Parser** | Cheerio lowercase SVG tags breaking TSX | Added `svgTagMap` for 30+ SVG intrinsic elements |
| **Parser** | Numeric routes (`/404`) generating invalid JS identifiers | Added `toPascalCase` numeric prefixing (`Page404`) |
| **Parser** | Root text/comment nodes breaking fragment check | Standardized on guaranteed `<>` fragment encapsulation |
| **Parser** | Unescaped `<`, `>`, `{`, `}` breaking JSX | Replaced with HTML entities (`&lt;`, `&gt;`, `&#123;`, `&#125;`) |
| **Parser** | Inline scripts/styles with templates crashing parser | Escaped via `JSON.stringify` in `dangerouslySetInnerHTML` |
| **Parser** | CSS vendor prefixes converted to invalid props | Handled `-ms-` -> `msFlex`, `-webkit-` -> `WebkitTransform` |
| **Parser** | CSS semicolons in data URIs prematurely splitting | Implemented stateful parser tracking quotes and parentheses |
| **Parser** | Boolean HTML attributes rendering as strings | Normalized to boolean literals (`disabled`, `disabled={true}`) |
| **Assembler** | Vite middleware bypassed by query strings (`?t=...`) | Stripped query strings and decoded pathnames before matching |
| **Assembler** | Overbroad Rollup regex breaking React bundle | Removed invalid external regex patterns |
| **Assembler** | Strict `noUnusedLocals` failing React 18 JSX transform | Configured `"noUnusedLocals": false` in generated `tsconfig.json` |
| **Assembler** | Duplicate `<title>` and hydration scripts in `<head>` | Added regex sanitizer stripping duplicate tags in `assembler.ts` |

---

## 5. Current File Inventory

```
uncage/
├── .gitignore                      # Ignores node_modules, dist, output, .env
├── package.json                    # CLI dependencies (cheerio, commander, playwright-extra, etc.)
├── package-lock.json               # Locked dependency tree
├── tsconfig.json                   # NodeNext CLI TypeScript configuration
├── SESSION_HANDOFF.md              # Project memory and handoff log
├── CODEBASE_ANALYSIS.md            # Comprehensive architecture analysis document
├── Code Exporter Architecture...   # In-depth architectural research notes
├── docs/
│   ├── phases.md                   # 6-phase engineering plan
│   └── memory/
│       └── changelog.md            # Session-by-session changelog
└── src/
    ├── index.ts                    # CLI entrypoint (Commander orchestrator)
    ├── extractor.ts                # Stealth Playwright browser, BFS crawler, network interceptor
    ├── parser.ts                   # Cheerio DOM to React 18 JSX AST compiler
    └── assembler.ts                # Vite project scaffolder, tsconfig, index.html & router generator
```

---

## 6. How to Run & Verify

### Clone a Target Website:
```bash
# Clone any website into a standalone Vite React app:
npx tsx src/index.ts https://example.com -o my-clone
```

### Run the Generated Application:
```bash
cd output/my-clone
npm install
npm run dev      # Opens at http://localhost:3000
npm run build    # Compiles production bundle with 0 errors
```

### Typecheck the CLI Codebase:
```bash
npx tsc --noEmit # Verified: 0 errors
```

---

## 7. Roadmap & Next Steps: Phase 7 (Open-Source Launch)

1. **`README.md`**:
   - Hero header with badges and elevator pitch (the free, open-source alternative to paywalled site exporters).
   - Core feature breakdown (Stealth browser, React 18 AST compilation, React Router, dynamic module resolution).
   - Quickstart guide and CLI command documentation.
   - Comparison matrix (Uncage vs Paid Exporters vs HTTrack/SingleFile).
   - Architecture diagram.
   - Responsible use & legal disclaimer.
2. **`LICENSE`**: Standard MIT License.
3. **Community & Contribution Standards**:
   - `CONTRIBUTING.md` (Setup, guidelines, reporting issues).
   - `CODE_OF_CONDUCT.md` (Contributor Covenant).
   - `.github/ISSUE_TEMPLATE/` (Bug reports, feature requests).
   - `.github/PULL_REQUEST_TEMPLATE.md`.
4. **CLI Enhancements (Optional Quality of Life)**:
   - CLI flags: `--max-pages <num>`, `--timeout <ms>`, `--no-headless`.
