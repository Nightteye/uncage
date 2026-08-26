import { input, select, confirm, number } from '@inquirer/prompts';
import type { ExportFormat, ExtractorOptions } from './types.js';

export interface WizardResult {
  url: string;
  outputName: string;
  format: ExportFormat;
  /** Only contains keys the user explicitly configured; merged over CLI flags. */
  options: Partial<ExtractorOptions>;
}

// Single source of truth for URL normalization: trim, then default the scheme.
// Both validation and construction must use this so they can't disagree.
function normalizeUrlInput(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
}

export function printBanner(): void {
  console.log(`
  ⛓️‍💥 ──────────────────────────────────────────
     U N C A G E
     Local Website Cloner & Code Exporter
  ──────────────────────────────────────────
`);
}

export async function runWizard(): Promise<WizardResult> {
  printBanner();

  try {
    // 1. URL Input
    const rawUrl = await input({
      message: '🌐 Enter the website URL to clone:',
      validate: (val) => {
        if (!val.trim()) return 'Please enter a URL (e.g. https://example.com)';
        try {
          new URL(normalizeUrlInput(val));
          return true;
        } catch {
          return 'Please enter a valid website URL';
        }
      },
    });

    const url = normalizeUrlInput(rawUrl);

    const defaultOutput = new URL(url).hostname;

    // 2. Format Selection
    const format = await select<ExportFormat>({
      message: '📦 Choose export format:',
      choices: [
        {
          name: 'React 18 + TypeScript (TSX) [Default]',
          value: 'react-ts',
          description: 'Vite + React 18 + TypeScript + React Router project',
        },
        {
          name: 'React 18 + JavaScript (JSX)',
          value: 'react-js',
          description: 'Vite + React 18 + JavaScript (clean JSX) + React Router project',
        },
        {
          name: 'Static HTML / CSS / JS',
          value: 'html',
          description: 'Pure static multi-page HTML/CSS/JS ready for static hosting or local browsing',
        },
      ],
      default: 'react-ts',
    });

    // 3. Output Directory Name
    const outputName = await input({
      message: '📁 Enter output folder name:',
      default: defaultOutput,
      validate: (val) => {
        const sanitized = val.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
        return sanitized.length > 0 ? true : 'Output folder name cannot be empty';
      },
    });

    // 4. Advanced Settings Prompt
    const customizeAdvanced = await confirm({
      message: '⚙️  Configure advanced crawl options? (Max pages, timeout, debug mode)',
      default: false,
    });

    // Only populated when the user customizes; empty means "keep CLI/defaults"
    let options: Partial<ExtractorOptions> = {};

    if (customizeAdvanced) {
      const maxPages = await number({
        message: '📄 Maximum pages to crawl:',
        default: 50,
        min: 1,
        max: 500,
      });

      const timeout = await number({
        message: '⏱️  Page timeout (milliseconds):',
        default: 30000,
        min: 5000,
      });

      const showBrowser = await confirm({
        message: '👀 Show browser window during crawl? (Debug mode)',
        default: false,
      });

      const skipDeps = await confirm({
        message: '⚡ Skip recursive JS dynamic module scanning? (Faster crawl)',
        default: false,
      });

      options = {
        headless: !showBrowser,
        skipDeps,
      };
      if (maxPages !== undefined) options.maxPages = maxPages;
      if (timeout !== undefined) options.timeout = timeout;
    }

    return {
      url,
      outputName: outputName.trim(),
      format,
      options,
    };
  } catch (err: any) {
    if (err.name === 'ExitPromptError' || err.message?.includes('force closed')) {
      console.log('\n  👋 Operation cancelled. Exiting...\n');
      process.exit(0);
    }
    throw err;
  }
}
