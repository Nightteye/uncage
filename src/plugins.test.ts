import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadUncagePlugins,
  runAssembleHooks,
  runAssetFetchHooks,
  runHTMLRewriteHooks,
  runPageCrawlHooks,
  validateUncageConfig,
} from './plugins.js';

describe('Uncage plugin configuration', () => {
  it('defaults to no plugins and validates hook shapes', () => {
    expect(validateUncageConfig({})).toEqual({ plugins: [] });
    expect(() => validateUncageConfig({ plugins: {} })).toThrow('"plugins" must be an array');
    expect(() => validateUncageConfig({ plugins: [{ onHTMLRewrite: true }] })).toThrow('"onHTMLRewrite" must be a function');
  });

  it('loads the project TypeScript config and returns its plugins', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-config-'));
    try {
      expect(await loadUncagePlugins(cwd)).toEqual([]);
      await fs.writeFile(path.join(cwd, 'uncage.config.ts'), 'export default { plugins: [{ name: "fixture", onAssemble() {} }] };');
      expect(await loadUncagePlugins(cwd)).toMatchObject([{ name: 'fixture' }]);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

describe('plugin hook execution', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs HTML transforms in order and keeps the last good result after a hook error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warnings: string[] = [];
    const html = await runPageCrawlHooks([
      { name: 'first', onPageCrawl: ({ html }) => `${html}<first />` },
      { name: 'broken', onPageCrawl: () => { throw new Error('fixture failure'); } },
      { name: 'last', onPageCrawl: ({ html }) => `${html}<last />` },
    ], { url: 'https://example.com/', depth: 0, html: '<html>' }, (message) => warnings.push(message));

    expect(html).toBe('<html><first /><last />');
    expect(warnings).toEqual([expect.stringContaining('Plugin "broken" onPageCrawl failed')]);
  });

  it('runs asset, HTML rewrite, and assembly hooks with their event data', async () => {
    const assetHook = vi.fn();
    const assembleHook = vi.fn();
    const plugin = {
      onAssetFetch: assetHook,
      onHTMLRewrite: ({ html }: { html: string }) => `${html}<rewritten />`,
      onAssemble: assembleHook,
    };
    const asset = {
      url: 'https://cdn.example.com/a.css',
      contentType: 'text/css',
      filePath: 'output/site/assets/a.css',
      localPath: '/assets/a.css',
      size: 24,
    };
    const assembly = { outputDir: 'output/site', sourceUrl: 'https://example.com', routes: ['/'] };

    await runAssetFetchHooks([plugin], asset);
    await expect(runHTMLRewriteHooks([plugin], {
      url: 'https://example.com/', route: '/', html: '<html>',
    })).resolves.toBe('<html><rewritten />');
    await runAssembleHooks([plugin], assembly);

    expect(assetHook).toHaveBeenCalledWith(asset);
    expect(assembleHook).toHaveBeenCalledWith(assembly);
  });
});
