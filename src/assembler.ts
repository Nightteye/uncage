import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { toPascalCase, buildRouteComponentMap } from './parser.js';
import { synthesizeFramerBreakpoints } from './optimizer.js';


export function cleanHead(originalHead: string, options: { keepAnalytics?: boolean } = {}): { cleanedHead: string; originalTitle: string } {
  if (!originalHead) return { cleanedHead: '', originalTitle: 'Uncage React Clone' };
  
  const $ = cheerio.load(`<!DOCTYPE html><html><head>${originalHead}</head><body></body></html>`);
  const originalTitle = $('title').first().text().trim() || 'Uncage React Clone';
  
  $('title').remove();
  $('meta[charset]').remove();
  $('meta[name="viewport" i]').remove();
  $('meta[http-equiv="Content-Type" i]').remove();
  $('base').remove();
  // Remove Framer page-bootstrap scripts (cause duplicate declarations on client-side nav)
  $('script[data-framer-page-script]').remove();

  if (!options.keepAnalytics) {
    // Strip external analytics/tracking scripts by default
    $('script[src*="googletagmanager"], script[src*="google-analytics"], script[src*="hotjar"], script[src*="clarity.ms"], script[src*="segment.com"], script[src*="connect.facebook.net"]').remove();
  }

  // Remove inline scripts without src (bootstrap code that crashes on re-execution)
  $('script:not([src])').each((_, el) => {
    const content = $(el).html() || '';
    if (options.keepAnalytics && (content.includes('gtag') || content.includes('analytics') || content.includes('dataLayer'))) {
      return;
    }
    $(el).remove();
  });
  
  return { cleanedHead: $('head').html() || '', originalTitle };
}


/**
 * Scaffold a Vite React project (TypeScript or JavaScript) around the extracted files
 * so the user can run `npm install && npm run dev` and see the cloned site.
 */
