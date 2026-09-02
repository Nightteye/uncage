const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, 'src', 'ui');
const files = ['index.html', 'react-cloner-status.html', 'tos.html', 'changelog.html'];

const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='24' fill='%2309090b'/><g fill='none' stroke='%23ffffff' stroke-linejoin='round' stroke-linecap='round' transform='translate(50, 50) scale(1.6) translate(-12, -12)'><path d='M12 2.5 L21 7.5 V16.5 L12 21.5 L3 16.5 V7.5 Z' stroke-width='2'/><path d='M11.5 7.5 L6.5 10.2 V13.8 L11.5 16.5' stroke-width='3'/></g></svg>`;
const faviconTag = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${svg}">`;

for (const file of files) {
  const p = path.join(UI_DIR, file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  if (!content.includes('rel="icon"')) {
    content = content.replace('</head>', `  ${faviconTag}\n</head>`);
    fs.writeFileSync(p, content, 'utf8');
    console.log('Favicon added to', file);
  }
}
