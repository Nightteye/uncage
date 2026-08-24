import { input, select, confirm, number } from '@inquirer/prompts';
import type { ExportFormat, ExtractorOptions } from './types.js';

export interface WizardResult {
  url: string;
  outputName: string;
  format: ExportFormat;
  options: ExtractorOptions;
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
        const trimmed = val.trim();
        if (!trimmed) return 'Please enter a URL (e.g. https://example.com)';
        try {
          const full = trimmed.startsWith('http://') || trimmed.startsWith('https://') 
            ? trimmed 
            : `https://${trimmed}`;
          new URL(full);
          return true;
        } catch {
          return 'Please enter a valid website URL';
        }
      },
    });

    const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') 
      ? rawUrl.trim() 
      : `https://${rawUrl.trim()}`;

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

    let options: ExtractorOptions = {
      maxPages: 50,
      timeout: 30000,
      headless: true,
      skipDeps: false,
    };

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
        maxPages: maxPages ?? 50,
        timeout: timeout ?? 30000,
        headless: !showBrowser,
        skipDeps,
      };
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
