import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium } from 'playwright-extra';
import * as cheerio from 'cheerio';
import type { Route } from 'playwright';
import type { ExtractorOptions } from './types.js';
import { optimizeImages } from './optimizer.js';
import { STATIC_EXTENSIONS, sanitizeFileName } from './constants.js';
import { type Result, ok, err, tryCatch, tryCatchAsync } from './result.js';
import {
  canCrawlUrl,
  canonicalDocumentUrl,
  crawlWaitMs,
  discoverSitemapCandidates,
  isEligibleCrawlCandidate,
  parseRobotsTxt,
  rankCrawlCandidates,
  type CrawlCandidate,
  type RobotsPolicy,
} from './crawl-policy.js';


interface AssetMap {
  [remoteUrl: string]: string;
}

// Memory tracking helper.
// Uses RSS + external (Buffer/ArrayBuffer lives outside the V8 heap), since
// the largest memory consumers here are downloaded asset bodies, not JS objects.
function getMemoryMB(): number {
  const m = process.memoryUsage();
  return (m.rss + m.external) / 1024 / 1024;
}

function checkMemoryLimit(maxMemoryMB: number, context: string): boolean {
  if (maxMemoryMB <= 0) return true; // unlimited
  const current = getMemoryMB();
  if (current > maxMemoryMB) {
    console.log(`        ⚠️  Memory limit exceeded (${current.toFixed(1)}MB > ${maxMemoryMB}MB) at ${context}`);
    return false;
  }
  return true;
}

function logMemory(context: string): void {
  const mem = getMemoryMB();
  if (mem > 100) { // Only log if significant
    console.log(`        💾 Memory: ${mem.toFixed(1)}MB (${context})`);
  }
}

// CSP Analysis - track and report Content Security Policies
interface CSPPolicy {
  url: string;
  policy: string;
  isReportOnly: boolean;
  directives: Record<string, string[]>;
}

function parseCSP(policy: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const directive = parts[0];
    if (!directive) continue;
    const values = parts.slice(1);
    directives[directive] = values;
  }
  return directives;
}

function analyzeCSP(policies: CSPPolicy[], url: string, policy: string, isReportOnly: boolean): void {
  const directives = parseCSP(policy);
  policies.push({ url, policy, isReportOnly, directives });
  
  // Check for restrictive directives that might block assets
  const restrictive = ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src'];
  for (const dir of restrictive) {
    if (directives[dir]) {
      const values = directives[dir];
      // Check for overly restrictive values
      const hasNone = values.includes("'none'");
      const hasSelfOnly = values.length === 1 && values[0] === "'self'";
      const hasInline = values.includes("'unsafe-inline'");
      const hasEval = values.includes("'unsafe-eval'");
      
      if (hasNone || hasSelfOnly) {
        console.log(`        🔒 CSP ${isReportOnly ? 'Report-Only' : 'Enforced'}: ${dir} = ${values.join(' ')} (may block external assets)`);
      }
      if (!hasInline && dir === 'script-src') {
        console.log(`        🔒 CSP: script-src lacks 'unsafe-inline' - inline scripts blocked`);
      }
      if (!hasEval && dir === 'script-src') {
        console.log(`        🔒 CSP: script-src lacks 'unsafe-eval' - eval() blocked`);
      }
    }
  }
}

function reportCSP(policies: CSPPolicy[]): void {
  if (policies.length === 0) return;
  console.log(`\n  [CSP Analysis] Found ${policies.length} Content Security Policies:`);
  const byUrl = new Map<string, CSPPolicy[]>();
  for (const csp of policies) {
    if (!byUrl.has(csp.url)) byUrl.set(csp.url, []);
    byUrl.get(csp.url)!.push(csp);
  }
  for (const [url, policies] of byUrl) {
    console.log(`    ${url}:`);
    for (const p of policies) {
      console.log(`      ${p.isReportOnly ? 'Report-Only' : 'Enforced'}: ${p.policy.slice(0, 120)}${p.policy.length > 120 ? '...' : ''}`);
    }
  }
}

// URL pattern matching (glob-style: * ? [range])
function matchUrlPattern(url: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false; // no patterns = no match
  for (const pattern of patterns) {
    const regex = globToRegExp(pattern);
    if (regex && regex.test(url)) return true;
  }
  return false;
}

// Convert a glob pattern (* ? [abc] [a-z]) to an anchored RegExp.
// Returns null for malformed patterns (unbalanced brackets).
export function globToRegExp(pattern: string): RegExp | null {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      re += '.*';
    } else if (ch === '?') {
      re += '.';
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) return null; // unbalanced bracket — treat as non-matching
      let cls = pattern.slice(i + 1, close);
      // A leading '!' or '^' means negation in globs.
      if (cls.startsWith('!')) cls = '^' + cls.slice(1);
      re += `[${cls}]`;
      i = close;
    } else if (ch !== undefined && '.+^${}()|\\'.includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  try {
    return new RegExp(`^${re}$`);
  } catch {
    return null;
  }
}

export function shouldFetchUrl(url: string, allowUrls: string[], blockUrls: string[]): boolean {
  // Block list takes precedence
  if (matchUrlPattern(url, blockUrls)) {
    return false;
  }
  // Allow list: if specified, only allow matching URLs
  if (allowUrls.length > 0 && !matchUrlPattern(url, allowUrls)) {
    return false;
  }
  return true;
}

