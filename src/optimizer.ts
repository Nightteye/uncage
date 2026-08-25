import { PurgeCSS } from 'purgecss';
import postcss from 'postcss';
import cssnano from 'cssnano';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function optimizeExtractedCss(outputDir: string, pages: Record<string, string>) {
  const cssDir = path.join(outputDir, 'public', 'assets', 'css');
  let files: string[] = [];
  try {
    files = await fs.readdir(cssDir);
  } catch {
    return;
  }

  // Write a temporary file with all HTML content to feed into PurgeCSS
  const tempHtmlPath = path.join(outputDir, '.temp-purge-content.html');
  const allHtml = Object.values(pages).join('\n');
  await fs.writeFile(tempHtmlPath, allHtml);

  console.log(`  [Optimizer] Purging and minifying ${files.filter(f => f.endsWith('.css')).length} CSS files...`);
  
  for (const file of files) {
    if (!file.endsWith('.css')) continue;
    const filePath = path.join(cssDir, file);
    
    const jsGlob = path.join(outputDir, 'public', 'assets', 'js', '*.{js,mjs}').replace(/\\/g, '/');
    try {
      const purgeResult = await new PurgeCSS().purge({
        content: [tempHtmlPath, jsGlob],
        css: [filePath],
        safelist: [/^(:|::-webkit-|::-moz-|::-ms-|::-o-)/, /^framer-/, /^w-/, /^motion-/, /^animate-/, /^state-/, /active/, /visible/, /hidden/]
      });

      if (purgeResult && purgeResult[0]) {
        const purgedCss = purgeResult[0].css;
        const result = await postcss([cssnano()]).process(purgedCss, { from: filePath, to: filePath });
        await fs.writeFile(filePath, result.css);
      }
    } catch (e: any) {
      console.log(`        Failed to optimize ${file}: ${e.message}`);
    }
  }

  // Cleanup
  await fs.unlink(tempHtmlPath).catch(() => {});
}

export async function optimizeImages(imgDir: string) {
  try {
    const sharp = (await import('sharp')).default;
    const files = await fs.readdir(imgDir);
    let optimizedCount = 0;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const filePath = path.join(imgDir, file);

      try {
        const originalBuffer = await fs.readFile(filePath);
        let optimizedBuffer: Buffer | null = null;

        if (ext === '.png') {
          optimizedBuffer = await sharp(originalBuffer).png({ compressionLevel: 9, effort: 7 }).toBuffer();
        } else if (ext === '.jpg' || ext === '.jpeg') {
          optimizedBuffer = await sharp(originalBuffer).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        } else if (ext === '.webp') {
          optimizedBuffer = await sharp(originalBuffer).webp({ quality: 85, effort: 6 }).toBuffer();
        }

        // Only overwrite if the optimized version is strictly smaller than the original
        if (optimizedBuffer && optimizedBuffer.length < originalBuffer.length) {
          await fs.writeFile(filePath, optimizedBuffer);
          optimizedCount++;
        }
      } catch {}
    }

    if (optimizedCount > 0) {
      console.log(`  [Optimizer] Optimized ${optimizedCount} images (smaller file sizes preserved)`);
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
