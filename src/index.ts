import { Command } from 'commander';
import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { extract } from './extractor.js';
import { resolveFormat, promptFormat, strategies } from './formats/index.js';
import { runWizard, printBanner } from './wizard.js';
import { sanitizeFileName } from './constants.js';
import type { ExtractorOptions, ExportFormat } from './types.js';

chromium.use(stealthPlugin());

const program = new Command();

program
  .name('uncage')
  .description('Clone any website into a standalone, dev-ready project (React TSX, React JSX, or Static HTML)')
  .argument('[url]', 'The target URL to clone (optional: launches interactive wizard if omitted)')
  .option('-o, --output <dir>', 'Output directory name', '')
  .option('-f, --format <format>', 'Target export format: react-ts, react-js, html', 'react-ts')
  .option('-i, --interactive', 'Interactively select the target export format', false)
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
  .option('--no-purge', 'Skip PurgeCSS optimization to retain dynamically applied classes')
  .option('--keep-analytics', 'Retain third-party analytics and tracking scripts in the exported project', false)
  .action(async (targetUrl?: string, opts?: { 
    output?: string; 
    format?: string; 
    interactive?: boolean; 
    maxPages?: number; 
    timeout?: number; 
    headless?: boolean; 
    skipDeps?: boolean; 
    purge?: boolean;
    keepAnalytics?: boolean;
  }) => {
    try {
      let url = targetUrl;
      let outputName = opts?.output || '';
      let chosenFormat: ExportFormat = 'react-ts';
      let extractorOptions: ExtractorOptions = {
        maxPages: opts?.maxPages ?? 50,
        timeout: opts?.timeout ?? 30000,
        headless: opts?.headless !== false,
        skipDeps: opts?.skipDeps ?? false,
      };

      // If no URL was passed on the command line, run the interactive wizard.
      // Wizard answers only override CLI flags the user actually configured there;
      // flags like --max-pages/--timeout keep their values otherwise.
      if (!url) {
        const wizardResult = await runWizard();
        url = wizardResult.url;
        outputName = wizardResult.outputName;
        chosenFormat = wizardResult.format;
        const wizardOverrides = Object.fromEntries(
          Object.entries(wizardResult.options).filter(([, v]) => v !== undefined)
        );
        extractorOptions = { ...extractorOptions, ...wizardOverrides };
      } else {
        printBanner();
        // Auto-prepend https:// if missing in CLI argument
        let normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = `https://${normalizedUrl}`;
        }
        url = normalizedUrl;

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
        
        if (opts?.interactive) {
          const strategy = await promptFormat();
          chosenFormat = strategy.format;
        } else {
          chosenFormat = resolveFormat(opts?.format).format;
        }
      }

      const startTime = Date.now();
      const strategy = strategies[chosenFormat];

      // extract() sanitizes the name internally; print the same name it will use
      const displayOutputName = sanitizeFileName(outputName) || 'extracted-site';

      console.log(`  Target: ${url}`);
      console.log(`  Format: ${strategy.name}`);
      console.log(`  Output: output/${displayOutputName}\n`);

      // Step 1: Extract (stealth crawler, asset harvest, HTML capture)
      const { pages, outputDir, originalHead, runtimeScripts } = await extract(url, outputName, extractorOptions);

      // Step 1.5: Optimize CSS
      if (opts?.purge !== false) {
        const { optimizeExtractedCss } = await import('./optimizer.js');
        await optimizeExtractedCss(outputDir, pages);
      } else {
        console.log('  [Optimizer] Skipping CSS purge (--no-purge)');
      }

      // Step 2: Compile HTML pages into the chosen target format
      await strategy.compile(outputDir, pages, runtimeScripts, { keepAnalytics: opts?.keepAnalytics });

      // Step 3: Assemble (scaffold project configuration and entrypoints)
      await strategy.assemble(outputDir, url, originalHead, Object.keys(pages), runtimeScripts, { keepAnalytics: opts?.keepAnalytics });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n  ✅ Successfully exported in ${elapsed}s!`);
      
      if (strategy.format === 'html') {
        console.log(`  🚀 Run static preview: cd output/${displayOutputName} && npm run preview`);
        console.log(`  📁 Or open output/${displayOutputName}/index.html directly in your browser.\n`);
      } else {
        console.log(`  🚀 Run dev server: cd output/${displayOutputName} && npm install && npm run dev\n`);
      }
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
