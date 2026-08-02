#!/usr/bin/env node
// Post-build: 将原生 CJS preload 覆盖 Vite 编译的版本
// Vite 强制 ESM 输出，但 Electron preload 必须为 CommonJS（使用 require('electron')）
import fs from 'node:fs';
const src = 'electron/preload/index.cjs';
const dest = 'dist-electron/preload/index.cjs';
if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('[postbuild] preload.cjs copied (CJS)');
} else {
  console.error('[postbuild] ERROR: preload source not found');
  process.exit(1);
}
