import type { ExporterStrategy } from '../types.js';
import { compileToReact } from '../parser.js';
import { assemble } from '../assembler.js';

export const reactJsStrategy: ExporterStrategy = {
  name: 'React 18 + JavaScript + Vite',
  format: 'react-js',
  description: 'Clean Vite + React 18 + JavaScript (JSX) + React Router project without TypeScript',

  async compile(outputDir: string, pages: Record<string, string>): Promise<void> {
    await compileToReact(outputDir, pages, { typescript: false });
  },

  async assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[], options?: { keepAnalytics?: boolean }): Promise<void> {
    await assemble(outputDir, targetUrl, originalHead, routes, { typescript: false, runtimeScripts: runtimeScripts || [], keepAnalytics: options?.keepAnalytics });
  }
};
