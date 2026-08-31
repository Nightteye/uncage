import { Command } from 'commander';
import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { runWizard, printBanner } from './wizard.js';
import { sanitizeFileName } from './constants.js';
import { cloneToStaticHtml } from './pipeline.js';
import { startWebUI } from './server.js';
import type { ExtractorOptions } from './types.js';

chromium.use(stealthPlugin());

const program = new Command();

program
  .name('uncage')
  .description('Clone any website into a standalone static HTML/CSS/JS project. React/TSX/JSX export is paused.')
  .argument('[url]', 'The target URL to clone (omit to launch the web UI)')
  .option('-o, --output <dir>', 'Output directory name', '')
  .option('--port <number>', 'Web UI port (when launching the UI)', (val) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 || parsed > 65535 ? 8787 : parsed;
  }, 8787)
  .option('--ui', 'Open the web UI even when a URL is provided', false)
  .option('--max-pages <number>', 'Maximum pages to crawl', (val) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 50 : parsed;
  }, 50)
  .option('--timeout <ms>', 'Page navigation timeout in ms', (val) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1000 ? 30000 : parsed;
  }, 30000)
  .option('--no-headless', 'Run browser in headful (visible) window mode for debugging')
  .option('--skip-deps', 'Skip recursive dynamic JS module dependency resolution', false)
  .option('--max-memory <mb>', 'Maximum memory in MB for page buffers (0 = unlimited)', (val) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, 0)
  .option('--max-depth <number>', 'Maximum link depth from the seed (0 = seed only; default: unlimited)', (val) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 0 ? undefined : parsed;
  })
  .option('--ignore-robots', 'Ignore robots.txt rules and Crawl-delay (only use with permission)', false)
  .option('--priority-only', 'Crawl only the seed, navigation pages, and high-priority sitemap pages', false)
  .option('--safe-mode', 'Disable JS execution, only fetch static HTML (faster, safer)', false)
  .option('--allow-url <pattern>', 'Allow asset URLs matching glob pattern (can repeat)', (val, memo: string[]) => {
    memo.push(val);
    return memo;
  }, [])
  .option('--block-url <pattern>', 'Block asset URLs matching glob pattern (can repeat)', (val, memo: string[]) => {
    memo.push(val);
    return memo;
  }, [])
  .option('--no-purge', 'Skip PurgeCSS optimization to retain dynamically applied classes')
  .option('--keep-analytics', 'Retain third-party analytics and tracking scripts in the exported project', false)
  .action(async (targetUrl?: string, opts?: {
    output?: string;
    port?: number;
    ui?: boolean;
    maxPages?: number;
    timeout?: number;
    headless?: boolean;
    skipDeps?: boolean;
    maxMemory?: number;
    maxDepth?: number;
    ignoreRobots?: boolean;
    priorityOnly?: boolean;
    safeMode?: boolean;
    allowUrl?: string[];
    blockUrl?: string[];
    purge?: boolean;
    keepAnalytics?: boolean;
  }) => {
    try {
      // No URL (or explicit --ui) → launch the web UI for non-technical users.
      if (!targetUrl || opts?.ui) {
        await startWebUI({ port: opts?.port ?? 8787 });
        return;
      }

      const startTime = Date.now();
      let outputName = opts?.output || '';
      const extractorOptions: ExtractorOptions = {
        maxPages: opts?.maxPages ?? 50,
        timeout: opts?.timeout ?? 30000,
        headless: opts?.headless !== false,
        skipDeps: opts?.skipDeps ?? false,
        maxMemory: opts?.maxMemory ?? 0,
        safeMode: opts?.safeMode ?? false,
        allowUrls: opts?.allowUrl ?? [],
        blockUrls: opts?.blockUrl ?? [],
      };
      if (opts?.maxDepth !== undefined) extractorOptions.maxDepth = opts.maxDepth;
      if (opts?.ignoreRobots === true) extractorOptions.respectRobots = false;
      if (opts?.priorityOnly === true) extractorOptions.priorityOnly = true;

      printBanner();

      // Auto-prepend https:// if missing
      let url = targetUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      if (!outputName) {
        try {
          outputName = new URL(url).hostname;
          if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(outputName)) {
            outputName += '-site';
          }
        } catch {
          outputName = 'cloned-site';
        }
      }

      // extract() sanitizes the name internally; print the same name it will use
      const displayOutputName = sanitizeFileName(outputName) || 'extracted-site';

      console.log(`  Target: ${url}`);
      console.log(`  Format: Static HTML / CSS / JS`);
      console.log(`  Output: output/${displayOutputName}\n`);

      const cloneOptions: ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean } = {
        ...extractorOptions,
      };
      if (opts?.purge !== undefined) cloneOptions.purge = opts.purge;
      if (opts?.keepAnalytics !== undefined) cloneOptions.keepAnalytics = opts.keepAnalytics;

      await cloneToStaticHtml(url, outputName, cloneOptions);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n  ✅ Successfully exported in ${elapsed}s!`);
      console.log(`  🚀 Run static preview: cd output/${displayOutputName} && npm run preview`);
      console.log(`  📁 Or open output/${displayOutputName}/index.html directly in your browser.\n`);
    } catch (err: any) {
      if (err.name === 'ExitPromptError' || err.message?.includes('force closed')) {
        console.log('\n  👋 Operation cancelled. Exiting...\n');
        process.exit(0);
      }
      console.error(`\n  ❌ Error: ${err.message || err}\n`);
      process.exit(1);
    }
  });

program.parse();
