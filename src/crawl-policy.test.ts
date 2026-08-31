import { describe, expect, it } from 'vitest';
import {
  canCrawlUrl,
  canonicalDocumentUrl,
  crawlWaitMs,
  discoverSitemapCandidates,
  isEligibleCrawlCandidate,
  parseRobotsTxt,
  parseSitemapXml,
  rankCrawlCandidates,
} from './crawl-policy.js';

describe('robots.txt policy', () => {
  it('uses the named user agent before wildcard and obeys longest Allow/Disallow matching', () => {
    const policy = parseRobotsTxt(`
User-agent: *
Disallow: /private
Crawl-delay: 9

User-agent: Uncage
Disallow: /admin
Allow: /admin/help
Crawl-delay: 2
Sitemap: https://example.com/custom.xml
`);
    expect(policy.crawlDelayMs).toBe(2000);
    expect(policy.sitemapUrls).toEqual(['https://example.com/custom.xml']);
    expect(canCrawlUrl('https://example.com/private', policy)).toBe(true);
    expect(canCrawlUrl('https://example.com/admin', policy)).toBe(false);
    expect(canCrawlUrl('https://example.com/admin/help', policy)).toBe(true);
  });

  it('treats malformed, empty, and unavailable-policy equivalents as permissive', () => {
    const policy = parseRobotsTxt('Disallow: /ignored\nUser-agent: *\nDisallow:');
    expect(canCrawlUrl('https://example.com/anything', policy)).toBe(true);
  });
});

describe('sitemap parsing and discovery', () => {
  it('parses urlset priorities and sitemap indexes', () => {
    expect(parseSitemapXml('<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc><priority>0.8</priority></url></urlset>').urls)
      .toEqual([{ url: 'https://example.com/a?x=1&y=2', priority: 0.8 }]);
    expect(parseSitemapXml('<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>').sitemapUrls)
      .toEqual(['https://example.com/child.xml']);
  });

  it('follows same-origin sitemap indexes, filters robots exclusions, and ignores failed fallbacks', async () => {
    const policy = parseRobotsTxt('User-agent: Uncage\nDisallow: /blocked');
    const bodies = new Map([
      ['https://example.com/root.xml', '<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>'],
      ['https://example.com/child.xml', '<urlset><url><loc>https://example.com/open</loc><priority>0.9</priority></url><url><loc>https://example.com/blocked</loc></url><url><loc>https://other.example.com/nope</loc></url></urlset>'],
    ]);
    const result = await discoverSitemapCandidates('https://example.com', ['https://example.com/root.xml'], policy, async (url) => ({
      ok: bodies.has(url), status: bodies.has(url) ? 200 : 404, text: async () => bodies.get(url) || '',
    }));
    expect(result.candidates).toEqual([{ url: 'https://example.com/open', priority: 0.9 }]);
  });
});

describe('crawl candidate ordering and limits', () => {
  it('is deterministic and prioritizes seed, sitemap, navigation, inbound links, and depth', () => {
    const candidates = [
      { url: 'https://example.com/z', depth: 1, isNavigation: true },
      { url: 'https://example.com/sitemap', depth: 1, sitemapPriority: 0.7 },
      { url: 'https://example.com/', depth: 0, isSeed: true },
      { url: 'https://example.com/a', depth: 1, inboundLinks: 2 },
      { url: 'https://example.com/b', depth: 2, inboundLinks: 2 },
    ].sort(rankCrawlCandidates);
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      'https://example.com/', 'https://example.com/sitemap', 'https://example.com/z', 'https://example.com/a', 'https://example.com/b',
    ]);
  });

  it('enforces max depth and priority-only eligibility', () => {
    expect(isEligibleCrawlCandidate({ url: 'https://example.com/', depth: 0, isSeed: true }, 0, true)).toBe(true);
    expect(isEligibleCrawlCandidate({ url: 'https://example.com/deep', depth: 2, isNavigation: true }, 1, false)).toBe(false);
    expect(isEligibleCrawlCandidate({ url: 'https://example.com/body', depth: 1 }, undefined, true)).toBe(false);
    expect(isEligibleCrawlCandidate({ url: 'https://example.com/map', depth: 1, sitemapPriority: 0.5 }, undefined, true)).toBe(true);
    expect(canonicalDocumentUrl('https://example.com/path/?q=1#section')).toBe('https://example.com/path');
  });

  it('honors Crawl-delay while preserving jitter', () => {
    expect(crawlWaitMs(2000, 1000, 1500, 300)).toBe(1500);
    expect(crawlWaitMs(2000, 1000, 3500, 300)).toBe(300);
  });
});
