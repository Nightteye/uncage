const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, 'src', 'ui');
const files = ['index.html', 'react-cloner-status.html', 'tos.html', 'changelog.html'];

const navOld = '<span style="border: 1px solid var(--border); border-radius: 6px; padding: 2px 6px; font-size: 12px; background: rgba(0,0,0,0.5);">⌬</span>';
const navNew = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round" style="width: 20px; height: 20px; color: var(--white);"><path d="M12 2.5 L21 7.5 V16.5 L12 21.5 L3 16.5 V7.5 Z" stroke-width="2"/><path d="M11.5 7.5 L6.5 10.2 V13.8 L11.5 16.5" stroke-width="3"/></svg>';

const footOld = '<div class="logo-icon">⌬</div>';
const footNew = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round" style="width: 36px; height: 36px; color: var(--white); margin-bottom: 12px;"><path d="M12 2.5 L21 7.5 V16.5 L12 21.5 L3 16.5 V7.5 Z" stroke-width="2"/><path d="M11.5 7.5 L6.5 10.2 V13.8 L11.5 16.5" stroke-width="3"/></svg>';

for (const file of files) {
  const p = path.join(UI_DIR, file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(navOld, navNew);
  content = content.replace(footOld, footNew);
  fs.writeFileSync(p, content, 'utf8');
  console.log('Logo replaced in', file);
}
