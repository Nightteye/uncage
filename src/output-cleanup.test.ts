import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { readGeneratedFiles, reconcileGeneratedFiles } from './output-cleanup.js';

describe('repeated export cleanup', () => {
  it('archives stale generated pages and assets while preserving user files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-reclone-'));
    const outputDir = path.join(root, 'site');
    const tick = String.fromCharCode(96);
    try {
      await fs.mkdir(path.join(outputDir, 'assets', 'js'), { recursive: true });
      await fs.writeFile(path.join(outputDir, 'README.md'), '# Static Website Clone\n\n- [stale.html](./stale.html) (Source route: ' + tick + '/stale' + tick + ')\n');
      await fs.writeFile(path.join(outputDir, 'asset-map.json'), JSON.stringify({ 'https://example.com/chunk.js': '/assets/js/chunk-123.js' }));
      await fs.writeFile(path.join(outputDir, 'stale.html'), 'old page');
      await fs.writeFile(path.join(outputDir, 'custom.html'), 'user page');
      await fs.writeFile(path.join(outputDir, 'assets', 'js', 'chunk-123.js'), 'old asset');
      await fs.writeFile(path.join(outputDir, 'assets', 'js', 'chunk.js'), 'old alias');

      const previous = await readGeneratedFiles(outputDir);
      await fs.writeFile(path.join(outputDir, 'asset-map.json'), JSON.stringify({ 'https://example.com/next.js': '/assets/js/next-456.js' }));
      await fs.writeFile(path.join(outputDir, 'index.html'), 'new page');
      await fs.writeFile(path.join(outputDir, 'assets', 'js', 'next-456.js'), 'new asset');
      await fs.writeFile(path.join(outputDir, 'assets', 'js', 'next.js'), 'new alias');
      await reconcileGeneratedFiles(outputDir, previous, ['/index']);

      expect(await fs.readFile(path.join(outputDir, 'custom.html'), 'utf-8')).toBe('user page');
      expect(await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8')).toBe('new page');
      await expect(fs.stat(path.join(outputDir, 'stale.html'))).rejects.toThrow();
      await expect(fs.stat(path.join(outputDir, 'assets', 'js', 'chunk-123.js'))).rejects.toThrow();
      const [archiveName] = await fs.readdir(path.join(root, '.uncage-archive', 'site'));
      expect(archiveName).toBeDefined();
      const archiveDir = path.join(root, '.uncage-archive', 'site', archiveName!);
      expect(await fs.readFile(path.join(archiveDir, 'stale.html'), 'utf-8')).toBe('old page');
      expect(await fs.readFile(path.join(archiveDir, 'assets', 'js', 'chunk.js'), 'utf-8')).toBe('old alias');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps ordinary exports working when Windows denies realpath on the output directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-reclone-eperm-'));
    const outputDir = path.join(root, 'site');
    await fs.mkdir(outputDir);
    await fs.writeFile(path.join(outputDir, 'stale.html'), 'old page');
    const originalRealpath = fs.realpath.bind(fs);
    const realpath = vi.spyOn(fs, 'realpath').mockImplementation((target, options) => {
      if (path.resolve(target.toString()) === path.resolve(outputDir)) {
        return Promise.reject(Object.assign(new Error('operation not permitted'), { code: 'EPERM' }));
      }
      return originalRealpath(target, options);
    });

    try {
      await reconcileGeneratedFiles(outputDir, { pages: new Set(['stale.html']), assets: new Set() }, ['/index']);

      const manifest = JSON.parse(await fs.readFile(path.join(outputDir, '.uncage-manifest.json'), 'utf-8'));
      expect(manifest.pages).toEqual(['index.html']);
      expect(await fs.readFile(path.join(root, '.uncage-archive', 'site', (await fs.readdir(path.join(root, '.uncage-archive', 'site')))[0]!, 'stale.html'), 'utf-8'))
        .toBe('old page');
    } finally {
      realpath.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
