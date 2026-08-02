// 修复 vite-plugin-electron 打包 preload 时将 CJS 转为 ESM 的问题
// 直接复制原始 CJS 源文件覆盖打包输出
const fs = require('node:fs')
const path = require('node:path')

const preloadDir = path.join(__dirname, '..', 'electron', 'preload')
const outDir = path.join(__dirname, '..', 'dist-electron', 'preload')

// 需要复制的 preload 文件列表
const files = [
  { src: 'index.cjs', dest: 'index.cjs' },
  { src: 'lock-preload.cjs', dest: 'lock-preload.cjs' },
  { src: 'updater-preload.cjs', dest: 'updater-preload.cjs' },
  { src: 'preview-preload.cjs', dest: 'preview-preload.cjs' }
]

for (const { src, dest } of files) {
  const srcPath = path.join(preloadDir, src)
  const destPath = path.join(outDir, dest)
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath)
    console.log(`[fix-preload] Copied ${src} → dist-electron/preload/${dest}`)
  } else {
    console.warn(`[fix-preload] Source not found: ${srcPath}`)
  }
}
