#!/usr/bin/env node
// 自动从便携版复制 electron 二进制到 pnpm 的 node_modules
const fs = require('fs')
const path = require('path')

const projectDir = __dirname
const dest = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe')
const portable = path.join(require('os').tmpdir(), 'electron-portable', 'dist', 'electron.exe')

if (fs.existsSync(dest)) {
  console.log('✅ electron.exe 已存在')
  process.exit(0)
}

// 确保目标目录存在
const destDir = path.dirname(dest)
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true })
}

if (fs.existsSync(portable)) {
  console.log('📋 从便携版复制 electron...')
  copyDirSync(path.dirname(portable), destDir)
  console.log('✅ electron 已就绪')
  process.exit(0)
}

console.log('⚠️  需要手动下载 electron:')
console.log('   1. 打开 https://npmmirror.com/mirrors/electron/v30.5.1/electron-v30.5.1-win32-x64.zip')
console.log('   2. 下载后解压到 node_modules\\electron\\dist\\')
console.log('   3. 确保 node_modules\\electron\\dist\\electron.exe 存在')
process.exit(1)

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
