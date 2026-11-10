import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { routeToHtmlFilename, buildRouteFilenameMap, htmlStrategy } from './html.js';

describe('HTML format utilities', () => {
  describe('routeToHtmlFilename', () => {
    it('converts root route to index.html', () => {
      expect(routeToHtmlFilename('/')).toBe('index.html');
      expect(routeToHtmlFilename('/index')).toBe('index.html');
    });

    it('converts simple routes', () => {
      expect(routeToHtmlFilename('/about')).toBe('about.html');
      expect(routeToHtmlFilename('/contact')).toBe('contact.html');
      expect(routeToHtmlFilename('/blog')).toBe('blog.html');
    });

    it('handles nested routes (preserves directory structure)', () => {
      expect(routeToHtmlFilename('/blog/post')).toBe('blog/post.html');
      expect(routeToHtmlFilename('/products/category/item')).toBe('products/category/item.html');
    });

    it('removes trailing slashes', () => {
      expect(routeToHtmlFilename('/about/')).toBe('about.html');
      expect(routeToHtmlFilename('/blog/post/')).toBe('blog/post.html');
    });

    it('strips .html extension from route', () => {
      expect(routeToHtmlFilename('/page.html')).toBe('page.html');
    });

    it('gives query routes distinct stable filenames', () => {
      const first = routeToHtmlFilename('/search?q=alpha');
      expect(first).toBe(routeToHtmlFilename('/search?q=alpha'));
      expect(first).not.toBe(routeToHtmlFilename('/search?q=beta'));
      expect(first).not.toBe(routeToHtmlFilename('/search'));
    });

    it('sanitizes special characters but preserves slashes', () => {
      expect(routeToHtmlFilename('/my page')).toBe('my-page.html');
      expect(routeToHtmlFilename('/page@name')).toBe('page-name.html');
      expect(routeToHtmlFilename('/path/with spaces')).toBe('path/with-spaces.html');
    });
  });

  describe('buildRouteFilenameMap', () => {
    it('creates deterministic mapping for routes', () => {
      const routes = ['/', '/about', '/contact', '/blog/post'];
      const map = buildRouteFilenameMap(routes);

      expect(map.get('/')).toBe('index.html');
      expect(map.get('/index')).toBe('index.html');
      expect(map.get('/about')).toBe('about.html');
      expect(map.get('/contact')).toBe('contact.html');
      expect(map.get('/blog/post')).toBe('blog/post.html');
    });

    it('handles route collisions with hash disambiguation', () => {
      const routes = ['/page', '/page-2', '/page_3'];
      const map = buildRouteFilenameMap(routes);

      const filenames = Array.from(map.values());
      const uniqueFilenames = new Set(filenames);
      expect(filenames.length).toBe(uniqueFilenames.size);
    });

    it('handles trailing slash routes', () => {
      const routes = ['/about/'];
      const map = buildRouteFilenameMap(routes);

      expect(map.get('/about/')).toBe('about.html');
      expect(map.get('/about')).toBe('about.html');
    });

    it('handles home route collision', () => {
      const routes = ['/', '/index', '/home'];
      const map = buildRouteFilenameMap(routes);

      expect(map.get('/')).toBe('index.html');
      expect(map.get('/index')).toBe('index.html');
      expect(map.get('/home')).toBe('home.html');
    });

    it('is deterministic regardless of input order', () => {
      const a = buildRouteFilenameMap(['/page', '/page-2', '/page_3']);
      const b = buildRouteFilenameMap(['/page_3', '/page', '/page-2']);
      expect(Array.from(a.entries())).toEqual(Array.from(b.entries()));
    });
  });

  it('rewrites links to the captured query route and retains fragment links', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uncage-query-routes-'));
    try {
      const pages = {
        '/index': '<html><head></head><body><a href="/search?q=alpha#result">Result</a></body></html>',
        '/search?q=alpha': '<html><head></head><body><a href="?q=beta">Next</a></body></html>',
        '/search?q=beta': '<html><head></head><body>Beta</body></html>',
      };
      await htmlStrategy.compile(outputDir, pages);
      const map = buildRouteFilenameMap(Object.keys(pages));
      const index = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      const alpha = await fs.readFile(path.join(outputDir, map.get('/search?q=alpha')!), 'utf-8');
      expect(index).toContain(`href="./${map.get('/search?q=alpha')}#result"`);
      expect(alpha).toContain(`href="./${map.get('/search?q=beta')}"`);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
