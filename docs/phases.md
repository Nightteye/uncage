# Open-Source Code Exporter Architecture Plan

## Prerequisites & Requirements
- **Runtime:** Node.js (v18+) or Bun.
- **Browser Automation:** Playwright with Chrome DevTools Protocol (CDP) access.
- **Evasion Framework:** `puppeteer-extra-plugin-stealth` or Camoufox to bypass bot detection.
- **Asset Processing:** `sharp` (libvips) for high-performance image optimization.
- **CSS Tooling:** `postcss`, `cssnano`, and `purgecss` for static dead-code elimination.
- **AST Parsing:** `htmlparser2` and `Mitosis` for framework component translation.
- **Network:** Access to rotating residential proxies (for bypassing Cloudflare/WAF).
- **Legal:** Clear understanding of ToS and CFAA implications. Tool must be positioned for personal, self-hosted use.

## Phase 1: Foundation, CLI, & Stealth Architecture
1. **Initialize Project:** Create the Node.js repository with TypeScript.
2. **Single-URL CLI:** Build a command-line interface (e.g., using `commander`) that accepts a single target URL (e.g., `uncage https://target.com`) and fully automates the clone.
3. **Stealth Browser Setup:** Instantiate Playwright with stealth plugins (spoofed User-Agent, WebGL, hardware concurrency).
4. **CDP Connection:** Establish a direct CDP WebSocket connection to the browser instance.
5. **Proxy Integration:** Add configuration for rotating residential proxies.

## Phase 2: Asset Interception & Routing
1. **Network Layer:** Use Playwright's network routing to intercept all outbound HTTP/HTTPS requests.
2. **CORS Bypass:** Ignore CORS headers at the protocol level.
3. **Asset Harvesting:** Stream response bodies (images, fonts, scripts) directly to local memory/disk.
4. **Link Rewriting:** Map remote URLs to local relative paths (`./assets/...`).

## Phase 3: DOM & State Extraction
1. **Target Navigation:** Go to target URL and wait for `networkidle`.
2. **DOMSnapshot Invocation:** Call `DOMSnapshot.captureSnapshot` with `computedStyles`, `includeDOMRects`, and `includePaintOrder`.
3. **Shadow DOM Traversal:** Identify and flatten `mode: 'closed'` shadow roots.
4. **Style Extraction:** Gather all computed inline styles and attached stylesheet data.

## Phase 4: Optimization Pipeline
1. **Image Processing:** Pass harvested images through `sharp` to generate WebP/AVIF variants across multiple breakpoints. Inject `<picture>` tags.
2. **CSS Cleansing (PurgeCSS):** Run static analysis to strip unused classes from the computed CSS.
3. **CSS Minification:** Use `postcss-preset-env` and `cssnano` to minify and prefix the final CSS.

## Phase 5: AST Transformation & Interactivity
1. **HTML to AST:** Convert the optimized HTML output into a DOM AST.
2. **Heuristic Componentization:** Identify repeating structural blocks (navbars, cards).
3. **Mitosis Integration:** Translate standard AST into Mitosis JSON AST.
4. **Framework Compilation:** Output React (`.jsx`/`.tsx`), Vue, or Svelte components.

## Phase 6: Open-Source Launch Prep
1. **Documentation:** Write a detailed `README.md` explaining CDP usage, limitations, and setup.
2. **Legal Disclaimers:** Add explicit warnings regarding ToS breaches, copyright infringement, and GDPR.
3. **Community Files:** Add `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
4. **GitHub Templates:** Create Issue and Pull Request templates.
