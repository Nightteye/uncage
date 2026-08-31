# Static HTML pivot announcement

## What changed

Uncage now has one supported export target: a standalone static HTML, CSS, and JavaScript project. React TSX and JSX export are paused indefinitely while the static pipeline receives the reliability work it needs. The underlying React code remains in the repository, but it is not available through the CLI, wizard, or web UI.

The default experience is now a local browser UI. Run `uncage` (or `npm start` inside this repository), paste a site URL, and follow the live progress feed. Passing a URL still runs the direct headless CLI flow:

```bash
uncage https://example.com -o example-clone
```

## Migration for existing users

- Remove `--format` and `--interactive` from scripts and automation; they are no longer supported.
- Treat every export as static HTML/CSS/JS.
- Run `uncage --ui` to open the browser interface explicitly, or pass a URL for direct cloning.
- Preview an export with `cd output/<name> && npm run preview`.

## Reliability improvements

This release fixes the regression that prevented non-Framer sites from retaining their fetched assets. Empty URL filter lists had incorrectly aborted every subresource request, causing Next.js and Vite exports to contain empty asset maps and to 404 in local previews. Empty filter lists now match nothing, so normal CSS, JavaScript, image, font, and dependency capture proceeds correctly.

The static crawler also now honors robots.txt by default, including matching Allow/Disallow rules and Crawl-delay, and uses same-origin sitemap information to prioritize eligible pages without increasing the configured page cap.

## Verification

The release baseline is `npm run typecheck` clean and `npm test` passing with 83 existing tests before the crawl-intelligence additions. The full suite is rerun as part of this release closeout.

## What is next

The roadmap continues with output-quality improvements, followed by extensibility work and developer-experience polish. Static export fidelity remains the priority before React export is reconsidered.
