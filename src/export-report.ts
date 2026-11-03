import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { buildRouteFilenameMap } from './formats/html.js';
import { isPathInside } from './path-utils.js';

export interface BrokenLocalReference {
  page: string;
  attribute: string;
  reference: string;
}

export interface ExportReport {
  version: 1;
  sourceUrl: string;
  generatedAt: string;
  summary: {
    pages: number;
    mappedAssets: number;
    totalBytes: number;
    missingPages: number;
    missingAssets: number;
    brokenLocalReferences: number;
    externalResources: number;
  };
  missingPageFiles: string[];
  missingAssetFiles: string[];
  brokenLocalReferences: BrokenLocalReference[];
  referencesTruncated: boolean;
  externalResourceReferences: string[];
  externalReferencesTruncated: boolean;
}

const REPORT_FILE = 'export-report.json';
const MAX_LISTED_REFERENCES = 250;
const LOCAL_ORIGIN = 'https://uncage.invalid';

function localFilePath(outputDir: string, reference: string, pageFile = ''): string | null {
  if (!reference || /^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:)/i.test(reference)) return null;
  try {
    const resolved = new URL(reference, `${LOCAL_ORIGIN}/${pageFile}`);
    if (resolved.origin !== LOCAL_ORIGIN) return null;
    const decodedPath = decodeURIComponent(resolved.pathname);
    const filePath = path.resolve(outputDir, `.${decodedPath}`);
    return isPathInside(outputDir, filePath) ? filePath : null;
  } catch {
    return null;
  }
}

export async function writeExportReport(outputDir: string, sourceUrl: string, routes: string[]): Promise<ExportReport> {
  const routeMap = buildRouteFilenameMap(routes);
  const pageFiles = [...new Set(routes.map((route) => routeMap.get(route)).filter((file): file is string => Boolean(file)))].sort();
  const missingPageFiles: string[] = [];
  const missingAssetFiles: string[] = [];
  const brokenLocalReferences: BrokenLocalReference[] = [];
  const seenReferences = new Set<string>();
  const externalResources = new Set<string>();
  const existence = new Map<string, { exists: boolean; size: number }>();
  let brokenReferenceCount = 0;
  let totalBytes = 0;

  const fileInfo = async (filePath: string): Promise<{ exists: boolean; size: number }> => {
    const cached = existence.get(filePath);
    if (cached) return cached;
    const stat = await fs.stat(filePath).catch(() => null);
    const result = { exists: stat?.isFile() === true, size: stat?.isFile() ? stat.size : 0 };
    existence.set(filePath, result);
    return result;
  };

  for (const pageFile of pageFiles) {
    const pagePath = path.resolve(outputDir, pageFile);
    if (!isPathInside(outputDir, pagePath)) continue;
    const pageInfo = await fileInfo(pagePath);
    if (!pageInfo.exists) {
      missingPageFiles.push(pageFile);
      continue;
    }
    totalBytes += pageInfo.size;
    const $ = cheerio.load(await fs.readFile(pagePath, 'utf-8'));

    const checkReference = async (attribute: string, reference: string, trackExternal = true): Promise<void> => {
      const target = localFilePath(outputDir, reference, pageFile);
      if (!target) {
        if (trackExternal && !/^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:)/i.test(reference)) {
          try {
            const resolved = new URL(reference, `${LOCAL_ORIGIN}/${pageFile}`);
            if ((resolved.protocol === 'http:' || resolved.protocol === 'https:') && resolved.origin !== LOCAL_ORIGIN) {
              externalResources.add(resolved.href);
            }
          } catch { /* malformed reference is outside this report's scope */ }
        }
        return;
      }
      if ((await fileInfo(target)).exists) return;
      const key = `${pageFile}\0${attribute}\0${reference}`;
      if (seenReferences.has(key)) return;
      seenReferences.add(key);
      brokenReferenceCount++;
      if (brokenLocalReferences.length < MAX_LISTED_REFERENCES) {
        brokenLocalReferences.push({ page: pageFile, attribute, reference });
      }
    };

    for (const [selector, attribute] of [
      ['img[src]', 'src'], ['script[src]', 'src'], ['source[src]', 'src'],
      ['video[src]', 'src'], ['video[poster]', 'poster'], ['audio[src]', 'src'],
      ['iframe[src]', 'src'],
    ] as const) {
      for (const element of $(selector).toArray()) {
        const reference = $(element).attr(attribute);
        if (reference) await checkReference(attribute, reference);
      }
    }

    for (const element of $('link[href]').toArray()) {
      const rel = ($(element).attr('rel') || '').toLowerCase();
      if (!/\b(stylesheet|icon|preload|modulepreload|manifest)\b/.test(rel)) continue;
      const reference = $(element).attr('href');
      if (reference) await checkReference('href', reference);
    }
    for (const element of $('a[href]').toArray()) {
      const reference = $(element).attr('href');
      if (!reference || !/\.html(?:[?#]|$)/i.test(reference)) continue;
      await checkReference('href', reference, false);
    }
    for (const element of $('img[srcset], source[srcset]').toArray()) {
      const srcset = $(element).attr('srcset');
      if (!srcset || /data:/i.test(srcset)) continue;
      for (const entry of srcset.split(',')) {
        const reference = entry.trim().split(/\s+/)[0];
        if (reference) await checkReference('srcset', reference);
      }
    }
  }

  let assetMap: Record<string, unknown> = {};
  try {
    assetMap = JSON.parse(await fs.readFile(path.join(outputDir, 'asset-map.json'), 'utf-8')) as Record<string, unknown>;
  } catch { /* empty or failed asset map is reflected by zero mapped assets */ }
  const mappedPaths = new Set<string>();
  if (assetMap && typeof assetMap === 'object' && !Array.isArray(assetMap)) {
    for (const localPath of Object.values(assetMap)) {
      if (typeof localPath === 'string' && localPath.startsWith('/assets/')) mappedPaths.add(localPath);
    }
  }
  for (const localPath of [...mappedPaths].sort()) {
    const filePath = localFilePath(outputDir, localPath);
    if (!filePath) {
      missingAssetFiles.push(localPath);
      continue;
    }
    const info = await fileInfo(filePath);
    if (info.exists) totalBytes += info.size;
    else missingAssetFiles.push(localPath);
  }

  const report: ExportReport = {
    version: 1,
    sourceUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      pages: pageFiles.length,
      mappedAssets: mappedPaths.size,
      totalBytes,
      missingPages: missingPageFiles.length,
      missingAssets: missingAssetFiles.length,
      brokenLocalReferences: brokenReferenceCount,
      externalResources: externalResources.size,
    },
    missingPageFiles,
    missingAssetFiles,
    brokenLocalReferences,
    referencesTruncated: brokenReferenceCount > brokenLocalReferences.length,
    externalResourceReferences: [...externalResources].sort().slice(0, MAX_LISTED_REFERENCES),
    externalReferencesTruncated: externalResources.size > MAX_LISTED_REFERENCES,
  };
  await fs.writeFile(path.join(outputDir, REPORT_FILE), JSON.stringify(report, null, 2));
  return report;
}
