# Plugin Hooks

Uncage loads an optional `uncage.config.ts` from the current working directory. The hooks apply to direct CLI exports, Web UI exports, and calls to the shared clone pipeline.

```ts
import type { UncageConfig } from '@nightteye/uncage';

export default {
  plugins: [
    {
      name: 'captured-marker',
      onPageCrawl({ url, depth, html }) {
        console.log(`Captured ${url} at depth ${depth}`);
        return html;
      },
      onAssetFetch({ contentType, localPath, size }) {
        console.log(`Saved ${localPath} (${contentType}, ${size} bytes)`);
      },
      onHTMLRewrite({ html }) {
        return html.replace(/<body(?=[\s>])/i, '<body data-captured-by="uncage-plugin"');
      },
      async onAssemble({ outputDir, routes }) {
        console.log(`Assembled ${routes.length} pages in ${outputDir}`);
      },
    },
  ],
} satisfies UncageConfig;
```

## Hooks

- `onPageCrawl` runs after a page is captured and before its links are discovered. Return a string to replace the captured HTML.
- `onAssetFetch` runs after a downloaded asset is saved. It receives the source URL, content type, staging file path, local URL, and byte size. The staging file may move during assembly, so edit it during the hook if needed.
- `onHTMLRewrite` runs after asset URLs are mapped and before the static HTML compiler. Return a string to replace the rewritten HTML.
- `onAssemble` runs after Uncage writes the static site files. It receives the output folder, source URL, and page routes.

Hooks run in config order and may be asynchronous. If a hook throws or returns an invalid value, Uncage logs a warning and continues with the last successful result. The config is executable local TypeScript; use only config files you trust.
