import { select } from '@inquirer/prompts';
import type { ExportFormat, ExporterStrategy } from '../types.js';
import { FORMAT_ALIASES } from '../types.js';
import { reactTsStrategy } from './react-ts.js';
import { reactJsStrategy } from './react-js.js';
import { htmlStrategy } from './html.js';

export const strategies: Record<ExportFormat, ExporterStrategy> = {
  'react-ts': reactTsStrategy,
  'react-js': reactJsStrategy,
  'html': htmlStrategy,
};

export function resolveFormat(input?: string): ExporterStrategy {
  if (!input) return reactTsStrategy;
  const normalized = input.trim().toLowerCase();
  const resolvedFormat = FORMAT_ALIASES[normalized];
  if (resolvedFormat && strategies[resolvedFormat]) {
    return strategies[resolvedFormat];
  }
  console.warn(`  ⚠️ Unknown format "${input}", defaulting to React 18 + TypeScript (react-ts)`);
  return reactTsStrategy;
}

export async function promptFormat(): Promise<ExporterStrategy> {
  const answer = await select<ExportFormat>({
    message: 'Select target export format:',
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

  return strategies[answer];
}

export { reactTsStrategy, reactJsStrategy, htmlStrategy };
