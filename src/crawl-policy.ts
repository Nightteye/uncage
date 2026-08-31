export interface RobotsRule {
  directive: 'allow' | 'disallow';
  path: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelayMs?: number;
  sitemapUrls: string[];
}

export interface SitemapCandidate {
  url: string;
  priority: number;
}

export interface ParsedSitemap {
  urls: SitemapCandidate[];
  sitemapUrls: string[];
}

export interface CrawlCandidate {
  url: string;
  depth: number;
  isSeed?: boolean;
  isNavigation?: boolean;
  inboundLinks?: number;
  sitemapPriority?: number;
}

export interface SitemapDiscoveryResult {
  candidates: SitemapCandidate[];
  warnings: string[];
}

export const MAX_SITEMAP_DOCUMENTS = 25;
export const MAX_SITEMAP_URLS = 10_000;

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

function stripComment(line: string): string {
  return line.replace(/#.*/, '').trim();
}

/** Parse robots.txt for a named crawler, falling back to the wildcard group. */
export function parseRobotsTxt(text: string, userAgent = 'Uncage'): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup = { agents: [], rules: [] };

  const finishGroup = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], rules: [] };
  };

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemapUrls.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (current.rules.length > 0 || current.crawlDelayMs !== undefined) finishGroup();
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if (current.agents.length === 0) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "allow everything" and must not become a match-all rule.
      if (value) current.rules.push({ directive: field, path: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1000;
    }
  }
  finishGroup();

  const agent = userAgent.toLowerCase();
  const exactGroups = groups.filter((group) => group.agents.includes(agent));
  const selected = exactGroups.length > 0
    ? exactGroups
    : groups.filter((group) => group.agents.includes('*'));

  const crawlDelayMs = selected.find((group) => group.crawlDelayMs !== undefined)?.crawlDelayMs;
  return {
    rules: selected.flatMap((group) => group.rules),
    sitemapUrls: [...new Set(sitemapUrls)],
    ...(crawlDelayMs !== undefined ? { crawlDelayMs } : {}),
  };
}

function robotsPatternMatches(path: string, pattern: string): boolean {
  const endsWithAnchor = pattern.endsWith('$');
  const source = pattern.slice(0, endsWithAnchor ? -1 : undefined)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try {
    return new RegExp(`^${source}${endsWithAnchor ? '$' : ''}`).test(path);
  } catch {
    return false;
  }
}

/** Apply the robots longest-match rule; Allow wins a same-length tie. */
export function canCrawlUrl(url: string, policy: RobotsPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const path = `${parsed.pathname}${parsed.search}`;
  let winner: RobotsRule | undefined;
  for (const rule of policy.rules) {
    if (!robotsPatternMatches(path, rule.path)) continue;
    if (!winner || rule.path.length > winner.path.length ||
      (rule.path.length === winner.path.length && rule.directive === 'allow')) {
      winner = rule;
    }
  }
  return winner?.directive !== 'disallow';
}

/** Canonical document identity: HTTP(S), no fragment/query, normalized trailing slash. */
export function canonicalDocumentUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    url.search = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return null;
  }
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim();
}

function extractLoc(block: string): string | null {
  const match = block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
  return match?.[1] ? decodeXml(match[1]) : null;
}

