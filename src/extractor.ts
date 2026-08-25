import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { chromium } from 'playwright-extra';
import * as cheerio from 'cheerio';
import type { Route } from 'playwright';
import type { ExtractorOptions } from './types.js';
import { optimizeImages } from './optimizer.js';
import { STATIC_EXTENSIONS, sanitizeFileName } from './constants.js';


interface AssetMap {
  [remoteUrl: string]: string;
}

export async function extract(
  baseUrl: string, 
  outputName: string, 
  options: ExtractorOptions = {}
): Promise<{ pages: Record<string, string>, outputDir: string, originalHead: string, runtimeScripts: string[] }> {
  const safeOutputName = sanitizeFileName(outputName) || 'extracted-site';
  const outputDir = path.join(process.cwd(), 'output', safeOutputName);
  const assetsDir = path.join(outputDir, 'public', 'assets');
  const imgDir = path.join(assetsDir, 'images');
  const cssDir = path.join(assetsDir, 'css');
  const jsDir = path.join(assetsDir, 'js');
  const fontDir = path.join(assetsDir, 'fonts');
  const mediaDir = path.join(assetsDir, 'media');


  await fs.mkdir(imgDir, { recursive: true });
  await fs.mkdir(cssDir, { recursive: true });
  await fs.mkdir(jsDir, { recursive: true });
  await fs.mkdir(fontDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });

  const assetMap: AssetMap = {};
  const inFlightDownloads = new Set<string>();
  const runtimeScripts: string[] = [];  // Framer/motion runtime JS chunks to preserve

  // Patterns for Framer runtime bundles that power animations
  const RUNTIME_PATTERNS = [
    /\bframer\b.*\.js$/i,
    /\bmotion\b.*\.js$/i,
    /\breact\b.*\.js$/i,
    /\bshared-lib\b.*\.js$/i,
    /\brolldown-runtime\b.*\.js$/i,
    /\bscript_main\b.*\.js$/i,
  ];

  const isHeadless = options.headless !== false;
  console.log(`  [1/5] Launching stealth browser (${isHeadless ? 'headless' : 'headful'})...`);
  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--disable-web-security', '--disable-site-isolation-trials', '--no-sandbox'],
  });

  const cleanupBrowser = async () => {
    try { await browser.close(); } catch {}
    process.exit(130);
  };
  process.on('SIGINT', cleanupBrowser);
  process.on('SIGTERM', cleanupBrowser);

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    console.log('  [2/5] Setting up global network interceptors...');
    await context.route('**/*', async (route: Route) => {
      const request = route.request();
      const requestUrl = request.url();

      if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) {
        await route.continue().catch(() => {});
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
          }
        }

        if (targetDir && shouldDownload && response.ok()) {
          const body = await response.body();
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

        // Fulfill with the decoded body to avoid content-encoding mismatch
        const fulfilBody = await response.body();
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
    const visited = new Set<string>();
    const baseUrlObj = new URL(baseUrl);
    const baseOrigin = baseUrlObj.origin;
    const initialUrl = `${baseOrigin}${baseUrlObj.pathname.replace(/\/$/, '') || '/'}`;
    const queue = [initialUrl];
    const pages: Record<string, string> = {};
    let originalHead = '';
    const maxPages = options.maxPages ?? 50;
    const pageTimeout = options.timeout ?? 30000;

    while (queue.length > 0 && visited.size < maxPages) {
      const currentUrl = queue.shift();
      if (!currentUrl) break;
      const urlObj = new URL(currentUrl);
      const cleanPathname = urlObj.pathname.replace(/\/$/, '') || '/';
      const normalizedUrl = `${urlObj.origin}${cleanPathname}`;
      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      console.log(`        Crawling: ${currentUrl}`);
      const page = await context.newPage();

      try {
        const navResponse = await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: pageTimeout });
        if (navResponse && !navResponse.ok()) {
          console.log(`        Skipping non-OK status (${navResponse.status()}) for ${currentUrl}`);
          continue;
        }

        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        
        // Smoothly scroll down to trigger IntersectionObservers, lazy-loaded media, and scroll animations
        await page.evaluate(async () => {
          const totalHeight = document.body.scrollHeight;
          const step = Math.max(300, Math.floor(window.innerHeight / 2));
          for (let current = 0; current <= totalHeight; current += step) {
            window.scrollTo(0, current);
            window.dispatchEvent(new Event('scroll'));
            await new Promise(r => setTimeout(r, 100));
          }
          await new Promise(r => setTimeout(r, 400));
          window.scrollTo(0, 0);
          window.dispatchEvent(new Event('scroll'));
        }).catch(() => {});

        await new Promise(r => setTimeout(r, 300));



        const html = await page.evaluate<string>(`(() => {
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


        if (!originalHead) {
          const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
          if (headMatch && headMatch[1]) {
            originalHead = headMatch[1];
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

              // Deduplicate by clean origin + pathname (strips arbitrary query strings & hashes)
              const linkPathname = linkUrl.pathname.replace(/\/$/, '') || '/';
              const cleanHref = `${baseOrigin}${linkPathname}`;

              if (cleanHref && !visited.has(cleanHref) && !queue.includes(cleanHref) && queue.length + visited.size < maxPages) {
                queue.push(cleanHref);
              }

            }
          } catch {}
        });


        const landedUrl = page.url();
        const landedUrlObj = new URL(landedUrl);
        let pathname = landedUrlObj.pathname;
        if (pathname === '/') pathname = '/index';
        if (pathname.endsWith('/') && pathname.length > 1) pathname = pathname.slice(0, -1);
        
        pages[pathname] = html;
      } catch (e: any) {
        console.log(`        Failed to crawl ${currentUrl}: ${e.message}`);
      } finally {
        await page.close();
      }

      // Politeness delay with random jitter (200-500ms) to avoid WAF rate-limiting
      if (queue.length > 0) {
        await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
      }
    }


    console.log(`  [4/5] Rewriting asset URLs for ${Object.keys(pages).length} pages...`);

    // Rewrite pages & originalHead
    for (const [route, htmlContent] of Object.entries(pages)) {
      let routePath = route === '/index' ? '/' : route;
      const pageUrl = `${baseOrigin}${routePath}`;
      const rewritten = rewriteHtml(htmlContent, pageUrl, assetMap, baseOrigin);
      const safeRoute = sanitizeFileName(route.replace(/^\//, '').replace(/\//g, '-'));
      const rawFileName = route === '/index' ? 'captured-raw.html' : `captured-raw-${safeRoute}.html`;
      await fs.writeFile(path.join(outputDir, rawFileName), rewritten);
      pages[route] = rewritten;
    }

    if (originalHead) {
      originalHead = rewriteHtml(originalHead, baseOrigin, assetMap, baseOrigin);
    }

    // Rewrite downloaded CSS files
    await rewriteCssFiles(cssDir, assetMap, baseOrigin);

    // Optimize harvested images
    await optimizeImages(imgDir);

    if (!options.skipDeps) {
      console.log('  [5/5] Scanning JS modules for missing dependencies...');
      await downloadMissingDeps(outputDir, assetMap, baseOrigin);
    } else {
      console.log('  [5/5] Skipping recursive JS module dependency scan (--skip-deps)');
    }

    // Rewrite downloaded JS files (must run after downloadMissingDeps to rewrite all chunks)
    await rewriteJsFiles(outputDir, assetMap, baseOrigin);

    // Write final asset map to disk after all dynamic dependencies have been discovered
    await fs.writeFile(path.join(outputDir, 'asset-map.json'), JSON.stringify(assetMap, null, 2));

    return { pages, outputDir, originalHead, runtimeScripts };


  } finally {
    process.removeListener('SIGINT', cleanupBrowser);
    process.removeListener('SIGTERM', cleanupBrowser);
    // SIGINT may have closed the browser already; never let a second close() mask the original error
    try { await browser.close(); } catch {}
  }
}

function rewriteHtml(html: string, pageUrl: string, assetMap: AssetMap, baseOrigin: string): string {
  let result = html;

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

  // 3. Rewrite srcset attributes
  result = result.replace(/(srcset\s*=\s*["'])([^"']+)(["'])/gi, (match, prefix, content, suffix) => {
    const rewrittenEntries = content.split(',').map((entry: string) => {
      const trimmed = entry.trim();
      const parts = trimmed.split(/\s+/);
      const url = parts[0] || '';
      const descriptor = parts.slice(1).join(' ');
      
      let rewrittenUrl = url;
      try {
        const resolved = new URL(url, pageUrl).href;
        if (assetMap[resolved]) rewrittenUrl = assetMap[resolved]!;
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

  // 5. Remove tracking and bot scripts
  result = result.replace(/<script\b[^>]*>[^<]*__CF\$cv\$params[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<iframe[^>]*visibility:\s*hidden[^>]*>[\s\S]*?<\/iframe>/gi, '');
  result = result.replace(/<script[^>]*cdn-cgi[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<script[^>]*cf-beacon[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<link[^>]*cdn-cgi[^>]*>/gi, '');

  return result;
}

async function rewriteCssFiles(cssDir: string, assetMap: AssetMap, baseOrigin: string): Promise<void> {
  try {
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
  } catch {}
}

async function rewriteJsFiles(outputDir: string, assetMap: AssetMap, baseOrigin: string): Promise<void> {
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
}

async function downloadMissingDeps(outputDir: string, assetMap: AssetMap, baseOrigin: string): Promise<void> {
  const jsDir = path.join(outputDir, 'public', 'assets', 'js');
  const downloaded = new Set(Object.values(assetMap).map(p => path.basename(p)));
  const attempted = new Set<string>();
  const maxDepth = 5;

  for (let depth = 0; depth < maxDepth; depth++) {
    const needed = new Set<string>();
    let jsFiles: string[] = [];
    try {
      jsFiles = await fs.readdir(jsDir);
    } catch {
      break;
    }

    for (const file of jsFiles) {
      if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
      
      const content = await fs.readFile(path.join(jsDir, file), 'utf-8');
      
      const importRegex = /(["'])(?:\.\/|\.\.\/)([^"']+\.(?:mjs|js))(?:\?[^"']*)?\1/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        let depName = match[2];
        if (!depName) continue;
        if (!downloaded.has(depName) && !attempted.has(depName)) {
          needed.add(depName);
        }
      }
    }

    if (needed.size === 0) break;

    let passFetched = 0;

    for (const depName of needed) {
      attempted.add(depName);
      if (!baseOrigin) continue;

      const remoteUrl = `${baseOrigin}/${depName}`;
      let success = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(remoteUrl, { signal: controller.signal });
          
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const urlHash = crypto.createHash('md5').update(remoteUrl).digest('hex').substring(0, 8);
            
            const rawName = path.basename(depName);
            let baseName = rawName.includes('.') ? rawName.substring(0, rawName.lastIndexOf('.')) : rawName;
            const ext = rawName.includes('.') ? rawName.substring(rawName.lastIndexOf('.')) : '.js';
            const savedFileName = `${sanitizeFileName(baseName)}-${urlHash}${ext}`;

            await fs.writeFile(path.join(jsDir, savedFileName), Buffer.from(buffer));
            downloaded.add(depName);
            downloaded.add(savedFileName);
            assetMap[remoteUrl] = `/assets/js/${savedFileName}`;
            passFetched++;
            success = true;
            break;
          } else {
            try { await res.body?.cancel(); } catch {}
          }
        } catch {
        } finally {
          clearTimeout(timeout);
        }

        if (!success && attempt < 3) {
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
