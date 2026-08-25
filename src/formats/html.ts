import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import type { ExporterStrategy } from '../types.js';
import { synthesizeFramerBreakpoints } from '../optimizer.js';


const STATIC_EXTENSIONS = new Set([
  'pdf', 'zip', 'tar', 'gz', 'doc', 'docx', 'xlsx', 'xml',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico',
  'mp4', 'webm', 'mp3', 'wav', 'ogg'
]);

export function routeToHtmlFilename(route: string): string {
  if (!route || route === '/' || route === '/index') return 'index.html';
  let clean = route.replace(/^\//, '').replace(/\/$/, '').trim();
  clean = clean.replace(/\.html$/i, '');
  clean = clean.replace(/[^a-zA-Z0-9_/-]+/g, '-');
  return `${clean}.html`;
}

export const htmlStrategy: ExporterStrategy = {
  name: 'Static HTML/CSS/JS',
  format: 'html',
  description: 'Pure static multi-page HTML, CSS, and JS bundle ready for direct browsing or static hosting',

  async compile(outputDir: string, pages: Record<string, string>): Promise<void> {
    console.log('  [Compiler] Compiling Static HTML pages...');

    // Build route-to-filename lookup
    const routeMap = new Map<string, string>();
    for (const route of Object.keys(pages)) {
      routeMap.set(route, routeToHtmlFilename(route));
      if (route === '/' || route === '/index') routeMap.set('/index', 'index.html');
      if (route.endsWith('/')) {
        routeMap.set(route.slice(0, -1), routeToHtmlFilename(route));
      }
    }

    for (const [route, htmlContent] of Object.entries(pages)) {
      const filename = routeToHtmlFilename(route);
      const $ = cheerio.load(htmlContent);

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

      // Inject synthesized Framer breakpoint rules if present
      const framerBreakpoints = synthesizeFramerBreakpoints(htmlContent);
      if (framerBreakpoints) {
        const safeCss = framerBreakpoints.replace(/<\/(title|style|script)/gi, '<\\/$1');
        $('head').append(`<style data-framer-breakpoints="">${safeCss}</style>`);
      }

      const depth = filename.split('/').length - 1;
      const relPrefix = depth === 0 ? './' : '../'.repeat(depth);

      // Relativize root-relative asset URLs (/assets/ -> ./assets/ or ../assets/) for direct file:// browsing
      let finalHtml = $.html();
      finalHtml = finalHtml.replace(/\b(src|href|poster|data-src)\s*=\s*(["'])\/assets\//gi, `$1=$2${relPrefix}assets/`);
      finalHtml = finalHtml.replace(/srcset\s*=\s*(["'])(.*?)\1/gi, (_, q, val) => {
        return `srcset=${q}${val.replace(/\/assets\//g, `${relPrefix}assets/`)}${q}`;
      });
      finalHtml = finalHtml.replace(/url\(\s*(["']?)\/assets\//gi, `url($1${relPrefix}assets/`);


      const filePath = path.join(outputDir, filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, finalHtml, 'utf-8');
      console.log(`        Generated ${filename}`);

    }
  },

  async assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[]): Promise<void> {
    console.log('  [Assembler] Finalizing Static HTML project structure...');

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

    // 3. README.md
    const routeList = routes.map(r => `- [${routeToHtmlFilename(r)}](./${routeToHtmlFilename(r)}) (Source route: \`${r}\`)`).join('\n');
    const readme = `# Static Website Clone

This is a standalone static HTML, CSS, and JS export cloned from **${targetUrl}** using [Uncage](https://github.com/your-org/uncage).

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

    // 4. Move public/assets/ to root assets/ (extractor saves to public/ for Vite, but static HTML needs them at root)
    const publicAssetsDir = path.join(outputDir, 'public', 'assets');
    const rootAssetsDir = path.join(outputDir, 'assets');
    try {
      await fs.rename(publicAssetsDir, rootAssetsDir);
      // Clean up empty public/ directory
      await fs.rm(path.join(outputDir, 'public'), { recursive: true, force: true }).catch(() => {});
      console.log('  [Assembler] Moved assets from public/ to root for static serving');
    } catch (e: any) {
      // If public/assets doesn't exist (already at root), skip silently
      if (e.code !== 'ENOENT') {
        console.log(`  [Assembler] Warning: Could not move assets: ${e.message}`);
      }
    }

    console.log('  [Assembler] Static project files created: package.json, README.md, .gitignore');
  }
};
