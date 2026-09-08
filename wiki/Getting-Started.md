# Getting Started

## Requirements

- Node.js 18 or newer.
- A Chromium browser (Playwright will download one automatically on first run).

## Quick Start (No Install Needed)

You can run Uncage immediately with `npx`:

```bash
# Launch the Web UI at http://localhost:8787
npx @nightteye/uncage

# Or clone directly via CLI
npx @nightteye/uncage https://example.com
```

## Installation Options

### Option 1: Global CLI (Recommended)

Install Uncage globally so you can use the `uncage` command anywhere:

```bash
npm install -g @nightteye/uncage

# Run CLI
uncage https://example.com

# Launch Web UI
uncage
```

### Option 2: From Source

```bash
git clone https://github.com/Nightteye/uncage.git
cd uncage
npm install
npx playwright install chromium
npm start
```

## Your First Export

### Using the Web UI

```bash
npx @nightteye/uncage
```

This opens a browser dashboard at `http://localhost:8787`. Paste a URL, click "Start Export", and watch real-time progress in the instance card. Your files will be saved in `output/<site-name>/`.

### Using the CLI

```bash
uncage https://example.com
```

This runs the cloner directly in your terminal. Output goes to `output/example.com/` by default.

## Verify the Export

After exporting, you can preview the cloned site locally:

```bash
cd output/example.com
npm run preview
```

*(If you used the Web UI, an automated preview server is already launched on an available port like `http://localhost:7000`).*

## Next Steps

- Read the [[Web UI Guide]] to learn about the 2x2 grid, .ZIP downloads, and options like depth limits.
- Read the [[CLI Reference]] for all available command-line flags.
