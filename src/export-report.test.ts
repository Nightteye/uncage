import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { writeExportReport } from './export-report.js';

describe('export quality report', () => {
  it('finds missing local assets and page links while ignoring external links', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-report-'));
    try {
      await fs.mkdir(path.join(outputDir, 'assets', 'images'), { recursive: true });
      const html = '<html><head></head><body><img src="./assets/images/exists.png"><script src="./assets/js/missing.js"></script><script src="https://cdn.example/app.js"></script><a href="./about.html">About</a><a href="https://other.example/news">External</a></body></html>';
      await fs.writeFile(path.join(outputDir, 'index.html'), html);
      await fs.writeFile(path.join(outputDir, 'assets', 'images', 'exists.png'), 'image');
      await fs.writeFile(path.join(outputDir, 'asset-map.json'), JSON.stringify({
        'https://example.com/exists.png': '/assets/images/exists.png',
        'https://example.com/missing.css': '/assets/css/missing.css',
      }));

      const report = await writeExportReport(outputDir, 'https://example.com', ['/index']);
      expect(report.summary).toMatchObject({ pages: 1, mappedAssets: 2, missingPages: 0, missingAssets: 1, brokenLocalReferences: 2, externalResources: 1 });
      expect(report.missingAssetFiles).toEqual(['/assets/css/missing.css']);
      expect(report.brokenLocalReferences.map((item) => item.reference)).toEqual(['./assets/js/missing.js', './about.html']);
      expect(report.externalResourceReferences).toEqual(['https://cdn.example/app.js']);
      expect(report.summary.totalBytes).toBe(Buffer.byteLength(html) + 5);
      expect(JSON.parse(await fs.readFile(path.join(outputDir, 'export-report.json'), 'utf-8')).summary).toEqual(report.summary);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
