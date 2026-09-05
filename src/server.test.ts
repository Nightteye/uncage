import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { parseCloneOptions } from './server.js';

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
  });

  it('rejects invalid numeric and boolean web API input before a job starts', () => {
    expect(() => parseCloneOptions({ maxDepth: -1 })).toThrow('"maxDepth"');
    expect(() => parseCloneOptions({ maxPages: 1.5 })).toThrow('"maxPages"');
    expect(() => parseCloneOptions({ respectRobots: 'yes' })).toThrow('"respectRobots"');
  });
});

describe('web UI crawl controls', () => {
  it('renders and submits max depth, robots, and priority-only controls', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    expect(html).toContain('id="maxDepth"');
    expect(html).toContain('id="respectRobots"');
    expect(html).toContain('id="priorityOnly"');
    expect(html).toContain("num('maxDepth')");
    expect(html).toContain("bool('respectRobots')");
    expect(html).toContain("bool('priorityOnly')");
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

  it('synchronizes and restores instances across page reloads and tab switches', async () => {
    const html = await fs.readFile(new URL('./ui/index.html', import.meta.url), 'utf-8');
    expect(html).toContain('syncInstances()');
    expect(html).toContain("fetch('/api/status')");
    expect(html).toContain("window.addEventListener('focus', syncInstances)");
  });
});
