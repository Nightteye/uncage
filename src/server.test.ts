import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseCloneOptions } from './server.js';
import { isPathInside } from './path-utils.js';

describe('preview path containment', () => {
  it('rejects traversal and a sibling with the same directory prefix', () => {
    const root = path.resolve('output', 'site');
    expect(isPathInside(root, path.join(root, 'assets', 'image.png'))).toBe(true);
    expect(isPathInside(root, path.resolve('output', 'site-copy', 'private.html'))).toBe(false);
    expect(isPathInside(root, path.resolve(root, '..', 'private.html'))).toBe(false);
  });
});

describe('web UI clone option validation', () => {
  it('normalizes supported crawl-intelligence options with robots respected by default', () => {
    expect(parseCloneOptions({ maxPages: 12, maxDepth: 2, timeout: 45000, respectRobots: false, priorityOnly: true }))
      .toMatchObject({
        maxPages: 12,
        maxDepth: 2,
        timeout: 45000,
        respectRobots: false,
        priorityOnly: true,
      });
    expect(parseCloneOptions({}).respectRobots).toBe(true);
    expect(parseCloneOptions({}).purge).toBe(false);
    expect(parseCloneOptions({ purgeCss: true }).purge).toBe(true);
    expect(parseCloneOptions({ noPurge: false }).purge).toBe(true);
    expect(parseCloneOptions({ purgeCss: true, noPurge: true }).purge).toBe(false);
    expect(parseCloneOptions({ plugins: [{ onPageCrawl: 'not executable' }] }).plugins).toBeUndefined();
  });

  it('rejects invalid numeric and boolean web API input before a job starts', () => {
    expect(() => parseCloneOptions({ maxDepth: -1 })).toThrow('"maxDepth"');
    expect(() => parseCloneOptions({ maxPages: 1.5 })).toThrow('"maxPages"');
    expect(() => parseCloneOptions({ respectRobots: 'yes' })).toThrow('"respectRobots"');
    expect(() => parseCloneOptions({ purgeCss: 'yes' })).toThrow('"purgeCss"');
  });
});

describe('web UI crawl controls', () => {
  it('renders and submits max depth, robots, and priority-only controls', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    expect(html).toContain('id="maxDepth"');
    expect(html).toContain('id="respectRobots"');
    expect(html).toContain('id="priorityOnly"');
    expect(html).toContain('id="purgeCss"');
    expect(html).toContain("num('maxDepth')");
    expect(html).toContain("bool('respectRobots')");
    expect(html).toContain("bool('priorityOnly')");
    expect(html).toContain("bool('purgeCss')");
    expect(html).toContain('href="/react-cloner-status"');
  });

  it('includes a clear React cloner status page for contributors', async () => {
    const html = await fs.readFile(new URL('./ui/react-cloner-status.html', import.meta.url), 'utf-8');
    expect(html).toContain('The React TSX/JSX cloner is');
    expect(html).toContain('paused indefinitely');
    expect(html).toContain('pull requests are welcome');
  });

  it('renders download ZIP button for completed exports', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    expect(html).toContain('instance-btn-zip');
    expect(html).toContain('/api/download?jobId=');
    expect(html).toContain('>.ZIP<');
  });

  it('shows the export quality report in completed job cards', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    const server = await fs.readFile(new URL('./server.ts', import.meta.url), 'utf-8');
    expect(html).toContain('Export quality report');
    expect(html).toContain('/api/report?jobId=');
    expect(html).toContain("row.textContent = typeof item === 'string'");
    expect(server).toContain("pathname === '/api/report'");
    expect(server).toContain('isPathInside(outputRoot, jobDir)');
    expect(server).toContain('isPathInside(jobDir, reportPath)');
  });

  it('synchronizes and restores instances across page reloads and tab switches', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    expect(html).toContain('syncInstances()');
    expect(html).toContain("fetch('/api/status')");
    expect(html).toContain("window.addEventListener('focus', syncInstances)");
  });
});
