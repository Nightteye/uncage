import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { optimizeExtractedCss } from './optimizer.js';

describe('CSS optimization', () => {
  it('preserves runtime selectors by default and removes unused ones only when requested', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-css-'));
    const cssDir = path.join(outputDir, 'public', 'assets', 'css');
    const jsDir = path.join(outputDir, 'public', 'assets', 'js');
    const stylesheet = path.join(cssDir, 'site.css');
    const originalCss = ':root { --brand: #abcdef; } .present { color: red; } .dynamic-only { color: var(--brand); } .unused { color: green; }';
    try {
      await fs.mkdir(cssDir, { recursive: true });
      await fs.mkdir(jsDir, { recursive: true });
      await fs.writeFile(stylesheet, originalCss);
      await fs.writeFile(path.join(jsDir, 'app.js'), 'element.classList.add("dynamic-only")');
      const pages = { '/index': '<html><body class="present"></body></html>' };

      await optimizeExtractedCss(outputDir, pages);
      const preserved = await fs.readFile(stylesheet, 'utf-8');
      expect(preserved).toContain('.dynamic-only');
      expect(preserved).toContain('.unused');
      expect(preserved).toContain('--brand');
      expect(preserved).toContain('var(--brand)');

      await fs.writeFile(stylesheet, originalCss);
      await optimizeExtractedCss(outputDir, pages, true);
      const purged = await fs.readFile(stylesheet, 'utf-8');
      expect(purged).toContain('.present');
      expect(purged).toContain('.dynamic-only');
      expect(purged).not.toContain('.unused');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
