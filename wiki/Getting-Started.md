# Getting Started

## Requirements

- Node.js 18 or newer.
- A Chromium browser (Playwright will download one automatically on first run).

## Installation

```bash
git clone https://github.com/Nightteye/uncage.git
cd uncage
npm install
```

Playwright needs a browser binary. Run this once after installing:

```bash
npx playwright install chromium
```

## Your First Export

### Using the Web UI

```bash
npm start
```

This opens a browser window at `http://localhost:8787`. Paste a URL, click "Start Export", and wait for it to finish. Your files will be in the `output/` folder.

### Using the CLI

```bash
npx tsx src/index.ts https://example.com
```

This runs the cloner directly from your terminal. The output goes to `output/example.com/` by default.

## Verify the Export

After exporting, you can preview the cloned site locally:

```bash
cd output/example.com
npm run preview
```

This starts a local server so you can open the cloned site in your browser and check that everything looks right.

## Next Steps

- Read the [[Web UI Guide]] to learn about advanced options like depth limits and robots.txt.
- Read the [[CLI Reference]] for all available command-line flags.
