// scripts/generate-delta.mjs — 差分文件生成脚本
// 用法: node scripts/generate-delta.mjs --old <old.exe> --new <new.exe> [--out <dir>]
// 生成 update-{oldVersion}-{newVersion}.delta 文件，作为 GitHub Release 资产上传
//
// 示例:
//   node scripts/generate-delta.mjs \
//     --old release5/BookmarkManager-1.3.0-portable.exe \
//     --new release5/BookmarkManager-1.3.1-portable.exe \
//     --out release5/

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDelta, applyDelta, isDeltaWorthIt } from '../electron/main/delta-logic.js'

// ============================================================
// 解析命令行参数
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { old: null, new: null, out: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--old' && args[i + 1]) opts.old = args[++i]
    else if (args[i] === '--new' && args[i + 1]) opts.new = args[++i]
    else if (args[i] === '--out' && args[i + 1]) opts.out = args[++i]
  }
  return opts
}

// 从文件名提取版本号: BookmarkManager-1.3.0-portable.exe → 1.3.0
function extractVersion(filename) {
  const base = path.basename(filename)
  const match = base.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const opts = parseArgs()

  if (!opts.old || !opts.new) {
    console.error('用法: node scripts/generate-delta.mjs --old <old.exe> --new <new.exe> [--out <dir>]')
    process.exit(1)
  }

  if (!fs.existsSync(opts.old)) {
    console.error('旧版本文件不存在:', opts.old)
    process.exit(1)
  }
  if (!fs.existsSync(opts.new)) {
    console.error('新版本文件不存在:', opts.new)
    process.exit(1)
  }

  const oldVersion = extractVersion(opts.old)
  const newVersion = extractVersion(opts.new)

  if (!oldVersion || !newVersion) {
    console.error('无法从文件名提取版本号')
    console.error('  旧文件:', opts.old, '→', oldVersion)
    console.error('  新文件:', opts.new, '→', newVersion)
    console.error('文件名应包含版本号，如 BookmarkManager-1.3.0-portable.exe')
    process.exit(1)
  }

  console.log('=== 差分文件生成 ===')
  console.log('旧版本: v' + oldVersion, '(' + opts.old + ')')
  console.log('新版本: v' + newVersion, '(' + opts.new + ')')
  console.log('')

  // 读取文件
  console.log('正在读取文件…')
  const oldBuf = fs.readFileSync(opts.old)
  const newBuf = fs.readFileSync(opts.new)
  console.log('旧文件大小:', formatBytes(oldBuf.length))
  console.log('新文件大小:', formatBytes(newBuf.length))

  // 生成差分
  console.log('正在生成差分（大文件可能需要数十秒）…')
  const startTime = Date.now()
  const { delta, stats } = createDelta(oldBuf, newBuf)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('')
  console.log('=== 差分统计 ===')
  console.log('耗时:    ', elapsed, '秒')
  console.log('差分大小:', formatBytes(stats.deltaSize))
  console.log('COPY 数据:', formatBytes(stats.copyBytes), '(' + (stats.copyBytes / newBuf.length * 100).toFixed(1) + '%)')
  console.log('INSERT 数据:', formatBytes(stats.insertBytes), '(' + (stats.insertBytes / newBuf.length * 100).toFixed(1) + '%)')
  console.log('压缩比:  ', stats.ratio, '（差分 / 新文件）')
  console.log('指令数:  ', stats.chunkCount)
  console.log('节省:    ', ((1 - stats.ratio) * 100).toFixed(1) + '%')

  // 检查是否值得使用
  if (!isDeltaWorthIt(stats.deltaSize, newBuf.length)) {
    console.warn('')
    console.warn('⚠️  警告: 差分包大于完整包的 80%，不值得使用差分更新')
    console.warn('   客户端将自动回退到完整下载')
  }

  // 写入文件
  const outDir = opts.out || path.dirname(opts.new)
  const deltaFileName = `update-${oldVersion}-${newVersion}.delta`
  const deltaPath = path.join(outDir, deltaFileName)

  fs.writeFileSync(deltaPath, delta)
  console.log('')
  console.log('✅ 差分文件已生成:', deltaPath)
  console.log('   请将其作为 GitHub Release 资产上传')

  // 验证: 应用差分并检查 SHA256
  console.log('')
  console.log('正在验证差分（应用 + SHA256 校验）…')
  const result = applyDelta(oldBuf, delta)
  if (result.verified) {
    console.log('✅ 验证通过: SHA256 校验一致')
    console.log('   新文件 SHA256:', result.hash.toString('hex'))
  } else {
    console.error('❌ 验证失败: SHA256 不匹配')
    console.error('   期望:', result.expectedHash.toString('hex'))
    console.error('   实际:', result.hash.toString('hex'))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('差分生成失败:', e.message)
  process.exit(1)
})
