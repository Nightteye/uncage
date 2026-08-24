#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxBin = path.resolve(__dirname, '../node_modules/.bin/tsx');
const entryTs = path.resolve(__dirname, '../src/index.ts');

const isWin = process.platform === 'win32';
const cmd = isWin ? `${tsxBin}.cmd` : tsxBin;

const child = spawn(cmd, [entryTs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: isWin,
});

child.on('error', (err) => {
  console.error('  ❌ Failed to launch uncage:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
