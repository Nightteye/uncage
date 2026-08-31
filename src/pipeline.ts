import path from 'path';
import { extract } from './extractor.js';
import { optimizeExtractedCss } from './optimizer.js';
import { htmlStrategy } from './formats/html.js';
import type { ExtractorOptions, ProgressHandler, ProgressEvent } from './types.js';

export interface CloneResult {
  pages: Record<string, string>;
  outputDir: string;
  originalHead: string;
  runtimeScripts: string[];
}

// Shared pipeline: extract → optimize → compile → assemble, always Static HTML.
// Both the CLI and the web UI call this so their behavior stays identical.
export async function cloneToStaticHtml(
  url: string,
  outputName: string,
  options: ExtractorOptions & { purge?: boolean; keepAnalytics?: boolean } = {},
  onProgress?: ProgressHandler
): Promise<CloneResult> {
  const emit = (kind: ProgressEvent['kind'], message: string): void => {
    try { onProgress?.({ kind, message }); } catch { /* listener must never break the run */ }
  };

  const extractorOptions: ExtractorOptions = { ...options };
  if (onProgress) extractorOptions.onProgress = onProgress;

  // Step 1: Extract (stealth crawler, asset harvest, HTML capture)
  emit('phase', 'Starting extraction');
  const { pages, outputDir, originalHead, runtimeScripts } = await extract(url, outputName, extractorOptions);

  // Step 1.5: Optimize CSS
  if (options.purge !== false) {
    emit('phase', 'Optimizing CSS');
    await optimizeExtractedCss(outputDir, pages);
  } else {
    console.log('  [Optimizer] Skipping CSS purge (--no-purge)');
    emit('phase', 'Skipping CSS purge');
  }

  // Step 2: Compile HTML pages into static HTML/CSS/JS
  emit('phase', 'Compiling static HTML');
  await htmlStrategy.compile(outputDir, pages, runtimeScripts, {
    keepAnalytics: options.keepAnalytics,
    onProgress,
  });

  // Step 3: Assemble (finalize static project structure)
  emit('phase', 'Assembling static project');
  await htmlStrategy.assemble(outputDir, url, originalHead, Object.keys(pages), runtimeScripts, {
    keepAnalytics: options.keepAnalytics,
    onProgress,
  });

  emit('done', `Exported ${Object.keys(pages).length} page(s)`);
  return { pages, outputDir, originalHead, runtimeScripts };
}

export function outputPathFor(outputName: string): string {
  return path.join(process.cwd(), 'output', outputName);
}
