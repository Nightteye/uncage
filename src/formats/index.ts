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

// React/TSX/JSX export is paused. Static HTML is the only user-facing format.
// The react strategies stay in the codebase for future work — they are simply
// not selectable. resolveFormat always yields the static HTML strategy.
export function resolveFormat(input?: string): ExporterStrategy {
  if (input) {
    const normalized = input.trim().toLowerCase();
    const resolvedFormat = FORMAT_ALIASES[normalized];
    if (resolvedFormat === 'react-ts' || resolvedFormat === 'react-js') {
      console.warn('  ⚠️ React export is paused; producing Static HTML instead.');
    } else if (!resolvedFormat) {
      console.warn(`  ⚠️ Unknown format "${input}", defaulting to Static HTML.`);
    }
  }
  return htmlStrategy;
}

// Kept for API compatibility; the CLI no longer calls this (React is paused,
// so there is no format to pick).
export async function promptFormat(): Promise<ExporterStrategy> {
  return htmlStrategy;
}

export { reactTsStrategy, reactJsStrategy, htmlStrategy };