/** Parse either a sitemap urlset or sitemap index without requiring an XML dependency. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const urls: SitemapCandidate[] = [];
  const sitemapUrls: string[] = [];
  if (/<sitemapindex\b/i.test(xml)) {
    for (const block of xml.matchAll(/<sitemap\b[^>]*>[\s\S]*?<\/sitemap>/gi)) {
      const loc = extractLoc(block[0]);
      if (loc) sitemapUrls.push(loc);
    }
  }
  if (/<urlset\b/i.test(xml)) {
    for (const block of xml.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/gi)) {
      const loc = extractLoc(block[0]);
      if (!loc) continue;
      const priorityMatch = block[0].match(/<priority\b[^>]*>\s*([\d.]+)\s*<\/priority>/i);
      const rawPriority = priorityMatch?.[1] ? Number(priorityMatch[1]) : 0.5;
      urls.push({ url: loc, priority: Number.isFinite(rawPriority) ? Math.max(0, Math.min(1, rawPriority)) : 0.5 });
    }
  }
  return { urls, sitemapUrls: [...new Set(sitemapUrls)] };
}

export async function discoverSitemapCandidates(
  origin: string,
  declaredSitemaps: string[],
  policy: RobotsPolicy,
  fetchImpl: FetchLike = fetch,
): Promise<SitemapDiscoveryResult> {
  const warnings: string[] = [];
  const documents: string[] = [];
  const seenDocuments = new Set<string>();
  const seenPages = new Map<string, SitemapCandidate>();
  const enqueueDocument = (raw: string) => {
    const canonical = canonicalDocumentUrl(raw);
    if (!canonical || new URL(canonical).origin !== origin || seenDocuments.has(canonical)) return;
    seenDocuments.add(canonical);
    documents.push(canonical);
  };

  for (const sitemap of declaredSitemaps) enqueueDocument(sitemap);
  enqueueDocument(`${origin}/sitemap.xml`);
  enqueueDocument(`${origin}/sitemap_index.xml`);

  for (let index = 0; index < documents.length && index < MAX_SITEMAP_DOCUMENTS; index++) {
    const sitemapUrl = documents[index];
    if (!sitemapUrl) continue;
    try {
      const response = await fetchImpl(sitemapUrl, { headers: { 'User-Agent': 'Uncage' } });
      if (!response.ok) continue;
      const parsed = parseSitemapXml(await response.text());
      for (const nested of parsed.sitemapUrls) enqueueDocument(nested);
      for (const entry of parsed.urls) {
        const canonical = canonicalDocumentUrl(entry.url);
        if (!canonical || new URL(canonical).origin !== origin || !canCrawlUrl(canonical, policy)) continue;
        const current = seenPages.get(canonical);
        if (!current || entry.priority > current.priority) seenPages.set(canonical, { url: canonical, priority: entry.priority });
        if (seenPages.size >= MAX_SITEMAP_URLS) break;
      }
    } catch (error) {
      warnings.push(`Could not read sitemap ${sitemapUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { candidates: [...seenPages.values()], warnings };
}

export function rankCrawlCandidates(a: CrawlCandidate, b: CrawlCandidate): number {
  if (Boolean(a.isSeed) !== Boolean(b.isSeed)) return a.isSeed ? -1 : 1;
  const sitemapDiff = (b.sitemapPriority ?? -1) - (a.sitemapPriority ?? -1);
  if (sitemapDiff !== 0) return sitemapDiff;
  if (Boolean(a.isNavigation) !== Boolean(b.isNavigation)) return a.isNavigation ? -1 : 1;
  const inboundDiff = (b.inboundLinks ?? 0) - (a.inboundLinks ?? 0);
  if (inboundDiff !== 0) return inboundDiff;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.url.localeCompare(b.url);
}

export function isEligibleCrawlCandidate(candidate: CrawlCandidate, maxDepth: number | undefined, priorityOnly: boolean): boolean {
  if (maxDepth !== undefined && candidate.depth > maxDepth) return false;
  if (!priorityOnly) return true;
  return candidate.isSeed === true || candidate.isNavigation === true || (candidate.sitemapPriority ?? -1) >= 0.5;
}

/** Minimum wait before the next document navigation, including existing anti-WAF jitter. */
export function crawlWaitMs(crawlDelayMs: number | undefined, lastNavigationStartedAt: number | undefined, now: number, jitterMs: number): number {
  const delayRemaining = crawlDelayMs === undefined || lastNavigationStartedAt === undefined
    ? 0
    : Math.max(0, crawlDelayMs - (now - lastNavigationStartedAt));
  return Math.max(delayRemaining, jitterMs);
}
