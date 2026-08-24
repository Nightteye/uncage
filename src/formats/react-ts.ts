import type { ExporterStrategy } from '../types.js';
import { compileToReact } from '../parser.js';
import { assemble } from '../assembler.js';

export const reactTsStrategy: ExporterStrategy = {
  name: 'React 18 + TypeScript + Vite',
  format: 'react-ts',
  description: 'Production-ready Vite + React 18 + TypeScript + React Router project',

  async compile(outputDir: string, pages: Record<string, string>): Promise<void> {
    await compileToReact(outputDir, pages, { typescript: true });
  },

  async assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[]): Promise<void> {
    await assemble(outputDir, targetUrl, originalHead, routes, { typescript: true, runtimeScripts: runtimeScripts || [] });
  }
};
