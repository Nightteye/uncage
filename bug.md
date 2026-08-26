# Remaining Bugs — Fix List

Status of already-fixed critical bugs (Tier 1, done): `inFlightDownloads` leak, dropped body `<script>` tags, Windows spawn injection, wizard discarding CLI flags, wizard URL trim crash, SIGINT not exiting, masked `browser.close()` errors, unsanitized path printing.

Line numbers below are approximate (source shifted slightly after Tier 1 edits).

---

## HIGH — wrong or unsafe output

### 1. Script injection into exported `index.html`
- **Where:** `src/assembler.ts` ~212-214, `src/formats/html.ts` ~83
- **What:** Crawled page `<title>`, `cleanedHead`, and `framerBreakpointCss` are interpolated into the generated `index.html` without escaping. cheerio decodes entities, so a crafted title like `</title><script>alert(1)</script>` executes when the exported project runs `npm run dev`. Breakpoint CSS can similarly break out of `<style>`.
- **Fix:** Escape `</title`, `</style`, `</script` (case-insensitive) in `originalTitle`, `cleanedHead`, and `framerBreakpointCss` before interpolation, in both the React assembler and the HTML strategy.

### 2. Broken navigation in the static HTML export
- **Where:** `src/formats/html.ts` ~63-76
- **What:**
  - Query-only links (`href="?page=2"`) are rewritten to `index.html?page=2` — i.e., the home page — instead of staying on the current page.
  - Source-relative links (`href="about.html"`) on nested pages (e.g. `/blog/post`) are never resolved against the current page's route, so they point to the wrong path (`blog/about.html`).
- **Fix:** Thread the current page's route into link rewriting; resolve relative hrefs against it; map query-only links to the current page's file.

