# ⛓️‍💥 Uncage

> **The free, open-source, local website cloner and modern code exporter.**  
> Effortlessly turn any Framer, Webflow, or modern website into clean, production-ready **React 18 + TSX**, **React 18 + JSX**, or **Static HTML/CSS/JS** — with 100% offline assets, preserved animations, and zero paywalls.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18.0.0](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Stealth-green.svg)](https://playwright.dev/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg)](https://vitejs.dev/)

---

## ⚡ Why Uncage?

Commercial tools like *NoCodeExport* lock your own design exports behind expensive subscriptions and recurring paywalls. **Uncage** runs 100% locally on your machine, has no telemetry, requires no API keys, and delivers full-fidelity exports:

- 🎯 **No Paywalls, No Limits:** Clone unlimited pages, multi-route applications, and complete component libraries for free.
- ⚛️ **Native React 18 & Vite:** Compiles raw HTML into clean, modular React TSX/JSX components with dynamic React Router v6 navigation.
- 🎬 **Preserved Framer Animations:** Selectively isolates and preserves Framer Motion runtime engines, scroll reveals, and physics interactions.
- 📦 **100% Offline-Ready Asset Bundling:** Intercepts, decodes, and rewrites images (AVIF, WebP, SVG, PNG), fonts (WOFF2, TTF), CSS `@import` rules, and recursive code-split JavaScript chunks.
- 🛡️ **Anti-Bot & Stealth Engine:** Uses Playwright Extra + Stealth plugin with humanized scrolling, politeness jitter, and permissive CORS header injection to bypass Cloudflare and WAF protections.
- 🗜️ **Built-in Optimizers:** Automatic CSS tree-shaking with PurgeCSS + CSSNano, plus lossless image compression with Sharp.

---

## 📋 Table of Contents

- [Requirements](#-requirements)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Export Formats](#-export-formats)
- [CLI Reference](#-cli-reference)
- [Running Exported Projects](#-running-exported-projects)
- [Core Architecture](#-core-architecture)
- [Troubleshooting & Pro-Tips](#-troubleshooting--pro-tips)
- [Contributing](#-contributing)
- [License](#-license)

---

## 💻 Requirements

Ensure your environment meets the following prerequisites before running Uncage:

| Requirement | Minimum Version | Recommended | Notes |
|---|---|---|---|
| **Node.js** | `v18.0.0` | `v20.x` or `v22.x` | Required for native fetch & ESM |
| **npm** | `v9.0.0` | Latest | `pnpm` or `yarn` also supported |
| **OS** | Windows, macOS, Linux | Any | Cross-platform file path sanitization included |
| **Chromium** | Latest | Latest | Installed automatically via Playwright |

---

## 🚀 Installation

### Option 1: Clone & Run Locally (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/uncage.git
cd uncage

# 2. Install dependencies
npm install

# 3. Install Playwright browser binaries
npx playwright install chromium
```

### Option 2: Link Globally as a CLI Tool

To use the `uncage` command from any directory in your terminal:

```bash
# Inside the cloned uncage folder:
npm link

# Now you can run uncage anywhere:
uncage https://example.framer.website
```

---

## 🎯 Quick Start

### 1. Interactive Mode (Wizard)

Run Uncage without arguments to launch the step-by-step interactive CLI wizard:

```bash
npm start
# or if linked globally:
uncage
```

The wizard will prompt you for:
1. **Target URL** (e.g. `https://my-site.framer.website`)
2. **Export Format** (`react-ts`, `react-js`, or `html`)
3. **Output Directory Name**
4. **Max Pages to Crawl**
5. **Advanced Flags** (Headless toggle, CSS purging, Dynamic JS module resolution)

---

### 2. Direct CLI Command

Pass the URL and flags directly in one line:

```bash
# Clone to React 18 + TypeScript (default)
uncage https://my-site.framer.website -o my-react-site

# Clone to clean React JavaScript (JSX)
uncage https://my-site.framer.website -f react-js -o my-jsx-site

# Clone to Pure Static HTML/CSS/JS
uncage https://my-site.framer.website -f html -o my-static-site
```

---

## 📦 Export Formats

Uncage supports 3 purpose-built export formats:

### 1. `react-ts` (React 18 + TypeScript + Vite) — *Default*
- Production-ready Vite TypeScript application.
- Multi-page routing via `react-router-dom` v6 in `src/App.tsx`.
- Type-safe components in `src/pages/*.tsx`.
- Integrated `react-helmet-async` for route-specific meta tags and page titles.
- Complete `tsconfig.json`, `vite.config.ts`, and `package.json`.

### 2. `react-js` (React 18 + JavaScript + Vite)
- Identical to `react-ts` but exports clean `.jsx` components without TypeScript overhead.
- Includes `jsconfig.json` and `vite.config.js`.

### 3. `html` (Pure Static Multi-Page Bundle)
- Zero build tools needed. Pure standalone `.html`, `.css`, and `.js` files.
- Preserves clean nested subdirectories (e.g. `about/team.html`).
- Depth-aware relative asset paths (`./assets/` or `../../assets/`) for direct local `file://` opening or drag-and-drop deployment to Netlify, Vercel, or GitHub Pages.

---

## 🛠️ CLI Reference

```
Usage: uncage [url] [options]

Arguments:
  url                      The target URL to clone (optional: launches wizard if omitted)

Options:
  -o, --output <dir>       Custom output directory name (default: domain hostname)
  -f, --format <format>    Target export format: react-ts, react-js, html (default: "react-ts")
  -i, --interactive        Interactively prompt for export format
  --max-pages <number>     Maximum number of pages to crawl (default: 50)
  --timeout <ms>           Page navigation timeout in milliseconds (default: 30000)
  --no-headless            Launch browser in headful (visible) window mode for debugging
  --skip-deps              Skip recursive dynamic JS module scanning (faster export)
  --no-purge               Skip PurgeCSS optimization (retains dynamic JS classes)
  -h, --help               Display help for command
```

### Format Aliases
You can use any of these shorthand aliases for the `-f` / `--format` flag:

- **React TS:** `react-ts`, `react-tsx`, `react`, `tsx`, `ts`, `react-typescript`
- **React JS:** `react-js`, `react-jsx`, `jsx`, `js`, `react-javascript`
- **Static HTML:** `html`, `static`, `vanilla`, `html-css-js`, `plain`

---

## 🏃 Running Exported Projects

All exported projects are saved into the `output/` directory.

### Running a React TS / JS Project

```bash
# Navigate to the generated project
cd output/<your-output-folder>

# 1. Install dependencies
npm install

# 2. Start the local Vite development server
npm run dev

# 3. Build for production (outputs optimized static bundle to dist/)
npm run build

# 4. Preview production build
npm run preview
```

### Running a Static HTML Project

```bash
# Navigate to the generated folder
cd output/<your-output-folder>

# Option 1: Direct File Opening
# Double click index.html or open with Live Server in VS Code

# Option 2: Run local static server
npm run preview
# or
npx serve .
```

---

## ⚙️ Core Architecture

Uncage operates as a deterministic 4-stage compilation pipeline:

```
[Target URL]
     │
     ▼
┌────────────────────────────────────────────────────────┐
│ 1. Stealth Crawler & Network Harvester                 │
│    • Playwright stealth instance & smooth scroll pass  │
│    • Declarative Shadow DOM serializer                 │
│    • Raw asset interception (Images, Fonts, Media, CSS)│
│    • Decompression fix & CORS header override          │
│    • Recursive JS code-split dependency scanner        │
└────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────┐
│ 2. URL Rewriter & Asset Linker                         │
│    • CSS url() relative path resolution                │
│    • HTML srcset multi-descriptor re-pointing          │
│    • Intra-site absolute link to root-relative rewrite │
│    • JS module sibling import hash realignment         │
└────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────┐
│ 3. HTML to React JSX AST Compiler                      │
│    • Cheerio AST traversal                             │
│    • State-machine CSS style parser                    │
│    • React form defaultValue mappings                  │
│    • SVG element & attribute camelCasing               │
│    • Head/Helmet sanitization & inline script escaping │
└────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────┐
│ 4. Assembler & Scaffolder                              │
│    • Dynamic React Router v6 generation                │
│    • Idempotent Framer runtime loader injection        │
│    • PurgeCSS tree-shaking & CSSNano minification      │
│    • Sharp image compression                           │
│    • Vite configuration & package.json generation      │
└────────────────────────────────────────────────────────┘
     │
     ▼
[Standalone Ready-to-Run Codebase]
```

---

## 💡 Troubleshooting & Pro-Tips

### 1. Cloned site has missing dropdowns, modals, or dark-mode styles
**Cause:** PurgeCSS analyzes static HTML snapshots and may tree-shake CSS classes that are only applied dynamically via JavaScript at runtime.  
**Fix:** Run with the `--no-purge` flag to retain 100% of the original stylesheets:
```bash
uncage https://example.com --no-purge
```

### 2. Export is taking too long on large sites
**Cause:** Uncage performs deep recursive scanning across all JavaScript bundles to ensure every code-split chunk is downloaded offline.  
**Fix:** Use `--skip-deps` and limit `--max-pages`:
```bash
uncage https://example.com --skip-deps --max-pages 5
```

### 3. Target site is blocking bots / returning 403 Forbidden
**Cause:** Aggressive Cloudflare Turnstile or Akamai bot protection.  
**Fix:** Run in headful (visible browser) mode so you can view the page loading:
```bash
uncage https://example.com --no-headless
```

### 4. Windows reserved filename issues (`con`, `prn`, `nul`)
Uncage automatically sanitizes all file paths and route names across Windows, macOS, and Linux, preventing filesystem write errors.

---

## 🤝 Contributing

Contributions are what make the open-source community thrive! Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
