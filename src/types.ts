export type ExportFormat = 'react-ts' | 'react-js' | 'html';

export interface ExporterStrategy {
  name: string;
  format: ExportFormat;
  description: string;
  compile(outputDir: string, pages: Record<string, string>): Promise<void>;
  assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[]): Promise<void>;
}

export interface ExtractorOptions {
  maxPages?: number;
  timeout?: number;
  headless?: boolean;
  skipDeps?: boolean;
}

export const FORMAT_ALIASES: Record<string, ExportFormat> = {
  'react-ts': 'react-ts',
  'react-tsx': 'react-ts',
  'react': 'react-ts',
  'tsx': 'react-ts',
  'ts': 'react-ts',
  'react-typescript': 'react-ts',

  'react-js': 'react-js',
  'react-jsx': 'react-js',
  'jsx': 'react-js',
  'js': 'react-js',
  'react-javascript': 'react-js',

  'html': 'html',
  'static': 'html',
  'vanilla': 'html',
  'html-css-js': 'html',
  'plain': 'html',
};
