import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
import type { ExporterStrategy, StrategyOptions, ProgressHandler } from '../types.js';
import { synthesizeFramerBreakpoints } from '../optimizer.js';
import { stripTrackers } from '../assembler.js';
import { STATIC_EXTENSIONS } from '../constants.js';

export function routeToHtmlFilename(route: string): string {
  if (!route || route === '/' || route === '/index') return 'index.html';
  let clean = route.replace(/^\//, '').replace(/\/$/, '').trim();
  clean = clean.replace(/\.html$/i, '');
  clean = clean.replace(/[^a-zA-Z0-9_/-]+/g, '-');
  return `${clean}.html`;
}

/**
 * Deterministic route → filename map with collision disambiguation.
 * Shared by compile() (writing files) and assemble() (README listing) so both
 * agree on names even when routes collide.
 */
export function buildRouteFilenameMap(routes: string[]): Map<string, string> {
  const routeMap = new Map<string, string>();
  const usedFilenames = new Set<string>();

  // Sort for deterministic disambiguation regardless of input order.
  for (const route of [...routes].sort()) {
    let filename = routeToHtmlFilename(route);
    const isHome = route === '/' || route === '/index';

    if (usedFilenames.has(filename.toLowerCase()) && !isHome) {
      const hash = crypto.createHash('md5').update(route).digest('hex').slice(0, 6);
      const ext = path.extname(filename);
      const base = filename.slice(0, -ext.length);
      const disambiguated = `${base}-${hash}${ext}`;
      console.log(`  [Compiler] Route collision: '${route}' disambiguated to '${disambiguated}'`);
      filename = disambiguated;
    }

    usedFilenames.add(filename.toLowerCase());
    routeMap.set(route, filename);
    if (isHome) routeMap.set('/index', 'index.html');
    if (route.endsWith('/')) {
      routeMap.set(route.slice(0, -1), filename);
    }
  }
  return routeMap;
}

export const htmlStrategy: ExporterStrategy = {
  name: 'Static HTML/CSS/JS',
  format: 'html',
  description: 'Pure static multi-page HTML, CSS, and JS bundle ready for direct browsing or static hosting',

  async compile(outputDir: string, pages: Record<string, string>, runtimeScripts?: string[], options?: StrategyOptions): Promise<void> {
    console.log('  [Compiler] Compiling Static HTML pages...');
    const onProgress: ProgressHandler | undefined = options?.onProgress;
    onProgress?.({ kind: 'phase', message: 'Compiling static HTML pages' });

    const routeMap = buildRouteFilenameMap(Object.keys(pages));

    for (const [route, htmlContent] of Object.entries(pages)) {
      const filename = routeMap.get(route) || routeToHtmlFilename(route);
      const $ = cheerio.load(htmlContent);

      // Strip third-party trackers from the verbatim crawl unless opted in
      stripTrackers($, options?.keepAnalytics === true);

      // Rewrite internal links to point directly to exported .html files
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        const isExternal = 
          href.startsWith('http://') || 
          href.startsWith('https://') || 
          href.startsWith('//') || 
          href.startsWith('mailto:') || 
          href.startsWith('tel:') || 
          href.startsWith('sms:') || 
          href.startsWith('blob:') || 
          href.startsWith('data:') || 
          href.startsWith('javascript:') ||
          href.startsWith('#');

        const isStaticAsset = href.startsWith('/assets/') || Array.from(STATIC_EXTENSIONS).some(ext => href.toLowerCase().split('?')[0]?.endsWith(`.${ext}`));

        if (!isExternal && !isStaticAsset && !$(el).attr('download')) {
          const match = href.match(/^([^?#]*)([?#].*)?$/);
          let rawPath = match?.[1] || '';
          const hashOrQuery = match?.[2] || '';

          if (!rawPath.startsWith('/')) {
            try {
              const baseRoute = route.startsWith('/') ? route : '/' + route;
              const resolved = new URL(rawPath, `http://dummy.com${baseRoute}`);
              rawPath = resolved.pathname;
            } catch {}
          }

          const depth = filename.split('/').length - 1;
          const relPrefix = depth === 0 ? './' : '../'.repeat(depth);

          if (routeMap.has(rawPath)) {
            const targetHtml = routeMap.get(rawPath)!;
            $(el).attr('href', relPrefix + targetHtml + hashOrQuery);
          } else if (rawPath === '/' || rawPath === '/index') {
            $(el).attr('href', relPrefix + 'index.html' + hashOrQuery);
          } else if (rawPath.startsWith('/')) {
            const fallbackHtml = routeToHtmlFilename(rawPath);
            $(el).attr('href', relPrefix + fallbackHtml + hashOrQuery);
          }
        }
      });

      // Inject synthesized Framer breakpoint rules if present.
      // Only </style can break out of this container — scope the escape to it.
      const framerBreakpoints = synthesizeFramerBreakpoints(htmlContent);
      if (framerBreakpoints) {
        const safeCss = framerBreakpoints.replace(/<\/style/gi, '<\\/style');
        $('head').append(`<style data-framer-breakpoints="">${safeCss}</style>`);
      }

      const depth = filename.split('/').length - 1;
      const relPrefix = depth === 0 ? './' : '../'.repeat(depth);

      // Inject idempotent runtime loader for Framer animation scripts
      const scripts = (runtimeScripts || []).map(src => {
        return src.startsWith('/assets/') ? `${relPrefix}assets/${src.slice(8)}` : src;
      });
      if (scripts.length > 0) {
        const scriptArray = JSON.stringify(scripts).replace(/</g, '\\u003c');
        $('head').append(`
    <script data-uncage-runtime>
      (function() {
        if (window.__UNCAGE_RUNTIME_LOADED) return;
        window.__UNCAGE_RUNTIME_LOADED = true;
        var scripts = ${scriptArray};
        scripts.forEach(function(src) {
          var s = document.createElement("script");
          s.src = src;
          s.type = "module";
          s.async = false;
          document.head.appendChild(s);
        });
      })();
    </script>`);
      }

      // Relativize root-relative asset URLs (/assets/ -> ./assets/ or ../assets/)
      // for direct file:// browsing. Walk attributes with Cheerio instead of regex
      // so data-* attributes and srcset are handled deterministically.
      const relativize = (val: string): string => val.replace(/\/assets\//g, `${relPrefix}assets/`);

      $('[src], [href], [poster], [data-src], [data-href], [data-srcset], [data-poster]').each((_, el) => {
        for (const attr of ['src', 'href', 'poster', 'data-src', 'data-href', 'data-srcset', 'data-poster']) {
          const val = $(el).attr(attr);
          if (val && val.includes('/assets/')) {
            $(el).attr(attr, relativize(val));
          }
        }
      });

      // srcset is a space/comma-separated list of URLs — relativize each entry.
      $('[srcset]').each((_, el) => {
        const val = $(el).attr('srcset');
        if (val && val.includes('/assets/')) {
          $(el).attr('srcset', relativize(val));
        }
      });

      // Inline style url(/assets/...) references.
      $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style && style.includes('/assets/')) {
          $(el).attr('style', style.replace(/url\(\s*(["']?)\/assets\//gi, `url($1${relPrefix}assets/`));
        }
      });

      let finalHtml = $.html();


      const filePath = path.join(outputDir, filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, finalHtml, 'utf-8');
      console.log(`        Generated ${filename}`);
      onProgress?.({ kind: 'page', message: `Generated ${filename}` });

    }
  },

  async assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[], options?: StrategyOptions): Promise<void> {
    console.log('  [Assembler] Finalizing Static HTML project structure...');
    const onProgress: ProgressHandler | undefined = options?.onProgress;
    onProgress?.({ kind: 'phase', message: 'Finalizing static HTML project' });

    const safeName = path.basename(outputDir).toLowerCase();

    // 1. package.json for simple preview
    const pkg = {
      name: safeName || 'uncage-static-clone',
      version: '1.0.0',
      private: true,
      description: `Static HTML clone of ${targetUrl}`,
      scripts: {
        preview: 'npx serve .',
        start: 'npx serve .'
      }
    };

    await fs.writeFile(
      path.join(outputDir, 'package.json'),
      JSON.stringify(pkg, null, 2)
    );

    // 2. .gitignore
    const gitignore = `node_modules/
.DS_Store
`;
    await fs.writeFile(path.join(outputDir, '.gitignore'), gitignore);

    // 3. README.md — reuse the SAME deterministic map compile() used so
    // disambiguated collision filenames are listed correctly
    const routeFilenameMap = buildRouteFilenameMap(routes);
    const routeList = routes.map(r => {
      const fname = routeFilenameMap.get(r) || routeToHtmlFilename(r);
      return `- [${fname}](./${fname}) (Source route: \`${r}\`)`;
    }).join('\n');
    const readme = `# Static Website Clone

This is a standalone static HTML, CSS, and JS export cloned from **${targetUrl}** using [Uncage](https://github.com/Nightteye/uncage).

## 📁 Exported Pages
${routeList}

## 🚀 How to Run & Preview

### Option 1: Direct File Opening
You can open \`index.html\` directly in any browser (or via VS Code "Live Server" extension).

### Option 2: Local Static Server
\`\`\`bash
npm run preview
# or
npx serve .
\`\`\`

## 🌐 Deployment
This folder is 100% static and ready to drag-and-drop to:
- **Netlify** / **Vercel**
- **GitHub Pages**
- **Nginx / Apache** or S3 / Cloudflare Pages
`;

    await fs.writeFile(path.join(outputDir, 'README.md'), readme);

    // 4. Consolidate public/assets/ to root assets/ (idempotent copy + remove)
    const publicAssetsDir = path.join(outputDir, 'public', 'assets');
    const rootAssetsDir = path.join(outputDir, 'assets');
    try {
      const stat = await fs.stat(publicAssetsDir).catch(() => null);
      if (stat && stat.isDirectory()) {
        await fs.cp(publicAssetsDir, rootAssetsDir, { recursive: true, force: true });
        // Remove public/ staging folder with retries for Windows file lock delays
        const publicDir = path.join(outputDir, 'public');
        try {
          await fs.rm(publicDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch {
          const entries = await fs.readdir(publicDir).catch(() => [] as string[]);
          for (const entry of entries) {
            await fs.rm(path.join(publicDir, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
          }
          await fs.rmdir(publicDir).catch(() => {});
        }
        console.log('  [Assembler] Consolidated assets to root directory for static hosting');
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.log(`  [Assembler] Warning: Could not move assets: ${e.message}`);
      }
    }

    // 4.5. Generate unhashed module aliases for dynamic runtime ES imports across all hosts
    try {
      const mapPath = path.join(outputDir, 'asset-map.json');
      const rawMap = await fs.readFile(mapPath, 'utf-8').catch(() => null);
      if (rawMap) {
        const assetMap = JSON.parse(rawMap) as Record<string, string>;
        for (const [remoteUrl, localRelPath] of Object.entries(assetMap)) {
          if (!localRelPath) continue;
          try {
            const parsedRemote = new URL(remoteUrl);
            const originalBaseName = path.basename(parsedRemote.pathname);
            const savedFileOnDisk = path.join(outputDir, localRelPath.replace(/^\//, ''));
            const unhashedFileOnDisk = path.join(path.dirname(savedFileOnDisk), originalBaseName);
            if (originalBaseName && savedFileOnDisk !== unhashedFileOnDisk) {
              const stat = await fs.stat(savedFileOnDisk).catch(() => null);
              if (stat && stat.isFile()) {
                await fs.copyFile(savedFileOnDisk, unhashedFileOnDisk).catch(() => {});
              }
            }
          } catch {}
        }
      }
    } catch {}

    // 5. Clean up temporary captured-raw*.html files from output directory
    try {
      const files = await fs.readdir(outputDir);
      for (const f of files) {
        if (f.startsWith('captured-raw') && f.endsWith('.html')) {
          await fs.unlink(path.join(outputDir, f)).catch(() => {});
        }
      }
    } catch {}

    console.log('  [Assembler] Static project files created: package.json, README.md, .gitignore');
  }
};