### 3. PurgeCSS strips runtime-applied classes (breaks Framer styling by default)
- **Where:** `src/optimizer.ts` ~28-32
- **What:** PurgeCSS runs by default but only sees captured HTML. Classes added at runtime by JavaScript (Framer animation/state classes — this tool's primary target) are removed, silently breaking styling. `--no-purge` is the current workaround.
- **Fix:** Feed the captured `public/assets/js/*.js` contents to PurgeCSS as extra `content` entries (it extracts candidate tokens from raw text) and expand the regex safelist (`framer-`, `w-`, motion/animation patterns).

### 4. Animated WebP/GIF destroyed by "optimization"
- **Where:** `src/optimizer.ts` ~66-67
- **What:** Re-encoding animated images without `animated: true` keeps only the first frame.
- **Fix:** Pass `{ animated: true }` to sharp for `.webp`/`.gif` inputs (add gif handling while there).

---

## MEDIUM — correctness / reliability

### 5. `asset-map.json` is stale
- **Where:** `src/extractor.ts` ~380 vs `downloadMissingDeps`
- **What:** The map is written before `downloadMissingDeps` adds late-discovered modules to `assetMap`, so the emitted file is incomplete.
- **Fix:** Move the write after the dependency scan.

### 6. SVG `aria-*`/`data-*` attributes camelCased into invalid React props
- **Where:** `src/parser.ts` ~335-341
- **What:** Inside `<svg>`, `aria-label` becomes `ariaLabel` and `data-framer-name` becomes `dataFramerName` — invalid React DOM properties; attributes are dropped with console warnings.
- **Fix:** In the `isInsideSvg` branch, keep `data-`/`aria-` prefixed names as-is.

### 7. Component-naming logic duplicated (silent breakage risk)
- **Where:** `src/parser.ts` ~530-545 (`compileToReact`) and `src/assembler.ts` ~234-250 (`assemble`)
- **What:** Both derive route→component names with the same dedup-counter algorithm. They agree only because both iterate `pages` in the same insertion order. Any change to normalization or iteration order silently breaks `import X from './pages/X'` wiring.
- **Fix:** Extract one exported route→component-name helper (taking the routes list) and use it in both places.

### 8. Abort timer not cleared on fetch failure; non-OK bodies not consumed
- **Where:** `src/extractor.ts` ~600-615 (`downloadMissingDeps`)
- **What:** `clearTimeout` only runs on success-path resolution; if `fetch` rejects, the 10s timer stays live. Non-OK responses never have their body consumed, holding sockets open in undici.
- **Fix:** Wrap in `try/finally` to clear the timer; call `res.body?.cancel()` (or drain) on non-OK responses.

### 9. Valued "boolean" attributes destroyed
- **Where:** `src/parser.ts` ~380-390
- **What:** `hidden="until-found"` and `download="file.pdf"` are coerced to `={true}`, losing the value.
- **Fix:** Only coerce to a boolean prop when the value is empty or equals the attribute name; otherwise keep the string value.

### 10. `../`-relative links produce invalid router targets
- **Where:** `src/parser.ts` ~360-375
- **What:** `href="../foo"` survives as `to="/../foo"` — invalid for React Router.
- **Fix:** Resolve `./` and `../` prefixes against the page's route (requires passing the current route into `nodeToJsx`/compile, same plumbing as bug 2).

### 11. HTML filename collisions silently overwrite pages
- **Where:** `src/formats/html.ts` ~14-20, 98-100
- **What:** Sanitization maps `/file.name` and `/file-name` to the same `file-name.html`; later pages overwrite earlier ones without warning. `/index` + `/index.html` both map to `index.html`.
- **Fix:** Track used filenames; on collision append a short hash and log a warning.

### 12. Sloppy URL rewriting damages captured HTML
- **Where:** `src/extractor.ts` `rewriteHtml` ~410-470
- **What:**
  - `srcset` is split on every `,` — breaks URLs that contain commas.
  - Inline `style="url(relative.png)"` relative refs are never resolved against the page URL (only absolute/root-relative handled).
  - Blind whole-HTML string replacement also rewrites remote URLs inside inline `<script>` JSON payloads, which can corrupt runtime config that expects the remote origin.
- **Fix:** Split srcset only on `,` followed by whitespace; resolve relative `url()` refs against `pageUrl`; skip `<script>` block contents during wholesale URL replacement (rewrite via cheerio attributes/text instead).

### 13. Browser launched with web security disabled against arbitrary URLs
- **Where:** `src/extractor.ts` ~68-70, ~100-110
- **What:** `--disable-web-security --no-sandbox` plus CORS headers forced to `*` means malicious page JS runs with weakened security in the local browser. Accepted local-tool tradeoff for now.
- **Fix (minimum):** Document it in the README; consider a `--secure` mode that keeps sandbox enabled for trusted-site crawls.

---

## LOW — hygiene / smells

### 14. `STATIC_EXTENSIONS` still duplicated
- **Where:** `src/formats/html.ts` ~8-12 (extractor.ts and parser.ts now import from `src/constants.ts`)
- **Fix:** Import from `./constants.js` (note: the html-format copy lacks css/js/font extensions; the shared superset is the correct behavior for asset-link detection).

### 15. Analytics scripts preserved in exports by default
- **Where:** `src/assembler.ts` ~22-28 (`cleanHead`)
- **What:** Inline scripts containing `gtag`/`analytics` are deliberately kept — they phone home from the user's dev server.
- **Fix:** Strip them by default; add an opt-in `--keep-analytics` CLI flag.

### 16. Non-idempotent assets move in HTML export
- **Where:** `src/formats/html.ts` ~160-177
- **What:** `fs.rename(public/assets, assets)` fails with `ENOTEMPTY`/`EPERM` on Windows when re-exporting over an existing folder, leaving a split layout. `captured-raw*.html` files also remain in the exported project root as clutter.
- **Fix:** Merge directories (copy + delete fallback); clean up `captured-raw*.html` after assembly.

### 17. HTML export drops collected runtime scripts
- **Where:** `src/formats/html.ts` ~106 — `assemble` accepts `runtimeScripts` but ignores it.
- **What:** Framer animation chunks are never loaded in the HTML export, so animations die there.
- **Fix:** Inject the same idempotent runtime loader the React assembler uses.

### 18. Image optimization is sequential and silent
- **Where:** `src/optimizer.ts` ~48-84
- **Fix:** Batch with `Promise.allSettled` (concurrency ~8); log skipped/failed files instead of empty `catch {}`; move temp-file cleanup into `finally`.

### 19. package.json / repo hygiene
- No `engines` field although `extractor.ts` requires global `fetch` (Node >= 18).
- Generated README links to placeholder `https://github.com/your-org/uncage` (`src/formats/html.ts` ~138); real repo is `Nightteye/uncage`.
- `output/` tree and `uncage.zip` are committed; untrack (`git rm -r --cached`) and add to `.gitignore`.

### 20. Dead code
- `usedComponentNames` populated but never read (`src/parser.ts` ~490, `src/assembler.ts` ~230).
- `rawDep` identical to `depName`; `if (!baseOrigin) continue` unreachable (`src/extractor.ts` `downloadMissingDeps`).
- Unreachable `strategies[chosenFormat] || strategies['react-ts']` fallback was removed in Tier 1 — verify no other copies.

### 21. Minor crawl limitations (nice-to-have)
- Seed URL query string silently dropped (`extractor.ts` ~180: only `origin + pathname` is crawled).
- `document.body.scrollHeight` captured once before scrolling — lazy content loaded below the original height mid-scroll is never reached (`extractor.ts` ~215-218).
- Redirects to an external origin still store the page under the landed pathname; `about:blank` landings create junk keys (~340-350).
- Bare `catch (e: any)` reading `e.message` breaks if a non-Error is thrown (~345).

---

## Also planned but not yet done

- Minimal test suite (`node --import tsx --test`) covering parser (script passthrough, SVG attrs, boolean attrs, link normalization) and html-format link rewriting; wire into `package.json` `test`.
- Smoke test both formats: `npx tsx src/index.ts https://example.com -f html` and `-f react-ts`.

---

# AUDIT 2 (2026-08-26) — Verification of yesterday's fixes + new bugs

**STATUS: ALL ITEMS BELOW FIXED AND COMMITTED (2026-08-26).** Kept for history. Remaining known-open items: C5 (now hardened via `\u003c` escaping), C6 (PurgeCSS over-retention — accepted tradeoff), C9 (fixed: seed keeps trailing slash), plus the never-done test suite and smoke runs.

Yesterday's commits verified by two deep reviews + spot checks. Most fixes (inFlight leak, SIGINT, timeout/drain, asset-map ordering, aria/data SVG attrs, boolean attr values, relative link resolution, shared naming map, filename collisions, runtime loader in static HTML, animated gif/webp, batched images) are implemented correctly.

## CRITICAL

### A1. `src/constants.ts` is NOT committed — fresh clone is broken
Untracked locally (`git status ?? src/constants.ts`) and absent from all history, yet parser.ts, extractor.ts, formats/html.ts, index.ts all import from it (commits 44ff14d, d00289c reference it). Any clone/CI checkout fails instantly on missing module. **Also uncommitted:** the fixed `bin/uncage.js` (Windows spawn fix) and `src/wizard.ts`. Commit these first.

### A2. `safeHead` escaping in assembler.ts:217 corrupts output (traded injection for broken pages)
`cleanedHead.replace(/<\/(title|style|script)/gi, '<\\/$1')` escapes the closing tags of scripts `cleanHead` *deliberately keeps* (external CDN scripts, gtag under `--keep-analytics`). The unclosed script swallows `</head><body><div id="root">` until the entry `</script>` → blank/broken app for any site retaining a non-listed head script. Fix: escape ONLY injected text values (title text, CSS string), never serialized element HTML; keep script closer intact or drop kept scripts instead.

## HIGH

### A3. Cloudflare beacon scrubber made dead code by script-content protection (extractor.ts:498)
Protection pass replaces inline script bodies with `__UNCAGE_SCRIPT_CONTENT_N__` before line 498 runs, so `/<script\b[^>]*>[^<]*__CF\$cv\$params[\s\S]*?<\/script>/gi` can never match. Inline CF challenge scripts survive into every export. Run removal BEFORE protection, or match on attributes/type.

### A4. `--keep-analytics` / analytics stripping completely ignored for `-f html`
React formats honor the flag end-to-end; `htmlStrategy.assemble` has no options param and the static pipeline never strips tracking scripts from copied HTML. Commit d00289c's claim is untrue for the static format.

### A5. APNGs flattened by image optimization (optimizer.ts ~82)
`{ animated: true }` was added to webp/gif branches but not png; APNG input gets single-frame output which is always smaller → overwrite guard happily destroys animation.

### A6. `originalHead` rewritten with wrong base URL (extractor.ts ~380)
`rewriteHtml(originalHead, baseOrigin, ...)` uses bare origin as pageUrl; relative `url(img/foo.png)` refs in a shared head captured on `/blog/post` resolve against root instead of the seed path → missed/wrong mappings.

## MEDIUM

### B1. Transitive JS deps missing from `runtimeScripts` (extractor.ts)
Chunks discovered by `downloadMissingDeps` after the crawl are saved but never pattern-tested against RUNTIME_PATTERNS → Framer/motion modules pulled transitively don't get the animation-loader treatment.

### B2. `downloadMissingDeps` resolves imports against site root (extractor.ts ~620,639)
The regex discards `../` segments and builds `${baseOrigin}/${depName}` instead of resolving against the importing module's own remote URL → sibling/parent-dir chunks 404 and are dropped (works only for flat layouts).

### B3. Cache-busted asset links become router targets (parser.ts ~379)
`isStaticAsset` doesn't strip `?query` before extension test (html.ts does): `logo.png?v=2` fails the test → converted to `<Link to="/logo.png">`. Parity fix needed.

### B4. Scroll tracker measures only `document.body.scrollHeight` (extractor.ts ~205)
SPAs scrolling on documentElement or wrappers see constant body height → early loop exit, bottom lazy assets missed despite dynamic re-measure. Measure max(body.scrollHeight, documentElement.scrollHeight).

### B5. Query strings dropped in resolved relative JSX links (parser.ts ~396)
Only `resolved.pathname` used; `team.html?ref=x` loses query. Static strategy preserves it.

### B6. README lists colliding filenames wrong (html.ts ~180)
`assemble()` recomputes `routeToHtmlFilename` without access to compile()'s collision routeMap → disambiguated files listed under names never written.

## LOW

- C1. Protocol-relative assets (`src="//cdn…"` ) never mapped in rewriteHtml step 2.
- C2. Permanent dep failures (404/403) burn full 3×10s retry ladder; no UA/Referer sent.
- C3. `rewriteCssFiles` bare `catch {}` hides per-file failures silently.
- C4. Route handler buffers every response body twice (save branch + fulfill) — memory spike on media-heavy sites.
- C5. Runtime-loader `JSON.stringify(scripts)` lacks `</script` guard (safe today only due to upstream name sanitization).
- C6. PurgeCSS unanchored substring safelist (/active/, /hidden/) over-retains broadly.
- C7. `fs.rm(public)` in html assemble deletes entire public/, brittle if layout grows.
- C8. Placeholder sentinel `__UNCAGE_SCRIPT_CONTENT_0__` could collide with literal source text.
- C9. Seed trailing-slash stripped always → extra redirect hop.

Fix priority: A1 (commit files) → A2 → A3/A4 → A5/A6 → mediums → lows.