// Deterministic raw-HTML filename for a route. The route's own content can
// collide after sanitization (e.g. /about/us vs /about-us both -> about-us),
// so append a short hash of the full route to guarantee uniqueness.
export function rawFileNameForRoute(route: string): string {
  if (route === '/index' || route === '/') return 'captured-raw.html';
  const safeRoute = sanitizeFileName(route.replace(/^\//, '').replace(/\//g, '-'));
  const hash = crypto.createHash('md5').update(route).digest('hex').slice(0, 6);
  return `captured-raw-${safeRoute}-${hash}.html`;
}

// Patterns for Framer runtime bundles that power animations (module-level so both
// the crawl-phase route handler and the post-crawl dependency scanner can use it)
const RUNTIME_PATTERNS = [
  /\bframer\b.*\.js$/i,
  /\bmotion\b.*\.js$/i,
  /\breact\b.*\.js$/i,
  /\bshared-lib\b.*\.js$/i,
  /\brolldown-runtime\b.*\.js$/i,
  /\bscript_main\b.*\.js$/i,
];

export async function extract(
  baseUrl: string, 
  outputName: string, 
  options: ExtractorOptions = {}
): Promise<{ pages: Record<string, string>, outputDir: string, originalHead: string, runtimeScripts: string[] }> {
  const safeOutputName = sanitizeFileName(outputName) || 'extracted-site';
  const outputDir = path.join(process.cwd(), 'output', safeOutputName);

  // Live progress callback (used by the web UI); console.log stays for the CLI.
  const onProgress = options.onProgress;
  const report = (kind: 'phase' | 'page' | 'asset' | 'warn' | 'done' | 'error', message: string): void => {
    try { onProgress?.({ kind, message }); } catch { /* listener must never break the crawl */ }
  };
  const assetsDir = path.join(outputDir, 'public', 'assets');
  const imgDir = path.join(assetsDir, 'images');
  const cssDir = path.join(assetsDir, 'css');
  const jsDir = path.join(assetsDir, 'js');
  const fontDir = path.join(assetsDir, 'fonts');
  const mediaDir = path.join(assetsDir, 'media');
  const wasmDir = path.join(assetsDir, 'wasm');
  const dataDir = path.join(assetsDir, 'data');


  await fs.mkdir(imgDir, { recursive: true });
  await fs.mkdir(cssDir, { recursive: true });
  await fs.mkdir(jsDir, { recursive: true });
  await fs.mkdir(fontDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(wasmDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const baseUrlObj = new URL(baseUrl);
  const baseOrigin = baseUrlObj.origin;
  const maxDepth = options.maxDepth;
  const priorityOnly = options.priorityOnly === true;
  const respectRobots = options.respectRobots !== false;
  let robotsPolicy: RobotsPolicy = { rules: [], sitemapUrls: [] };

  if (respectRobots) {
    console.log('  [Crawl Policy] Reading robots.txt...');
    report('phase', 'Reading robots.txt');
    try {
      const response = await fetch(`${baseOrigin}/robots.txt`, { headers: { 'User-Agent': 'Uncage' } });
      if (response.ok) {
        robotsPolicy = parseRobotsTxt(await response.text());
        if (robotsPolicy.crawlDelayMs !== undefined) {
          console.log(`  [Crawl Policy] robots.txt requests a ${robotsPolicy.crawlDelayMs / 1000}s crawl delay.`);
        }
      } else if (response.status !== 404) {
        const message = `Could not read robots.txt (HTTP ${response.status}); continuing without restrictions.`;
        console.log(`  ⚠️ ${message}`);
        report('warn', message);
      }
    } catch (error) {
      const message = `Could not read robots.txt; continuing without restrictions (${error instanceof Error ? error.message : String(error)}).`;
      console.log(`  ⚠️ ${message}`);
      report('warn', message);
    }

    if (!canCrawlUrl(baseUrl, robotsPolicy)) {
      throw new Error(`robots.txt disallows crawling the seed URL: ${baseUrl}`);
    }
  } else {
    console.log('  [Crawl Policy] Ignoring robots.txt by request.');
  }

  console.log('  [Crawl Policy] Discovering sitemaps...');
  report('phase', 'Discovering sitemaps');
  const sitemapDiscovery = await discoverSitemapCandidates(baseOrigin, robotsPolicy.sitemapUrls, robotsPolicy);
  for (const warning of sitemapDiscovery.warnings) {
    console.log(`  ⚠️ ${warning}`);
    report('warn', warning);
  }
  if (sitemapDiscovery.candidates.length > 0) {
    console.log(`  [Crawl Policy] Found ${sitemapDiscovery.candidates.length} eligible sitemap page(s).`);
  }

  const assetMap: AssetMap = {};
  const inFlightDownloads = new Set<string>();
  const runtimeScripts: string[] = [];  // Framer/motion runtime JS chunks to preserve
  const cspPolicies: CSPPolicy[] = [];  // per-run (re-entrant); was module-level

  const isHeadless = options.headless !== false;
  console.log(`  [1/5] Launching stealth browser (${isHeadless ? 'headless' : 'headful'})...`);
  report('phase', 'Launching stealth browser');
  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--disable-web-security', '--disable-site-isolation-trials', '--no-sandbox'],
  });

  let signalExitCode: number | null = null;
  const cleanupBrowser = () => {
    signalExitCode = 130; // 128 + SIGINT
    void browser.close().catch(() => {});
  };
  const onSigint = () => cleanupBrowser();
  const onSigterm = () => {
    signalExitCode = 143; // 128 + SIGTERM
    void browser.close().catch(() => {});
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    const isSafeMode = options.safeMode ?? false;
    if (isSafeMode) {
      console.log('  [Safe Mode] JavaScript disabled - fetching static HTML only');
    }
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: !isSafeMode, // Disable JS in safe mode
    });

    console.log('  [2/5] Setting up global network interceptors...');
    const allowUrls = options.allowUrls ?? [];
    const blockUrls = options.blockUrls ?? [];
    if (allowUrls.length > 0) console.log(`  [URL Filter] Allow: ${allowUrls.join(', ')}`);
    if (blockUrls.length > 0) console.log(`  [URL Filter] Block: ${blockUrls.join(', ')}`);
    
    await context.route('**/*', async (route: Route) => {
      const request = route.request();
      const requestUrl = request.url();

      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) {
        await route.continue().catch(() => {});
        return;
      }

      // URL allowlist/blocklist filtering.
      // The flags are documented as *asset* filters, so never apply them to
      // document navigations — aborting those would kill the crawl.
      const isDocumentNavigation = request.resourceType() === 'document';

      if (!isDocumentNavigation && !shouldFetchUrl(requestUrl, allowUrls, blockUrls)) {
        await route.abort('blockedbyclient').catch(() => {});
        return;
      }

      // Mark in-flight eagerly to prevent concurrent duplicate downloads.
      // Must always be cleared (finally below), even when the response is skipped
      // or fails — otherwise the URL is permanently blocked from future downloads.
      const shouldDownload = !assetMap[requestUrl] && !inFlightDownloads.has(requestUrl);
      if (shouldDownload) inFlightDownloads.add(requestUrl);

      try {
        const response = await route.fetch();
        const headers = response.headers();

        // CSP Analysis - detect and report restrictive policies
        const cspHeader = headers['content-security-policy'];
        const cspReportHeader = headers['content-security-policy-report-only'];
        if (cspHeader) analyzeCSP(cspPolicies, requestUrl, cspHeader, false);
        if (cspReportHeader) analyzeCSP(cspPolicies, requestUrl, cspReportHeader, true);

        // Inject permissive CORS and strip restrictive security/decompression headers
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-methods'] = 'GET, POST, OPTIONS, HEAD';
        headers['access-control-allow-headers'] = '*';
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        delete headers['content-length'];

        const resourceType = request.resourceType();
        const typeMap: Record<string, string> = {
          image: imgDir,
          stylesheet: cssDir,
          script: jsDir,
          font: fontDir,
          media: mediaDir,
        };

        let targetDir = typeMap[resourceType];
        const contentType = (headers['content-type'] || '').toLowerCase();
        const urlPath = new URL(requestUrl).pathname.toLowerCase();

        // Handle assets fetched via XHR/fetch or with generic resource types
        if (!targetDir) {
          if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(urlPath)) {
            targetDir = imgDir;
          } else if (contentType.includes('css') || urlPath.endsWith('.css')) {
            targetDir = cssDir;
          } else if (contentType.includes('javascript') || contentType.includes('ecmascript') || /\.(js|mjs)$/.test(urlPath)) {
            targetDir = jsDir;
          } else if (contentType.startsWith('font/') || /\.(woff2?|ttf|otf|eot)$/.test(urlPath)) {
            targetDir = fontDir;
          } else if (contentType.startsWith('video/') || contentType.startsWith('audio/') || /\.(mp4|webm|mp3|wav|ogg)$/.test(urlPath)) {
            targetDir = mediaDir;
          } else if (contentType.includes('wasm') || /\.wasm$/.test(urlPath)) {
            targetDir = wasmDir;
          } else if (contentType.includes('json') || /\.json$/.test(urlPath)) {
            targetDir = dataDir;
          }
        }

        let savedBody: Buffer | null = null;
        // Never save 206 Partial Content (media is fetched as multiple range
        // requests against the same URL — saving one range corrupts the file)
        // or 204 No Content. Only full 2xx bodies belong on disk.
        const status = response.status();
        if (targetDir && shouldDownload && status !== 206 && status !== 204 && response.ok()) {
          const body = await response.body();
          savedBody = body;
          const parsedUrl = new URL(requestUrl);
          const rawName = path.basename(parsedUrl.pathname) || 'asset';
          const ext = guessExtension(resourceType, headers['content-type'] || '', rawName);
          const urlHash = crypto.createHash('md5').update(requestUrl).digest('hex').slice(0, 8);

          let baseName = rawName.includes('.') ? rawName.substring(0, rawName.lastIndexOf('.')) : rawName;
          baseName = sanitizeFileName(baseName) || 'asset';
          const fileName = `${baseName}-${urlHash}${ext}`;

          const savePath = path.join(targetDir, fileName);
          await fs.writeFile(savePath, body);

          const relativePath = `/assets/${path.basename(targetDir)}/${fileName}`;
          assetMap[requestUrl] = relativePath;

          // Track Framer runtime chunks for animation preservation
          if (targetDir === jsDir && RUNTIME_PATTERNS.some(p => p.test(fileName))) {
            if (!runtimeScripts.includes(relativePath)) {
              runtimeScripts.push(relativePath);
            }
          }
        }

        // Fulfill with the decoded body to avoid content-encoding mismatch;
        // reuse the buffer already materialized for the save path when present
        const fulfilBody = savedBody ?? await response.body();
        await route.fulfill({
          status: response.status(),
          headers,
          body: fulfilBody
        });
      } catch {
        await route.continue().catch(() => {});
      } finally {
        if (shouldDownload) inFlightDownloads.delete(requestUrl);
      }
    });

    console.log('  [3/5] Crawling pages...');
    report('phase', 'Crawling pages');
    const visited = new Set<string>();
    // Keep the seed's own trailing slash to avoid a pointless server redirect
    const initialPath = baseUrlObj.pathname || '/';
    const initialUrl = `${baseOrigin}${initialPath}${baseUrlObj.search || ''}`;
    const candidates = new Map<string, CrawlCandidate>();
    const addCandidate = (candidate: CrawlCandidate): void => {
      const canonical = canonicalDocumentUrl(candidate.url);
      if (!canonical || new URL(canonical).origin !== baseOrigin || !canCrawlUrl(canonical, robotsPolicy)) return;
      const existing = candidates.get(canonical);
      if (!existing) {
        candidates.set(canonical, { ...candidate, url: canonical, inboundLinks: candidate.inboundLinks ?? 0 });
        return;
      }
      existing.depth = Math.min(existing.depth, candidate.depth);
      existing.isSeed = Boolean(existing.isSeed || candidate.isSeed);
      existing.isNavigation = Boolean(existing.isNavigation || candidate.isNavigation);
      existing.inboundLinks = (existing.inboundLinks ?? 0) + (candidate.inboundLinks ?? 0);
      existing.sitemapPriority = Math.max(existing.sitemapPriority ?? -1, candidate.sitemapPriority ?? -1);
    };
    addCandidate({ url: initialUrl, depth: 0, isSeed: true });
    for (const entry of sitemapDiscovery.candidates) {
      addCandidate({ url: entry.url, depth: 1, sitemapPriority: entry.priority });
    }
    // Store file paths instead of HTML content to save memory
    const pageFiles: Record<string, string> = {}; // route -> raw file path
    let originalHead = '';
    let headSourceUrl = '';
    const maxPages = options.maxPages ?? 50;
    const pageTimeout = options.timeout ?? 30000;
    const maxMemoryMB = options.maxMemory ?? 0;
    let lastNavigationStartedAt: number | undefined;

    while (visited.size < maxPages) {
      const nextCandidate = [...candidates.values()]
        .filter((candidate) => !visited.has(candidate.url) && isEligibleCrawlCandidate(candidate, maxDepth, priorityOnly))
        .sort(rankCrawlCandidates)[0];
      if (!nextCandidate) break;
      const currentUrl = nextCandidate.url;
      visited.add(currentUrl);

      if (lastNavigationStartedAt !== undefined) {
        const jitterMs = 200 + Math.floor(Math.random() * 300);
        const waitMs = crawlWaitMs(robotsPolicy.crawlDelayMs, lastNavigationStartedAt, Date.now(), jitterMs);
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      lastNavigationStartedAt = Date.now();

      console.log(`        Crawling: ${currentUrl}`);
      report('page', `Crawling: ${currentUrl}`);
      const page = await context.newPage();

try {
        const navResponse = await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: pageTimeout });
        if (navResponse && !navResponse.ok()) {
          console.log(`        Skipping non-OK status (${navResponse.status()}) for ${currentUrl}`);
          continue;
        }

        if (!isSafeMode) {
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          
          // Smoothly scroll down to trigger IntersectionObservers, lazy-loaded media, and scroll animations
          await page.evaluate(async () => {
            const step = Math.max(300, Math.floor(window.innerHeight / 2));
            // SPAs may scroll on body, documentElement, or a wrapper — measure both roots
            const pageHeight = () => Math.max(
              document.body ? document.body.scrollHeight : 0,
              document.documentElement ? document.documentElement.scrollHeight : 0
            );
            let current = 0;
            let maxScroll = pageHeight();
            const start = Date.now();
            // Cap the scroll by wall-clock time (3s) to avoid unbounded stalls on
            // infinite-scroll pages; pageTimeout only covers navigation, not this loop.
            while (current <= maxScroll && current < 50000 && Date.now() - start < 3000) {
              window.scrollTo(0, current);
              window.dispatchEvent(new Event('scroll'));
              await new Promise(r => setTimeout(r, 80));
              current += step;
              maxScroll = Math.max(maxScroll, pageHeight());
            }
            await new Promise(r => setTimeout(r, 300));
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event('scroll'));
          }).catch(() => {});

await new Promise(r => setTimeout(r, 300));
        }

        // Get HTML - use page.content() in safe mode (no JS), page.evaluate() in normal mode
        let html: string;
        if (isSafeMode) {
          html = await page.content();
        } else {
          html = await page.evaluate<string>(`(() => {
            function getAdoptedStyles(root) {
              let css = '';
              if (root.adoptedStyleSheets && root.adoptedStyleSheets.length > 0) {
                for (const sheet of root.adoptedStyleSheets) {
                  try {
                    css += Array.from(sheet.cssRules).map(rule => rule.cssText).join('\\n') + '\\n';
                  } catch (e) {}
                }
              }
              return css;
            }

            function cloneWithShadows(node) {
              if (!node) return null;
              const clone = node.cloneNode(false);
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'INPUT' || node.tagName === 'SELECT') {
                  if (node.type === 'checkbox' || node.type === 'radio') {
                    if (node.checked) clone.setAttribute('checked', '');
                    else clone.removeAttribute('checked');
                  } else if (node.value !== undefined) {
                    clone.setAttribute('value', node.value);
                  }
                } else if (node.tagName === 'OPTION') {
                  if (node.selected) clone.setAttribute('selected', '');
                  else clone.removeAttribute('selected');
                }
                if (node.tagName === 'TEMPLATE' && node.content) {
                  for (let child of node.content.childNodes) {
                    clone.content.appendChild(cloneWithShadows(child));
                  }
                }
                if (node.shadowRoot) {
                  const template = document.createElement('template');
                  template.setAttribute('shadowrootmode', node.shadowRoot.mode || 'open');
                  const adoptedCss = getAdoptedStyles(node.shadowRoot);
                  if (adoptedCss) {
                    const styleElement = document.createElement('style');
                    styleElement.textContent = adoptedCss;
                    template.content.appendChild(styleElement);
                  }
                  for (let child of node.shadowRoot.childNodes) {
                    template.content.appendChild(cloneWithShadows(child));
                  }
                  clone.appendChild(template);
                }
              }
              if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TEXTAREA') {
                clone.textContent = node.value;
              } else {
                for (let child of node.childNodes) {
                  const clonedChild = cloneWithShadows(child);
                  if (clonedChild) clone.appendChild(clonedChild);
                }
              }
              return clone;
            }

            let outHtml = '';
            if (document.doctype) {
              const dt = document.doctype;
              outHtml += '<!DOCTYPE ' + dt.name +
                (dt.publicId ? ' PUBLIC "' + dt.publicId + '"' : '') +
                (!dt.publicId && dt.systemId ? ' SYSTEM' : '') + 
                (dt.systemId ? ' "' + dt.systemId + '"' : '') + 
                '>\\n';
            }
            const clonedDoc = cloneWithShadows(document.documentElement);
            const globalCss = getAdoptedStyles(document);
            if (globalCss) {
              const head = clonedDoc.tagName === 'HEAD' ? clonedDoc : clonedDoc.querySelector('head');
              if (head) {
                const styleElement = document.createElement('style');
                styleElement.textContent = globalCss;
                head.appendChild(styleElement);
              }
            }
            outHtml += clonedDoc.outerHTML;
            return outHtml;
          })()`);
        }


        if (!originalHead) {
          const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
          if (headMatch && headMatch[1]) {
            originalHead = headMatch[1];
            headSourceUrl = currentUrl;
          }
        }

        const $ = cheerio.load(html);
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

          try {
            const linkUrl = new URL(href, currentUrl);
            if (linkUrl.origin === baseOrigin) {
              const ext = linkUrl.pathname.split('.').pop()?.toLowerCase();
              if (ext && STATIC_EXTENSIONS.has(ext)) {
                return;
              }
              addCandidate({
                url: linkUrl.href,
                depth: nextCandidate.depth + 1,
                isNavigation: $(el).closest('nav, [role="navigation"]').length > 0,
                inboundLinks: 1,
              });
            }
          } catch {}
        });


        const landedUrl = page.url();
        if (landedUrl && !landedUrl.startsWith('about:') && !landedUrl.startsWith('chrome:')) {
          try {
            const landedUrlObj = new URL(landedUrl);
            if (landedUrlObj.origin === baseOrigin) {
              let pathname = landedUrlObj.pathname;
              if (pathname === '/') pathname = '/index';
              if (pathname.endsWith('/') && pathname.length > 1) pathname = pathname.slice(0, -1);
              
              // Write raw HTML to disk immediately (lazy writing) to save memory
              const rawFileName = rawFileNameForRoute(pathname);
              const rawFilePath = path.join(outputDir, rawFileName);
              await fs.writeFile(rawFilePath, html);
              pageFiles[pathname] = rawFilePath;
              
              // Check memory limit
              if (!checkMemoryLimit(maxMemoryMB, `after writing ${pathname}`)) {
                console.log(`        Stopping crawl due to memory limit`);
                break;
              }
              logMemory(`after ${pathname}`);
            } else {
              console.log(`        Redirected to external origin (${landedUrlObj.origin}); skipped page capture.`);
            }
          } catch {}
        }
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.log(`        Failed to crawl ${currentUrl}: ${errorMsg}`);
      } finally {
        await page.close();
      }

    }


    console.log(`  [4/5] Rewriting asset URLs for ${Object.keys(pageFiles).length} pages...`);
    report('phase', 'Rewriting asset URLs');

    // Rewrite pages & originalHead - read from disk (lazy loading)
    const pages: Record<string, string> = {};
    for (const [route, rawFilePath] of Object.entries(pageFiles)) {
      let routePath = route === '/index' ? '/' : route;
      const pageUrl = `${baseOrigin}${routePath}`;
      
      // Read raw HTML from disk
      let htmlContent: string;
      try {
        htmlContent = await fs.readFile(rawFilePath, 'utf-8');
      } catch (e) {
        console.log(`        Warning: Failed to read raw HTML for ${route}: ${e}`);
        continue;
      }
      
      const rewrittenResult = rewriteHtml(htmlContent, pageUrl, assetMap, baseOrigin, isSafeMode);
      if (!rewrittenResult.ok) {
        console.log(`        Warning: HTML rewrite failed for ${route}: ${rewrittenResult.error.message}`);
        continue;
      }
      const rewritten = rewrittenResult.value;
      const rawFileName = rawFileNameForRoute(route);
      await fs.writeFile(path.join(outputDir, rawFileName), rewritten);
      pages[route] = rewritten;
    }

    if (originalHead) {
      // Resolve relative refs against the page the head was captured from —
      // a seed like /blog/post has head-relative urls() that must not resolve to root
      const headResult = rewriteHtml(originalHead, headSourceUrl || baseOrigin, assetMap, baseOrigin, isSafeMode);
      if (headResult.ok) {
        originalHead = headResult.value;
      } else {
        console.log(`        Warning: Head rewrite failed: ${headResult.error.message}`);
      }
    }

    // Rewrite downloaded CSS files
    const cssResult = await rewriteCssFiles(cssDir, assetMap, baseOrigin);
    if (!cssResult.ok) {
      console.log(`        Warning: CSS rewrite failed: ${cssResult.error.message}`);
    }

    // Optimize harvested images
    await optimizeImages(imgDir);

    if (!options.skipDeps) {
      console.log('  [5/5] Scanning JS modules for missing dependencies...');
      report('phase', 'Scanning JS module dependencies');
      await downloadMissingDeps(outputDir, assetMap, baseOrigin, runtimeScripts, allowUrls, blockUrls);
    } else {
      console.log('  [5/5] Skipping recursive JS module dependency scan (--skip-deps)');
      report('phase', 'Skipping JS dependency scan');
    }

    // Rewrite downloaded JS files (must run after downloadMissingDeps to rewrite all chunks)
    const jsResult = await rewriteJsFiles(outputDir, assetMap, baseOrigin);
    if (!jsResult.ok) {
      console.log(`        Warning: JS rewrite failed: ${jsResult.error.message}`);
    }

    // Write final asset map to disk after all dynamic dependencies have been discovered
    await fs.writeFile(path.join(outputDir, 'asset-map.json'), JSON.stringify(assetMap, null, 2));

    // CSP Analysis Report
    reportCSP(cspPolicies);

    report('done', `Crawl complete: ${Object.keys(pages).length} page(s) captured`);
    return { pages, outputDir, originalHead, runtimeScripts };


  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    // SIGINT may have closed the browser already; never let a second close() mask the original error
    try { await browser.close(); } catch {}
    // Preserve the signal's conventional exit code now that cleanup has run.
    if (signalExitCode !== null) process.exitCode = signalExitCode;
  }
}

