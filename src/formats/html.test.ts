import { describe, it, expect } from 'vitest';
import { routeToHtmlFilename, buildRouteFilenameMap } from './html.js';

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
});