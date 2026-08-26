#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxCli = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
const entryTs = path.resolve(__dirname, '../src/index.ts');

if (!fs.existsSync(tsxCli)) {
  console.error('  ❌ tsx not found. Run `npm install` in the uncage project first.');
  process.exit(1);
}

// Spawn node directly (never through a shell) so URL arguments containing
// &, %, ^, quotes, or spaces survive intact on Windows cmd.exe.
const child = spawn(process.execPath, [tsxCli, entryTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (err) => {
  console.error('  ❌ Failed to launch uncage:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
