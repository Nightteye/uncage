const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, 'src', 'ui');
const files = ['index.html', 'react-cloner-status.html', 'tos.html', 'changelog.html'];

const NAVBAR_CSS = `
    /* --- Premium Navbar --- */
    .nav-wrap { max-width: 860px; margin: 24px auto 0; padding: 0 20px; position: relative; z-index: 10; }
    .nav-border-glow {
      position: absolute; inset: 0 20px; border-radius: 100px; padding: 1.5px;
      background: radial-gradient(400px circle at var(--mouse-x, -500px) var(--mouse-y, -500px), rgba(139,92,246,0.8), transparent 40%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
      pointer-events: none; opacity: 0; transition: opacity 0.3s; z-index: 11;
    }
    .nav-wrap:hover .nav-border-glow { opacity: 1; }
    .nav-border-glow::before {
      content: ""; position: absolute; inset: 0; border-radius: 100px; padding: 1.5px;
      background: linear-gradient(90deg, transparent, rgba(236,72,153,0.5), rgba(139,92,246,0.8), transparent);
      background-size: 200% 100%;
      animation: running-glow 4s linear infinite;
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .nav-wrap:hover .nav-border-glow::before { opacity: 0; }
    @keyframes running-glow { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .nav {
      display: flex; align-items: center; justify-content: space-between;
      height: 56px; padding: 0 10px 0 24px;
      background: rgba(15, 15, 15, 0.55);
      backdrop-filter: blur(32px) saturate(120%); -webkit-backdrop-filter: blur(32px) saturate(120%);
      border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 100px;
      box-shadow: 0 16px 32px rgba(0,0,0,0.4);
      position: relative;
    }
    .nav-brand { font-size: 15px; font-weight: 600; color: var(--white); letter-spacing: -0.03em; text-decoration: none; display: flex; align-items: center; gap: 8px;}
    .nav-actions { display: flex; align-items: center; gap: 8px; }
    
    .nav-guide {
      display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px;
      font-size: 13px; font-weight: 600; color: var(--text-dim); cursor: pointer; text-decoration: none;
      transition: all 0.2s; font-family: inherit;
    }
    .nav-guide:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); color: var(--white); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .nav-guide.warn { color: var(--warn); }
    .nav-guide.warn:hover { color: var(--warn); border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.08); }

    .nav-badge {
      display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px;
      font-size: 13px; font-weight: 500; color: var(--text-dim); letter-spacing: -0.01em;
    }
    .nav-badge::before {
      content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--green);
      box-shadow: 0 0 10px rgba(16,185,129,0.8); animation: pulse-green 2s infinite;
    }
    @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); } 70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }

    /* --- Premium Footer --- */
    .site-footer {
      margin-top: 80px; padding: 48px 20px 64px;
      border-top: 1px solid var(--border-card);
      background: rgba(10, 10, 10, 0.4); backdrop-filter: blur(24px);
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    .site-footer .logo-icon { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 10px; display: grid; place-items: center; background: rgba(0,0,0,0.4); font-size: 16px; color: var(--white); margin-bottom: 8px; }
    .site-footer p { font-size: 14px; color: var(--text-muted); max-width: 400px; text-align: center; line-height: 1.6; }
    .site-footer .links { display: flex; gap: 24px; margin-top: 12px; }
    .site-footer .links a { font-size: 14px; color: var(--text-dim); text-decoration: none; transition: color 0.2s; }
    .site-footer .links a:hover { color: var(--white); }
`;

const NAVBAR_HTML = `
  <div class="nav-wrap" id="navWrap">
    <div class="nav-border-glow"></div>
    <nav class="nav">
      <a href="/" class="nav-brand"><span style="border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; font-size: 12px; background: rgba(0,0,0,0.5);">⌬</span> Uncage</a>
      <div class="nav-actions">
        <a href="/react-cloner-status" class="nav-guide warn">React Paused</a>
        <button class="nav-guide" id="guideBtn" onclick="const o = document.getElementById('guideOverlay'); if(o) o.classList.add('open');">? Guide</button>
        <div class="nav-badge">Runs locally</div>
      </div>
    </nav>
  </div>
`;

const FOOTER_HTML = `
  <footer class="site-footer">
    <div class="logo-icon">⌬</div>
    <p>Uncage is a local development tool for capturing and archiving static exports of Framer, Webflow, and React sites.</p>
    <div class="links">
      <a href="/">Home</a>
      <a href="/changelog">Changelog</a>
      <a href="/react-cloner-status">React Status</a>
      <a href="/tos">Terms of Service</a>
      <a href="https://github.com/Nightteye/uncage" target="_blank">GitHub</a>
    </div>
  </footer>
`;

const NAV_JS = `
    const navWrap = document.getElementById('navWrap');
    if (navWrap) {
      navWrap.addEventListener('mousemove', e => {
        const rect = navWrap.getBoundingClientRect();
        navWrap.style.setProperty('--mouse-x', \`\${e.clientX - rect.left}px\`);
        navWrap.style.setProperty('--mouse-y', \`\${e.clientY - rect.top}px\`);
      });
    }
`;

for (const file of files) {
  const p = path.join(UI_DIR, file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');

  // Regexes to carefully strip old nav CSS and add new
  content = content.replace(/\.nav-wrap \{[\s\S]*?(?=\.hero|\/\* ── Content|\/\*)/, '');
  content = content.replace(/\.nav-guide \{[\s\S]*?(?=\:\:-webkit-scrollbar)/, '');
  content = content.replace('</style>', NAVBAR_CSS + '\n  </style>');

  // Strip old footer CSS
  content = content.replace(/\.foot \{[\s\S]*?(?=\.overlay|\@media)/, '');
  content = content.replace(/\.footer \{[\s\S]*?(?=\@media|<\/style>)/, '');

  // Replace Nav HTML
  // In index.html:
  if (content.includes('class="nav-brand"')) {
    content = content.replace(/<div class="nav-wrap">[\s\S]*?<\/nav>\s*<\/div>/, NAVBAR_HTML);
  } else {
    // In react-cloner-status.html and tos.html
    content = content.replace(/<div class="nav-wrap">[\s\S]*?<\/div>/, NAVBAR_HTML);
  }

  // Replace Footer HTML
  content = content.replace(/<div class="foot">[\s\S]*?<\/div>/, FOOTER_HTML);
  content = content.replace(/<footer class="footer">[\s\S]*?<\/footer>/, FOOTER_HTML);

  // Add JS
  if (!content.includes('navWrap.addEventListener')) {
    content = content.replace('</script>', NAV_JS + '\n  </script>');
  }

  fs.writeFileSync(p, content, 'utf8');
  console.log('Patched', file);
}
