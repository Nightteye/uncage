import { PurgeCSS } from 'purgecss';
import postcss from 'postcss';
import cssnano from 'cssnano';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function optimizeExtractedCss(outputDir: string, pages: Record<string, string>, purgeUnused = false) {
  const cssDir = path.join(outputDir, 'public', 'assets', 'css');
  let files: string[] = [];
  try {
    files = await fs.readdir(cssDir);
  } catch {
    return;
  }

  // Purging is opt-in: runtime scripts can add classes after the captured
  // snapshot, so minification alone is the safe default for visual fidelity.
  let shouldPurge = purgeUnused;
  const purgeContent: Array<{ raw: string; extension: string }> = [];
  if (shouldPurge) {
    try {
      const html = Object.values(pages).join('\n');
      let contentBytes = Buffer.byteLength(html);
      if (contentBytes > 32 * 1024 * 1024) throw new Error('captured HTML exceeds the 32 MB purge input limit');
      purgeContent.push({ raw: html, extension: 'html' });
      const jsDir = path.join(outputDir, 'public', 'assets', 'js');
      const jsFiles = await fs.readdir(jsDir, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [] as string[];
        throw error;
      });
      if (jsFiles.length > 1000) throw new Error('too many JavaScript files for safe CSS purging');
      for (const file of jsFiles.sort()) {
        if (!/\.(?:js|mjs|cjs)$/i.test(file)) continue;
        const script = await fs.readFile(path.join(jsDir, file), 'utf-8');
        contentBytes += Buffer.byteLength(script);
        if (contentBytes > 32 * 1024 * 1024) throw new Error('HTML and JavaScript exceed the 32 MB purge input limit');
        purgeContent.push({ raw: script, extension: 'js' });
      }
    } catch (error) {
      shouldPurge = false;
      console.log(`  [Optimizer] Keeping all CSS selectors: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`  [Optimizer] ${shouldPurge ? 'Purging and minifying' : 'Minifying'} ${files.filter(f => f.endsWith('.css')).length} CSS files...`);
  for (const file of files) {
    if (!file.endsWith('.css')) continue;
    const filePath = path.join(cssDir, file);
    try {
      let css = await fs.readFile(filePath, 'utf-8');
      if (shouldPurge) {
        const purgeResult = await new PurgeCSS().purge({
          content: purgeContent,
          css: [{ raw: css }],
          safelist: [/^(:|::-webkit-|::-moz-|::-ms-|::-o-)/, /^framer-/, /^w-/, /^motion-/, /^animate-/, /^state-/, /active/, /visible/, /hidden/],
        });
        if (purgeResult[0]) css = purgeResult[0].css;
      }
      const result = await postcss([cssnano()]).process(css, { from: filePath, to: filePath });
      await fs.writeFile(filePath, result.css);
    } catch (error) {
      console.log(`        Failed to optimize ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function optimizeImages(imgDir: string) {
  try {
    const sharp = (await import('sharp')).default;
    let files: string[] = [];
    try {
      files = await fs.readdir(imgDir);
    } catch {
      return;
    }

    const candidateFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    });

    if (candidateFiles.length === 0) return;

    let optimizedCount = 0;
    const concurrency = 8;

    for (let i = 0; i < candidateFiles.length; i += concurrency) {
      const chunk = candidateFiles.slice(i, i + concurrency);
      await Promise.allSettled(chunk.map(async (file) => {
        const ext = path.extname(file).toLowerCase();
        const filePath = path.join(imgDir, file);

        try {
          const originalBuffer = await fs.readFile(filePath);
          let optimizedBuffer: Buffer | null = null;

          if (ext === '.png') {
            // animated:true keeps APNG frames; plain PNGs are handled identically
            optimizedBuffer = await sharp(originalBuffer, { animated: true }).png({ compressionLevel: 9, effort: 7 }).toBuffer();
          } else if (ext === '.jpg' || ext === '.jpeg') {
            optimizedBuffer = await sharp(originalBuffer).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
          } else if (ext === '.webp') {
            optimizedBuffer = await sharp(originalBuffer, { animated: true }).webp({ quality: 85, effort: 6 }).toBuffer();
          } else if (ext === '.gif') {
            optimizedBuffer = await sharp(originalBuffer, { animated: true }).gif({ effort: 7 }).toBuffer();
          }

          // Only overwrite if the optimized version is strictly smaller than the original
          if (optimizedBuffer && optimizedBuffer.length < originalBuffer.length) {
            await fs.writeFile(filePath, optimizedBuffer);
            optimizedCount++;
          }
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  [Optimizer] Skipped image ${file}: ${msg}`);
        }
      }));
    }

    if (optimizedCount > 0) {
      console.log(`  [Optimizer] Concurrently optimized ${optimizedCount} images (smaller file sizes preserved)`);
    }
  } catch {
    // Sharp optional / graceful fallback
  }
}


export function synthesizeFramerBreakpoints(htmlContent: string) {
  let css = '';
  const regex = /<style[^>]*data-framer-css[^>]*>([\s\S]*?)<\/style>/g;
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    if (match[1]) css += match[1] + '\n';
  }
  return css;
}