export function rewriteHtml(html: string, pageUrl: string, assetMap: AssetMap, baseOrigin: string, isSafeMode = false): Result<string, Error> {
  return tryCatch(() => {
    let result = html;

    // Remove tracking and bot scripts BEFORE inline-script content is replaced with
    // placeholders — the CF beacon pattern matches on script body text and would
    // otherwise never match a placeholder.
    result = result.replace(/<script\b[^>]*>[^<]*__CF\$cv\$params[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<iframe[^>]*visibility:\s*hidden[^>]*>[\s\S]*?<\/iframe>/gi, '');
    result = result.replace(/<script[^>]*cdn-cgi[^>]*>[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<script[^>]*cf-beacon[^>]*>[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<link[^>]*cdn-cgi[^>]*>/gi, '');

    // Safe mode: strip all inline scripts and event handlers (JS is disabled)
    if (isSafeMode) {
      // Remove inline scripts (no src attribute) - keep external scripts for reference
      result = result.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
      // Remove event handlers (on*)
      result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
      // Remove javascript: URLs
      result = result.replace(/(href|action)\s*=\s*["']javascript:[^"']*["']/gi, '$1="#"');
    }

    // Protect inline script contents from blind wholesale URL string replacements.
    // NOTE: this intentionally uses a naive `</script>` terminator. A literal
    // `</script>` inside inline JS is invalid HTML and would have already ended
    // the element during the original page load, so well-formed captures never
    // contain that sequence inside script bodies.
    const scriptContents: string[] = [];
    result = result.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (match, openTag, innerContent, closeTag) => {
      if (!innerContent.trim()) return match;
      const placeholder = `__UNCAGE_SCRIPT_CONTENT_${scriptContents.length}__`;
      scriptContents.push(innerContent);
      return `${openTag}${placeholder}${closeTag}`;
    });

    // 1. Sort URLs by length descending to prevent prefix collision
    const sortedUrls = Object.keys(assetMap).sort((a, b) => b.length - a.length);
    for (const remoteUrl of sortedUrls) {
      const localPath = assetMap[remoteUrl];
      if (!localPath) continue;
      const escaped = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), localPath);

      // Replace HTML-entity-encoded URLs (& -> &amp;)
      if (remoteUrl.includes('&')) {
        const htmlEncodedUrl = remoteUrl.replace(/&/g, '&amp;');
        const escapedHtml = htmlEncodedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedHtml, 'g'), localPath);
      }
    }

    // 1.5 Convert same-origin absolute intra-site links (e.g. href="https://mysite.com/about") to root-relative (href="/about")
    const escapedOrigin = baseOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(href|action)=["']${escapedOrigin}(/[^"']*)?["']`, 'gi'), (match, attr, pathStr) => {
      return `${attr}="${pathStr || '/'}"`;
    });

    // 2. Rewrite root-relative same-origin assets
    result = result.replace(/(src|href|poster)=["']\/([^"']+)["']/g, (match, attr, filePath) => {
      const fullUrl = `${baseOrigin}/${filePath}`;
      if (assetMap[fullUrl]) {
        return `${attr}="${assetMap[fullUrl]}"`;
      }
      return match;
    });

    // 2.5 Rewrite protocol-relative asset URLs (//cdn.example.com/lib.js)
    result = result.replace(/(src|href|poster)=["'](\/\/[^"']+)["']/g, (match, attr, protoRel) => {
      for (const scheme of ['https:', 'http:']) {
        const mapped = assetMap[`${scheme}${protoRel}`];
        if (mapped) {
          return `${attr}="${mapped}"`;
        }
      }
      return match;
    });

    // 3. Rewrite srcset attributes (split on comma followed by whitespace to avoid breaking URLs with commas)
    result = result.replace(/(srcset\s*=\s*["'])([^"']+)(["'])/gi, (match, prefix, content, suffix) => {
      const rewrittenEntries = content.split(/,\s+/).map((entry: string) => {
        const trimmed = entry.trim();
        const parts = trimmed.split(/\s+/);
        const url = parts[0] || '';
        const descriptor = parts.slice(1).join(' ');
        
        let rewrittenUrl = url;
        try {
          const resolved = new URL(url, pageUrl).href;
          if (assetMap[resolved]) rewrittenUrl = assetMap[resolved]!;
          else {
            const noQuery = resolved.split('?')[0];
            if (noQuery && assetMap[noQuery]) rewrittenUrl = assetMap[noQuery]!;
          }
        } catch {}
        
        return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
      });
      return `${prefix}${rewrittenEntries.join(', ')}${suffix}`;
    });

    // 4. Rewrite inline CSS url()
    result = result.replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/g, (match, remoteUrl) => {
      return assetMap[remoteUrl] ? `url("${assetMap[remoteUrl]}")` : match;
    });
    result = result.replace(/url\(["']?(\/[^"')]+)["']?\)/g, (match, rootPath) => {
      const fullUrl = `${baseOrigin}${rootPath.startsWith('/') ? rootPath : '/' + rootPath}`;
      return assetMap[fullUrl] ? `url("${assetMap[fullUrl]}")` : match;
    });
    result = result.replace(/url\(\s*["']?(?!data:|https?:|\/\/|\/)(\.\.?\/[^"')]+|[^"')\s/][^"')]+)["']?\s*\)/g, (match, relPath) => {
      try {
        const resolved = new URL(relPath, pageUrl).href;
        if (assetMap[resolved]) return `url("${assetMap[resolved]}")`;
        const noQuery = resolved.split('?')[0];
        if (noQuery && assetMap[noQuery]) return `url("${assetMap[noQuery]}")`;
      } catch {}
      return match;
    });

    // Restore protected inline script contents
    result = result.replace(/__UNCAGE_SCRIPT_CONTENT_(\d+)__/g, (_, idx) => {
      return scriptContents[Number(idx)] ?? '';
    });

    return result;
  });
}

async function rewriteCssFiles(cssDir: string, assetMap: AssetMap, baseOrigin: string): Promise<Result<void, Error>> {
  return tryCatchAsync(async () => {
    const files = await fs.readdir(cssDir);
    const sortedUrls = Object.keys(assetMap).sort((a, b) => b.length - a.length);

    for (const file of files) {
      if (!file.endsWith('.css')) continue;
      const filePath = path.join(cssDir, file);
      let content = await fs.readFile(filePath, 'utf-8');

      for (const remoteUrl of sortedUrls) {
        const localPath = assetMap[remoteUrl];
        if (!localPath) continue;
        const escaped = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), localPath);
      }

      // Rewrite root-relative url(/...) in CSS
      content = content.replace(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g, (match, rootPath) => {
        const fullUrl = `${baseOrigin}${rootPath.startsWith('/') ? rootPath : '/' + rootPath}`;
        return assetMap[fullUrl] ? `url("${assetMap[fullUrl]}")` : match;
      });

      // Rewrite relative url(../path) in CSS by resolving against the CSS file's original remote URL
      const cssAssetEntry = Object.entries(assetMap).find(([, local]) => local && path.basename(local) === file);
      const cssRemoteUrl = cssAssetEntry ? cssAssetEntry[0] : null;
      if (cssRemoteUrl) {
        content = content.replace(/url\(\s*["']?(?!data:|https?:|\/\/|\/)(\.\.?\/[^"')]+|[^"')\s/][^"')]+)["']?\s*\)/g, (match, relPath) => {
          try {
            const resolvedUrl = new URL(relPath, cssRemoteUrl).href;
            if (assetMap[resolvedUrl]) {
              return `url("${assetMap[resolvedUrl]}")`;
            }
            // Try without query string
            const noQuery = resolvedUrl.split('?')[0];
            if (noQuery && assetMap[noQuery]) {
              return `url("${assetMap[noQuery]}")`;
            }
          } catch {}
          return match;
        });
      }

      await fs.writeFile(filePath, content);
    }
  });
}

async function rewriteJsFiles(outputDir: string, assetMap: AssetMap, baseOrigin: string): Promise<Result<void, Error>> {
  return tryCatchAsync(async () => {
    const jsDir = path.join(outputDir, 'public', 'assets', 'js');
    let files: string[] = [];
    try {
      files = await fs.readdir(jsDir);
    } catch { return; }

    const sortedUrls = Object.keys(assetMap).sort((a, b) => b.length - a.length);

    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
      const filePath = path.join(jsDir, file);
      let content = await fs.readFile(filePath, 'utf-8');

      for (const remoteUrl of sortedUrls) {
        const localPath = assetMap[remoteUrl];
        if (!localPath) continue;
        const escaped = remoteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), localPath);
      }

      const jsAssetEntry = Object.entries(assetMap).find(([, local]) => local && path.basename(local) === file);
      const jsRemoteUrl = jsAssetEntry ? jsAssetEntry[0] : null;

      // Rewrite hashed sibling relative imports
      content = content.replace(/(["'])(?:\.\/|\.\.\/)([^"']+\.(?:mjs|js))(?:\?[^"']*)?\1/g, (match, quote, depName) => {
        try {
          const remoteUrl = new URL(match.slice(1, -1), jsRemoteUrl || baseOrigin).href;
          if (assetMap[remoteUrl]) {
            const mappedName = path.basename(assetMap[remoteUrl]!);
            return `${quote}./${mappedName}${quote}`;
          }
        } catch {}
        return match;
      });

      await fs.writeFile(filePath, content);
    }
  });
}

async function downloadMissingDeps(
  outputDir: string,
  assetMap: AssetMap,
  baseOrigin: string,
  runtimeScripts: string[],
  allowUrls: string[] = [],
  blockUrls: string[] = []
): Promise<void> {
  const jsDir = path.join(outputDir, 'public', 'assets', 'js');
  // Cap transitive module size to avoid buffering unbounded responses
  const MAX_DEP_BYTES = 50 * 1024 * 1024;
  // Remote URLs already harvested — keys of the map ARE the absolute request URLs
  const downloadedRemote = new Set(Object.keys(assetMap));
  const attempted = new Set<string>();
  const maxDepth = 5;

  for (let depth = 0; depth < maxDepth; depth++) {
    // resolved remote URL -> nothing extra needed (basename derivable from URL)
    const needed = new Map<string, void>();
    let jsFiles: string[] = [];
    try {
      jsFiles = await fs.readdir(jsDir);
    } catch {
      break;
    }

    for (const file of jsFiles) {
      if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;

      const content = await fs.readFile(path.join(jsDir, file), 'utf-8');

      // Resolve each relative import against ITS importing module's own remote URL,
      // mirroring rewriteJsFiles so both agree on asset-map keys
      const jsAssetEntry = Object.entries(assetMap).find(([, local]) => local && path.basename(local) === file);
      const importerRemoteUrl = jsAssetEntry ? jsAssetEntry[0] : null;

      const importRegex = /(["'])(\.{1,2}\/[^"']+\.(?:mjs|js))(?:\?[^"']*)?\1/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        try {
          // Resolve the FULL import specifier (including query string) so this
          // pass keys assetMap identically to rewriteJsFiles, which uses
          // match.slice(1, -1) (query included). Dropping the query here caused
          // duplicate downloads / failed mappings for cache-busted imports.
          const fullMatchInner = match[0].slice(1, -1);
          const resolvedUrl = new URL(fullMatchInner, importerRemoteUrl || `${baseOrigin}/`).href;
          if (!downloadedRemote.has(resolvedUrl) && !attempted.has(resolvedUrl)) {
            needed.set(resolvedUrl, undefined);
          }
        } catch {}
      }
    }

    if (needed.size === 0) break;

    let passFetched = 0;

    for (const remoteUrl of needed.keys()) {
      attempted.add(remoteUrl);

      // Honor the user's URL filters — transitive modules are still remote fetches.
      if (!shouldFetchUrl(remoteUrl, allowUrls, blockUrls)) {
        continue;
      }

      let success = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        let transientFailure = false;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(remoteUrl, {
            signal: controller.signal,
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'referer': baseOrigin + '/',
            },
          });

          if (res.ok) {
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            const contentLength = Number(res.headers.get('content-length') || 0);
            // Some SPAs/CDNs return the app shell (text/html) for unknown .js paths.
            // Never save that as a JS module, and never buffer oversized responses.
            const isJavaScript =
              contentType.includes('javascript') ||
              contentType.includes('ecmascript') ||
              contentType.includes('text/js') ||
              /\.(js|mjs)$/i.test(remoteUrl.split('?')[0] || '');
            if (!isJavaScript || (contentLength > MAX_DEP_BYTES)) {
              try { await res.body?.cancel(); } catch {}
              transientFailure = false;
              break;
            }

            const buffer = await res.arrayBuffer();
            if (buffer.byteLength > MAX_DEP_BYTES) {
              transientFailure = false;
              break;
            }

            const urlHash = crypto.createHash('md5').update(remoteUrl).digest('hex').substring(0, 8);

            const parsedDep = new URL(remoteUrl);
            const rawName = path.basename(parsedDep.pathname);
            let baseName = rawName.includes('.') ? rawName.substring(0, rawName.lastIndexOf('.')) : rawName;
            const ext = rawName.includes('.') ? rawName.substring(rawName.lastIndexOf('.')) : '.js';
            const savedFileName = `${sanitizeFileName(baseName)}-${urlHash}${ext}`;

            await fs.writeFile(path.join(jsDir, savedFileName), Buffer.from(buffer));
            downloadedRemote.add(remoteUrl);
            assetMap[remoteUrl] = `/assets/js/${savedFileName}`;

            // Track Framer/motion runtime chunks discovered transitively too
            if (RUNTIME_PATTERNS.some(p => p.test(savedFileName)) && !runtimeScripts.includes(`/assets/js/${savedFileName}`)) {
              runtimeScripts.push(`/assets/js/${savedFileName}`);
            }
            passFetched++;
            success = true;
            break;
          } else {
            try { await res.body?.cancel(); } catch {}
            // Only transient statuses deserve the retry ladder; 404/403 are terminal
            transientFailure = res.status === 408 || res.status === 429 || res.status >= 500;
          }
        } catch {
          transientFailure = true;
        } finally {
          clearTimeout(timeout);
        }

        if (success || !transientFailure) break;
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt - 1)));
        }
      }
    }

    if (passFetched > 0) {
      console.log(`        Pass ${depth + 1}: Downloaded ${passFetched} missing modules`);
    }
  }
}

function guessExtension(resourceType: string, contentType: string, fileName = ''): string {
  const ct = (contentType || '').toLowerCase().split(';')[0]?.trim() || '';
  const ctMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'image/gif': '.gif',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'text/css': '.css',
    'application/javascript': '.js',
    'text/javascript': '.js',
    'application/x-javascript': '.js',
    'application/wasm': '.wasm',
    'application/json': '.json',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'application/font-woff': '.woff',
    'application/font-woff2': '.woff2',
    'font/ttf': '.ttf',
    'application/x-font-ttf': '.ttf',
    'font/otf': '.otf',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  };

  if (ctMap[ct]) return ctMap[ct];

  if (fileName.includes('.')) {
    const rawExt = fileName.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase();
    if (rawExt && STATIC_EXTENSIONS.has(rawExt)) {
      return `.${rawExt}`;
    }
  }

  const fallback: Record<string, string> = {
    image: '.png',
    stylesheet: '.css',
    script: '.js',
    font: '.woff2',
    media: '.mp4',
  };
  return fallback[resourceType] || '.bin';
}
