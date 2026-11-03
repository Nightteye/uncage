import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { buildRouteFilenameMap } from './formats/html.js';
import { isPathInside } from './path-utils.js';

interface GeneratedFiles {
  pages: Set<string>;
  assets: Set<string>;
}

const MANIFEST_FILE = '.uncage-manifest.json';

function safeGeneratedPath(value: unknown, kind: 'page' | 'asset'): string | null {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/')) return null;
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  if (kind === 'page' && !value.endsWith('.html')) return null;
  if (kind === 'asset' && (parts[0] !== 'assets' || parts.length < 2)) return null;
  return value;
}

async function mappedAssets(outputDir: string): Promise<Set<string>> {
  const assets = new Set<string>();
  try {
    const map = JSON.parse(await fs.readFile(path.join(outputDir, 'asset-map.json'), 'utf-8')) as Record<string, unknown>;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return assets;
    for (const [remoteUrl, localValue] of Object.entries(map)) {
      const local = safeGeneratedPath(typeof localValue === 'string' ? localValue.replace(/^\//, '') : null, 'asset');
      if (!local || typeof localValue !== 'string' || !localValue.startsWith('/assets/')) continue;
      assets.add(local);
      try {
        const originalName = path.posix.basename(new URL(remoteUrl).pathname);
        const alias = safeGeneratedPath(path.posix.join(path.posix.dirname(local), originalName), 'asset');
        if (alias) assets.add(alias);
      } catch { /* malformed remote URL has no generated alias */ }
    }
  } catch { /* no previous asset map */ }
  return assets;
}

export async function readGeneratedFiles(outputDir: string): Promise<GeneratedFiles> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(outputDir, MANIFEST_FILE), 'utf-8')) as {
      version?: number; pages?: unknown; assets?: unknown;
    };
    if (manifest.version === 1 && Array.isArray(manifest.pages) && Array.isArray(manifest.assets)) {
      return {
        pages: new Set(manifest.pages.map((value) => safeGeneratedPath(value, 'page')).filter((value): value is string => Boolean(value))),
        assets: new Set(manifest.assets.map((value) => safeGeneratedPath(value, 'asset')).filter((value): value is string => Boolean(value))),
      };
    }
  } catch { /* older exports have no manifest */ }

  // Older exports list generated pages in their README and assets in asset-map.json.
  const pages = new Set<string>();
  try {
    const readme = await fs.readFile(path.join(outputDir, 'README.md'), 'utf-8');
    if (readme.startsWith('# Static Website Clone\n') || readme.startsWith('# Static Website Clone\r\n')) {
      for (const match of readme.matchAll(/^- \[[^\]]+\]\(\.\/([^)]+)\) \(Source route: `[^`]*`\)$/gm)) {
        const page = safeGeneratedPath(match[1], 'page');
        if (page) pages.add(page);
      }
    }
  } catch { /* no previous README */ }
  return { pages, assets: await mappedAssets(outputDir) };
}

export async function reconcileGeneratedFiles(outputDir: string, previous: GeneratedFiles, routes: string[]): Promise<void> {
  const pages = new Set<string>();
  for (const filename of buildRouteFilenameMap(routes).values()) {
    const safe = safeGeneratedPath(filename, 'page');
    if (safe) pages.add(safe);
  }
  const assets = await mappedAssets(outputDir);
  let outputRoot: string;
  try {
    outputRoot = await fs.realpath(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    const stat = await fs.lstat(outputDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw error;
    outputRoot = path.resolve(await fs.realpath(path.dirname(outputDir)), path.basename(outputDir));
  }
  const archiveRoot = path.join(path.dirname(outputDir), '.uncage-archive', path.basename(outputDir), `${Date.now()}-${crypto.randomUUID()}`);
  let archiveReady = false;

  const filePairs: Array<[Set<string>, Set<string>]> = [[previous.pages, pages], [previous.assets, assets]];
  for (const [oldFiles, currentFiles] of filePairs) {
    for (const relative of oldFiles) {
      if (currentFiles.has(relative)) continue;
      const source = path.resolve(outputRoot, ...relative.split('/'));
      if (!isPathInside(outputRoot, source)) continue;
      const sourceParent = path.resolve(path.dirname(source)) === path.resolve(outputRoot)
        ? outputRoot
        : await fs.realpath(path.dirname(source)).catch(() => null);
      if (!sourceParent || !isPathInside(outputRoot, sourceParent)) continue;
      const stat = await fs.lstat(source).catch(() => null);
      if (!stat || (!stat.isFile() && !stat.isSymbolicLink())) continue;
      if (!archiveReady) {
        await fs.mkdir(archiveRoot, { recursive: true });
        const archiveReal = await fs.realpath(archiveRoot);
        const outputParentReal = await fs.realpath(path.dirname(outputDir));
        if (!isPathInside(outputParentReal, archiveReal)) throw new Error('Archive path escapes the output directory');
        archiveReady = true;
      }
      const archivePath = path.join(archiveRoot, ...relative.split('/'));
      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await fs.rename(source, archivePath);
    }
  }

  await fs.writeFile(path.join(outputDir, MANIFEST_FILE), JSON.stringify({
    version: 1,
    pages: [...pages].sort(),
    assets: [...assets].sort(),
  }, null, 2));
}
