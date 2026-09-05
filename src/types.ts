export type ExportFormat = 'react-ts' | 'react-js' | 'html';

export type ProgressEventKind = 'phase' | 'page' | 'asset' | 'warn' | 'info' | 'done' | 'error';

export interface ProgressEvent {
  kind: ProgressEventKind;
  message: string;
}

export type ProgressHandler = (event: ProgressEvent) => void;

export interface StrategyOptions {
  keepAnalytics?: boolean | undefined;
  onProgress?: ProgressHandler | undefined;
}

export interface ExporterStrategy {
  name: string;
  format: ExportFormat;
  description: string;
  compile(outputDir: string, pages: Record<string, string>, runtimeScripts?: string[] | undefined, options?: StrategyOptions | undefined): Promise<void>;
  assemble(outputDir: string, targetUrl: string, originalHead: string, routes: string[], runtimeScripts?: string[] | undefined, options?: StrategyOptions | undefined): Promise<void>;
}

export interface ExtractorOptions {
  maxPages?: number;
  timeout?: number;
  headless?: boolean;
  skipDeps?: boolean;
  maxMemory?: number; // Maximum memory in MB for page buffers
  safeMode?: boolean; // Disable JS execution, only fetch static HTML
  allowUrls?: string[]; // URL patterns to allow (glob patterns)
  blockUrls?: string[]; // URL patterns to block (glob patterns)
  maxDepth?: number; // Maximum document-link depth from the seed; omitted = unlimited
  respectRobots?: boolean; // Respect robots.txt and Crawl-delay (default true)
  priorityOnly?: boolean; // Crawl only seed, navigation, and high-priority sitemap pages
  onProgress?: ProgressHandler; // optional live progress callback (used by the web UI)
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
