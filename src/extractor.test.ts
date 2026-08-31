import { describe, it, expect } from 'vitest';
import { rewriteHtml, rawFileNameForRoute, globToRegExp, shouldFetchUrl } from './extractor.js';

describe('rewriteHtml asset URL rewriting', () => {
  it('rewrites a query-string URL containing & when HTML-encoded as &amp;', () => {
    const assetMap = {
      'https://cdn.example.com/img.png?x=1&y=2': '/assets/images/img-abc123.png',
    };
    const html = '<img src="https://cdn.example.com/img.png?x=1&amp;y=2" />';
    const result = rewriteHtml(html, 'https://site.com/', assetMap, 'https://site.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('/assets/images/img-abc123.png');
      expect(result.value).not.toContain('cdn.example.com');
    }
  });

  it('still rewrites a plain (non-encoded) URL', () => {
    const assetMap = {
      'https://cdn.example.com/style.css': '/assets/css/style-abc.css',
    };
    const html = '<link rel="stylesheet" href="https://cdn.example.com/style.css" />';
    const result = rewriteHtml(html, 'https://site.com/', assetMap, 'https://site.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('/assets/css/style-abc.css');
    }
  });
});

describe('rawFileNameForRoute', () => {
  it('does not collide for routes that sanitize to the same prefix', () => {
    const a = rawFileNameForRoute('/about/us');
    const b = rawFileNameForRoute('/about-us');
    expect(a).not.toBe(b);
  });

  it('is deterministic for a given route', () => {
    expect(rawFileNameForRoute('/about/us')).toBe(rawFileNameForRoute('/about/us'));
  });

  it('maps home and index to captured-raw.html', () => {
    expect(rawFileNameForRoute('/')).toBe('captured-raw.html');
    expect(rawFileNameForRoute('/index')).toBe('captured-raw.html');
  });
});

describe('globToRegExp', () => {
  it('supports * and ? wildcards', () => {
    expect(globToRegExp('https://*.example.com/*')?.test('https://cdn.example.com/a')).toBe(true);
    expect(globToRegExp('https://cdn.example.com/file?.js')?.test('https://cdn.example.com/file1.js')).toBe(true);
  });

  it('supports [range] character classes', () => {
    const re = globToRegExp('https://cdn.example.com/file[0-9].js');
    expect(re?.test('https://cdn.example.com/file5.js')).toBe(true);
    expect(re?.test('https://cdn.example.com/filex.js')).toBe(false);
  });

  it('returns null for unbalanced brackets', () => {
    expect(globToRegExp('https://cdn.example.com/file[0-9.js')).toBeNull();
  });
});

describe('shouldFetchUrl', () => {
  it('allows everything when no filters are set (regression: empty list must not block)', () => {
    expect(shouldFetchUrl('https://cdn.example.com/lib.js', [], [])).toBe(true);
    expect(shouldFetchUrl('https://respawn.sh/_next/static/chunks/x.js', [], [])).toBe(true);
  });

  it('blocks URLs matching the blocklist', () => {
    expect(shouldFetchUrl('https://ads.example.com/track.js', [], ['https://ads.example.com/*'])).toBe(false);
  });

  it('allows only URLs matching the allowlist when it is set', () => {
    expect(shouldFetchUrl('https://cdn.example.com/a.js', ['https://cdn.example.com/*'], [])).toBe(true);
    expect(shouldFetchUrl('https://other.example.com/b.js', ['https://cdn.example.com/*'], [])).toBe(false);
  });

  it('blocklist takes precedence over allowlist', () => {
    expect(shouldFetchUrl('https://cdn.example.com/a.js', ['https://cdn.example.com/*'], ['https://cdn.example.com/a.js'])).toBe(false);
  });
});
