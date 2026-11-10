import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PageCrawlContext {
  readonly url: string;
  readonly depth: number;
  readonly html: string;
}

export interface AssetFetchContext {
  readonly url: string;
  readonly contentType: string;
  readonly filePath: string;
  readonly localPath: string;
  readonly size: number;
}

export interface HTMLRewriteContext {
  readonly url: string;
  readonly route: string;
  readonly html: string;
}

export interface AssembleContext {
  readonly outputDir: string;
  readonly sourceUrl: string;
  readonly routes: readonly string[];
}

export interface UncagePlugin {
  name?: string;
  onPageCrawl?: (context: PageCrawlContext) => string | void | Promise<string | void>;
  onAssetFetch?: (context: AssetFetchContext) => void | Promise<void>;
  onHTMLRewrite?: (context: HTMLRewriteContext) => string | void | Promise<string | void>;
  onAssemble?: (context: AssembleContext) => void | Promise<void>;
}

export interface UncageConfig {
  plugins?: UncagePlugin[];
}

type WarningHandler = (message: string) => void;

const HOOK_NAMES = ['onPageCrawl', 'onAssetFetch', 'onHTMLRewrite', 'onAssemble'] as const;

export function validateUncageConfig(value: unknown): UncageConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('uncage.config.ts must default-export a config object');
  }

  const config = value as Record<string, unknown>;
  const plugins = config.plugins ?? [];
  if (!Array.isArray(plugins)) throw new Error('uncage.config.ts "plugins" must be an array');

  plugins.forEach((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plugin ${index + 1} must be an object`);
    }
    const plugin = value as Record<string, unknown>;
    if (plugin.name !== undefined && typeof plugin.name !== 'string') {
      throw new Error(`Plugin ${index + 1} "name" must be a string`);
    }
    for (const hook of HOOK_NAMES) {
      if (plugin[hook] !== undefined && typeof plugin[hook] !== 'function') {
        throw new Error(`Plugin ${index + 1} "${hook}" must be a function`);
      }
    }
  });

  return { plugins: plugins as UncagePlugin[] };
}

export async function loadUncagePlugins(cwd = process.cwd()): Promise<UncagePlugin[]> {
  const configPath = path.resolve(cwd, 'uncage.config.ts');
  try {
    await fs.access(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const configModule = await import(pathToFileURL(configPath).href) as { default?: unknown };
  return validateUncageConfig(configModule.default).plugins ?? [];
}

function warnHookFailure(plugin: UncagePlugin, index: number, hook: string, error: unknown, onWarning?: WarningHandler): void {
  const name = plugin.name || `plugin ${index + 1}`;
  const detail = error instanceof Error ? error.message : String(error);
  const message = `Plugin "${name}" ${hook} failed; continuing without that hook result: ${detail}`;
  console.warn(`  ⚠️ ${message}`);
  onWarning?.(message);
}

export async function runPageCrawlHooks(
  plugins: UncagePlugin[],
  event: PageCrawlContext,
  onWarning?: WarningHandler
): Promise<string> {
  let html = event.html;
  for (const [index, plugin] of plugins.entries()) {
    if (!plugin.onPageCrawl) continue;
    try {
      const result = await plugin.onPageCrawl({ ...event, html });
      if (result !== undefined && typeof result !== 'string') throw new Error('hook must return a string or undefined');
      if (typeof result === 'string') html = result;
    } catch (error) {
      warnHookFailure(plugin, index, 'onPageCrawl', error, onWarning);
    }
  }
  return html;
}

export async function runAssetFetchHooks(
  plugins: UncagePlugin[],
  event: AssetFetchContext,
  onWarning?: WarningHandler
): Promise<void> {
  for (const [index, plugin] of plugins.entries()) {
    try {
      await plugin.onAssetFetch?.({ ...event });
    } catch (error) {
      warnHookFailure(plugin, index, 'onAssetFetch', error, onWarning);
    }
  }
}

export async function runHTMLRewriteHooks(
  plugins: UncagePlugin[],
  event: HTMLRewriteContext,
  onWarning?: WarningHandler
): Promise<string> {
  let html = event.html;
  for (const [index, plugin] of plugins.entries()) {
    if (!plugin.onHTMLRewrite) continue;
    try {
      const result = await plugin.onHTMLRewrite({ ...event, html });
      if (result !== undefined && typeof result !== 'string') throw new Error('hook must return a string or undefined');
      if (typeof result === 'string') html = result;
    } catch (error) {
      warnHookFailure(plugin, index, 'onHTMLRewrite', error, onWarning);
    }
  }
  return html;
}

export async function runAssembleHooks(
  plugins: UncagePlugin[],
  event: AssembleContext,
  onWarning?: WarningHandler
): Promise<void> {
  for (const [index, plugin] of plugins.entries()) {
    try {
      await plugin.onAssemble?.({ ...event, routes: [...event.routes] });
    } catch (error) {
      warnHookFailure(plugin, index, 'onAssemble', error, onWarning);
    }
  }
}
