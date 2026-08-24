# Uncage

> **Clone any Framer, Webflow, or modern website into clean, production-ready React or Static HTML code.**  
> 100% free, open-source, and runs locally on your machine. No paywalls, no subscriptions, and no limits.

[![Status: Beta](https://img.shields.io/badge/Status-Public%20Beta-orange.svg)](https://github.com/Nightteye/uncage/issues)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646cff.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://react.dev/)

---

> [!WARNING]
> ### Project Status: Public Beta
> **Uncage is currently in active beta development.** While it successfully handles and clones many complex Framer and Webflow sites, exports may still have fidelity gaps, missing dynamic script behaviors, or styling imperfections on certain advanced layouts.
> 
> Active development is underway to enhance engine accuracy (including automatic Navbar/Footer component decomposition, improved runtime physics isolation, and deeper CMS support).
> 
> If you encounter a broken clone or layout issue, please **[open an issue on GitHub](https://github.com/Nightteye/uncage/issues)** with the target URL so it can be resolved!

---

## Key Features

- **Modern React 18 Exports:** Converts websites into modular React TSX or JSX components powered by **Vite** and **React Router v6**.
- **Static HTML Mode:** Generates clean, multi-page HTML/CSS/JS bundles that work offline without any build steps.
- **Preserved Animations:** Keeps Framer Motion interactions, scroll reveals, and hover effects working out of the box.
- **100% Offline Asset Bundling:** Intercepts and rewrites all images (AVIF, WebP, SVG, PNG), custom fonts (WOFF2, TTF), and code-split JavaScript chunks.
- **Stealth Browser Engine:** Powered by Playwright with built-in bot-detection bypass to handle complex sites.
- **Built-in Optimizers:** Automatic CSS tree-shaking with PurgeCSS and image compression with Sharp.

---

## Prerequisites

Ensure your environment meets the following requirements:

- **[Node.js](https://nodejs.org/)** (version `18.0.0` or higher)
- **npm** (included with Node.js)

---

## Quick Start

### 1. Download & Install

```bash
# Clone the repository
git clone https://github.com/Nightteye/uncage.git
cd uncage

# Install project dependencies
npm install

# Install the browser engine
npx playwright install chromium
```

### 2. Run the Interactive Wizard

The easiest way to use Uncage is through the interactive CLI wizard:

```bash
npm start
```

Follow the on-screen prompts to enter your target website URL and choose your desired format.

---

## Direct CLI Usage

You can also clone sites directly with command-line flags:

```bash
# Export as React 18 + TypeScript (Default)
npm run uncage -- https://example.framer.website -o my-react-site

# Export as React 18 + JavaScript (JSX)
npm run uncage -- https://example.framer.website -f react-js -o my-jsx-site

# Export as Pure Static HTML / CSS / JS
npm run uncage -- https://example.framer.website -f html -o my-html-site
```

> **Tip:** Link globally to run `uncage` directly from any terminal window:
> ```bash
> npm link
> # Now run directly:
> uncage https://example.framer.website
> ```

---

## Export Formats

| Format | Option Flag | Description |
|---|---|---|
| **React 18 + TypeScript** *(Default)* | `-f react-ts` | Full Vite + TSX project, React Router v6 navigation, typed pages in `src/pages/*.tsx`. |
| **React 18 + JavaScript** | `-f react-js` | Clean JSX components without TypeScript configuration. |
| **Static HTML / CSS / JS** | `-f html` | Ready-to-browse static HTML files. Double-click `index.html` or deploy to Netlify/Vercel. |

---

## CLI Options & Flags

```
Usage: uncage [url] [options]

Arguments:
  url                    Target website URL to clone (optional: launches wizard if omitted)

Options:
  -o, --output <name>    Folder name for the exported site (default: website domain)
  -f, --format <format>  Export format: react-ts, react-js, html (default: "react-ts")
  -i, --interactive      Interactively pick the export format
  --max-pages <number>   Maximum number of subpages to crawl (default: 50)
  --timeout <ms>         Page load timeout in milliseconds (default: 30000)
  --no-headless          Open visible browser window during crawl (helpful for debugging)
  --skip-deps            Skip deep dynamic JS module resolution (faster export)
  --no-purge             Keep all original CSS without PurgeCSS tree-shaking
  -h, --help             Show help menu
```

---

## Running Exported Projects

All cloned websites are saved inside the `output/` folder.

### Running React (TSX or JSX) Projects

```bash
# 1. Navigate to the exported site folder
cd output/<your-output-folder>

# 2. Install dependencies
npm install

# 3. Start the local development server
npm run dev

# 4. (Optional) Build for production
npm run build
```

### Running Static HTML Projects

```bash
# Navigate to the exported folder
cd output/<your-output-folder>

# Start a local preview server
npm run preview

# Or open index.html directly in any browser
```

---

## Pipeline Architecture

1. **Stealth Crawl & Capture:** Launches an automated headless browser to load the target page, executes a smooth scroll pass to trigger lazy-loaded images, and extracts the full rendered DOM (including Shadow DOM).
2. **Asset Interception & Decompression:** Intercepts every network request (fonts, images, videos, CSS stylesheets, and JS bundles), decodes the compressed content, and saves them locally with sanitized names.
3. **AST JSX Compiler:** Parses HTML using AST traversal, converts styles and attributes into clean React props (`className`, `defaultValue`, camelCased SVGs), and organizes the layout.
4. **Scaffolding & Assembly:** Generates Vite configurations, dynamic React Router mappings, and an isolated runtime loader that preserves animations without duplicate script collisions.

---

## Frequently Asked Questions

<details>
<summary><b>1. Why are some button hover states or dark-mode styles missing?</b></summary>
<p>By default, Uncage runs PurgeCSS to keep output CSS files small. If a site applies styles dynamically with JavaScript, run the clone with <code>--no-purge</code> to keep 100% of the original CSS:</p>
<pre><code>uncage https://example.com --no-purge</code></pre>
</details>

<details>
<summary><b>2. How do I clone a website faster?</b></summary>
<p>You can skip deep recursive JavaScript bundle scanning with <code>--skip-deps</code> and limit the page count:</p>
<pre><code>uncage https://example.com --skip-deps --max-pages 5</code></pre>
</details>

<details>
<summary><b>3. Is my data private?</b></summary>
<p>Yes. Uncage runs 100% locally on your machine. No telemetry, no external servers, and no tracking.</p>
</details>

---

## Research & Architecture Origins

Uncage was designed and built from extensive foundational reverse-engineering research on modern web architectures, AST decompilation, and bot-resistant network harvesting.

Read the complete architectural research paper:  
**[`Code Exporter Architecture Research.md`](./Code%20Exporter%20Architecture%20Research.md)**

---

## Contributing

Contributions, issues, and feature requests are welcome.  
Feel free to check the [issues page](https://github.com/Nightteye/uncage/issues) to contribute.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

Created by [Nightteye](https://github.com/Nightteye) and the open-source community.
