# Release Notes - v1.0.1

**Tag version:** `v1.0.1`  
**Release title:** `v1.0.1 — Official npm Release & Multi-Instance Web UI`

---

## What's Changed

Uncage is now officially published on npm. You can run it anywhere with zero setup using `npx`.

### Key Highlights

- **Instant execution**: Run `npx @nightteye/uncage` directly without cloning the repository.
- **Multi-Instance 2x2 Grid**: Run up to 3 site exports at the same time with independent live terminal logs.
- **One-click .ZIP downloads**: Stream complete, portable static site `.zip` archives directly from each instance card.
- **Auto preview servers**: Every completed export spins up its own local preview server on port `7000+`.
- **Session persistence**: Exports survive page reloads and tab switches without losing state or terminal logs.
- **Polite crawl engine**: Respects `robots.txt`, `Crawl-delay`, and discovers pages automatically via sitemaps.

### Quick Start

Launch the Web UI:

```bash
npx @nightteye/uncage
```

Clone a URL directly via CLI:

```bash
npx @nightteye/uncage https://example.com
```

Install globally:

```bash
npm install -g @nightteye/uncage
```

### Useful Links

- **npm Package**: https://www.npmjs.com/package/@nightteye/uncage
- **Full Wiki & Guides**: https://github.com/Nightteye/uncage/wiki
- **Security Policy**: https://github.com/Nightteye/uncage/blob/main/SECURITY.md