export async function assemble(
  outputDir: string, 
  url: string, 
  originalHead: string, 
  routes: string[] = [],
  options: { typescript?: boolean; runtimeScripts?: string[]; keepAnalytics?: boolean } = { typescript: true }
): Promise<void> {
  const isTs = options.typescript !== false;
  const ext = isTs ? 'tsx' : 'jsx';
  console.log(`  [Assembler] Scaffolding dev-ready React ${isTs ? 'TSX' : 'JSX'} project...`);

  let safePackageName = path.basename(outputDir).toLowerCase().replace(/[^a-z0-9._-]/g, '-') || 'uncage-react-clone';
  safePackageName = safePackageName.replace(/^[^a-z0-9]+/, '');
  if (!safePackageName) safePackageName = 'uncage-react-clone';

  // 1. package.json
  const pkg = isTs ? {
    name: safePackageName,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },

    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.20.0',
      'react-helmet-async': '^2.0.4'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.3.4',
      '@types/react': '^18.2.66',
      '@types/react-dom': '^18.2.22',
      '@types/node': '^20.11.0',
      'typescript': '^5.2.2',
      'vite': '^6.0.0',
    },
  } : {
    name: safePackageName,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.20.0',
      'react-helmet-async': '^2.0.4'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.3.4',
      'vite': '^6.0.0',
    },
  };

  await fs.writeFile(
    path.join(outputDir, 'package.json'),
    JSON.stringify(pkg, null, 2)
  );

  // 2. vite.config.ts / vite.config.js
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    port: 3000,
  },
  optimizeDeps: {
    entries: ['src/main.${ext}'],
  },
});
`;


  const configFileName = isTs ? 'vite.config.ts' : 'vite.config.js';
  await fs.writeFile(path.join(outputDir, configFileName), viteConfig);
  
  const altConfigFileName = isTs ? 'vite.config.js' : 'vite.config.ts';
  try { await fs.unlink(path.join(outputDir, altConfigFileName)); } catch {}

  // 3. tsconfig.json or jsconfig.json
  const srcDir = path.join(outputDir, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  if (isTs) {
    const tsconfig = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": false,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}`;
    await fs.writeFile(path.join(outputDir, 'tsconfig.json'), tsconfig);
    await fs.writeFile(path.join(srcDir, 'vite-env.d.ts'), '/// <reference types="vite/client" />\n');
  } else {
    const jsconfig = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "checkJs": false
  },
  "include": ["src"]
}`;
    await fs.writeFile(path.join(outputDir, 'jsconfig.json'), jsconfig);
  }

  let framerBreakpointCss = '';
  try {
    const dirFiles = await fs.readdir(outputDir);
    const rawFiles = dirFiles.filter(f => f.startsWith('captured-raw') && f.endsWith('.html'));
    let combinedHtml = '';
    for (const f of rawFiles) {
      const content = await fs.readFile(path.join(outputDir, f), 'utf-8');
      combinedHtml += '\n' + content;
    }
    framerBreakpointCss = synthesizeFramerBreakpoints(combinedHtml);
  } catch {}


  const { cleanedHead, originalTitle } = cleanHead(originalHead, { keepAnalytics: options.keepAnalytics });

  // Generate idempotent runtime loader for Framer animation scripts
  const scripts = options.runtimeScripts || [];
  let runtimeLoaderScript = '';
  if (scripts.length > 0) {
    const scriptArray = JSON.stringify(scripts);
    runtimeLoaderScript = `
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
    </script>`;
  }

  const safeTitle = originalTitle.replace(/<\/(title|style|script)/gi, '<\\/$1');
  const safeHead = cleanedHead.replace(/<\/(title|style|script)/gi, '<\\/$1');
  const safeCss = framerBreakpointCss.replace(/<\/(title|style|script)/gi, '<\\/$1');

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    ${safeHead}
    ${safeCss ? `<style data-framer-breakpoints="">${safeCss}</style>` : ''}${runtimeLoaderScript}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.${ext}"></script>
  </body>
</html>`;
  await fs.writeFile(path.join(outputDir, 'index.html'), indexHtml);


  // 5. Generate Router App and main entrypoint
  const normalizedRoutes = Array.from(new Set(routes.map(r => r === '/index' ? '/' : r)));
  if (normalizedRoutes.length === 0) {
    normalizedRoutes.push('/');
  }

  const routeComponentMap = buildRouteComponentMap(normalizedRoutes);


  const uniqueComponents = Array.from(new Set(routeComponentMap.values()));
  const routeImports = uniqueComponents.map(comp => `import ${comp} from './pages/${comp}';`).join('\n');
  
  const routeElements = Array.from(routeComponentMap.entries())
    .map(([r, comp]) => `        <Route path="${r}" element={<${comp} />} />`)
    .join('\n');

  const defaultComp = routeComponentMap.get('/404') || routeComponentMap.get('/not-found') || routeComponentMap.get('/') || uniqueComponents[0] || 'Home';

  const appContent = `import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
${routeImports}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
${routeElements}
        <Route path="*" element={<${defaultComp} />} />
      </Routes>
    </BrowserRouter>
  );
}
`;
  await fs.writeFile(path.join(srcDir, `App.${ext}`), appContent);
  
  const rootIdExpr = isTs ? "document.getElementById('root')!" : "document.getElementById('root')";
  const mainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

ReactDOM.createRoot(${rootIdExpr}).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);
`;
  await fs.writeFile(path.join(srcDir, `main.${ext}`), mainContent);

  // 6. .gitignore
  const gitignore = `node_modules/
dist/
.DS_Store
`;

  await fs.writeFile(path.join(outputDir, '.gitignore'), gitignore);

  console.log(`  [Assembler] React ${isTs ? 'TSX' : 'JSX'} project scaffolded.`);
  console.log(`  [Assembler] Files created: package.json, ${configFileName}, index.html, src/main.${ext}, src/App.${ext}`);
}
