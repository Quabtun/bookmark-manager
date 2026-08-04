// delta-logic.js — 差分更新的纯函数模块
// 无 IO 依赖,可独立单元测试
// 差分格式 BDL1: 基于固定块(4KB)哈希的快速差分
//
// 原理:
//   1. 将旧文件分成 4KB 块,用 FNV-1a 哈希建立索引
//   2. 遍历新文件的块,在旧文件索引中查找匹配
//   3. 匹配的块生成 COPY 指令(只存偏移+长度)
//   4. 不匹配的块生成 INSERT 指令(存原始数据)
//   5. 整个 delta 用 gzip 压缩
//
// 对 portable exe(7z 压缩)效果:
//   压缩数据变化率较高,但版本间仍能找到大量公共块
//   典型节省 40-70% 下载量

import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

// ============================================================
// 常量
// ============================================================
const MAGIC = 'BDL1'
const DELTA_VERSION = 1
const BLOCK_SIZE = 4096

// 指令类型
const OP_COPY = 0    // 从旧文件复制
const OP_INSERT = 1  // 插入新数据

// ============================================================
// FNV-1a 32位哈希 —— 比 MD5 快 100 倍,用于块快速匹配
// ============================================================
export function fnv1a(buf) {
  let hash = 0x811c9dc5
  for (let i = 0; i < buf.length; i++) {
    hash ^= buf[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// ============================================================
// 计算文件 SHA256
// ============================================================
export function sha256(buf) {
  return createHash('sha256').update(buf).digest()
}

// ============================================================
// 序列化差分为二进制 Buffer
// 格式:
//   Magic: "BDL1" (4 bytes)
//   Version: uint8 (1 byte)
//   OldSize: uint32 LE (4 bytes)
//   NewSize: uint32 LE (4 bytes)
//   NewSHA256: 32 bytes
//   ChunkCount: uint32 LE (4 bytes)
//   Chunks: [
//     Type: uint8 (0=COPY, 1=INSERT)
//     COPY:  OldOffset(uint32) + Length(uint32)
//     INSERT: Length(uint32) + Data(bytes)
//   ]
//   整体 gzip 压缩
// ============================================================
export function serializeDelta({ oldSize, newSize, newHash, chunks }) {
  // 计算原始大小
  let bodySize = 4 + 1 + 4 + 4 + 32 + 4
  for (const c of chunks) {
    bodySize += 1
    if (c.type === OP_COPY) {
      bodySize += 4 + 4
    } else {
      bodySize += 4 + c.data.length
    }
  }

  const buf = Buffer.alloc(bodySize)
  let pos = 0

  // Header
  buf.write(MAGIC, pos, 'ascii'); pos += 4
  buf.writeUInt8(DELTA_VERSION, pos); pos += 1
  buf.writeUInt32LE(oldSize, pos); pos += 4
  buf.writeUInt32LE(newSize, pos); pos += 4
  newHash.copy(buf, pos); pos += 32
  buf.writeUInt32LE(chunks.length, pos); pos += 4

  // Chunks
  for (const c of chunks) {
    buf.writeUInt8(c.type, pos); pos += 1
    if (c.type === OP_COPY) {
      buf.writeUInt32LE(c.oldOffset, pos); pos += 4
      buf.writeUInt32LE(c.length, pos); pos += 4
    } else {
      buf.writeUInt32LE(c.data.length, pos); pos += 4
      c.data.copy(buf, pos); pos += c.data.length
    }
  }

  // gzip 压缩
  return gzipSync(buf)
}

// ============================================================
// 反序列化差分
// ============================================================
export function parseDelta(deltaBuf) {
  let buf
  try {
    buf = gunzipSync(deltaBuf)
  } catch {
    throw new Error('差分解压失败(可能数据损坏)')
  }

  let pos = 0
  const magic = buf.toString('ascii', pos, pos + 4); pos += 4
  if (magic !== MAGIC) {
    throw new Error('无效的差分文件格式(魔数不匹配): ' + magic)
  }

  const version = buf.readUInt8(pos); pos += 1
  if (version !== DELTA_VERSION) {
    throw new Error('不支持的差分版本: ' + version)
  }

  const oldSize = buf.readUInt32LE(pos); pos += 4
  const newSize = buf.readUInt32LE(pos); pos += 4
  const newHash = buf.subarray(pos, pos + 32); pos += 32
  const chunkCount = buf.readUInt32LE(pos); pos += 4

  const chunks = []
  for (let i = 0; i < chunkCount; i++) {
    const type = buf.readUInt8(pos); pos += 1
    if (type === OP_COPY) {
      const oldOffset = buf.readUInt32LE(pos); pos += 4
      const length = buf.readUInt32LE(pos); pos += 4
      chunks.push({ type: OP_COPY, oldOffset, length })
    } else if (type === OP_INSERT) {
      const length = buf.readUInt32LE(pos); pos += 4
      const data = buf.subarray(pos, pos + length); pos += length
      chunks.push({ type: OP_INSERT, data })
    } else {
      throw new Error('未知指令类型: ' + type)
    }
  }

  return { oldSize, newSize, newHash: Buffer.from(newHash), chunks }
}

// ============================================================
// 生成差分: oldBuf → newBuf
// 返回 { delta: Buffer, stats: { copyBytes, insertBytes, ratio } }
// ============================================================
export function createDelta(oldBuf, newBuf) {
  if (!Buffer.isBuffer(oldBuf)) oldBuf = Buffer.from(oldBuf)
  if (!Buffer.isBuffer(newBuf)) newBuf = Buffer.from(newBuf)

  const newHash = sha256(newBuf)

  // 构建旧文件块索引: hash -> [offset]
  // 用 Map<hash, number[]> 存储
  const oldBlockIndex = new Map()
  for (let offset = 0; offset < oldBuf.length; offset += BLOCK_SIZE) {
    const blockEnd = Math.min(offset + BLOCK_SIZE, oldBuf.length)
    const blockData = oldBuf.subarray(offset, blockEnd)
    const hash = fnv1a(blockData)
    let entries = oldBlockIndex.get(hash)
    if (!entries) {
      entries = []
      oldBlockIndex.set(hash, entries)
    }
    entries.push(offset)
  }

  // 遍历新文件块,生成差分指令
  const chunks = []
  let offset = 0
  let copyBytes = 0
  let insertBytes = 0

  while (offset < newBuf.length) {
    const blockEnd = Math.min(offset + BLOCK_SIZE, newBuf.length)
    const blockData = newBuf.subarray(offset, blockEnd)
    const hash = fnv1a(blockData)

    const candidates = oldBlockIndex.get(hash)

    if (candidates && candidates.length > 0) {
      // 找到候选匹配,验证块数据(防哈希冲突)
      let bestOldOffset = -1
      for (const oldOff of candidates) {
        const oldBlockEnd = Math.min(oldOff + BLOCK_SIZE, oldBuf.length)
        const oldBlock = oldBuf.subarray(oldOff, oldBlockEnd)
        if (oldBlock.equals(blockData)) {
          bestOldOffset = oldOff
          break
        }
      }

      if (bestOldOffset >= 0) {
        // 匹配成功,尝试扩展连续匹配
        let matchLen = blockData.length
        let nextNew = offset + BLOCK_SIZE
        let nextOld = bestOldOffset + BLOCK_SIZE

        while (nextNew < newBuf.length && nextOld < oldBuf.length) {
          const ne = Math.min(nextNew + BLOCK_SIZE, newBuf.length)
          const oe = Math.min(nextOld + BLOCK_SIZE, oldBuf.length)
          if (newBuf.subarray(nextNew, ne).equals(oldBuf.subarray(nextOld, oe))) {
            matchLen += ne - nextNew
            nextNew += BLOCK_SIZE
            nextOld += BLOCK_SIZE
          } else {
            break
          }
        }

        chunks.push({ type: OP_COPY, oldOffset: bestOldOffset, length: matchLen })
        copyBytes += matchLen
        offset += matchLen
        continue
      }
    }

    // 没有匹配,收集连续不匹配块为 INSERT
    let insertData = Buffer.from(blockData)
    offset += blockData.length

    while (offset < newBuf.length) {
      const be = Math.min(offset + BLOCK_SIZE, newBuf.length)
      const bd = newBuf.subarray(offset, be)
      const h = fnv1a(bd)
      const cands = oldBlockIndex.get(h)
      let matched = false
      if (cands) {
        for (const oo of cands) {
          const oe = Math.min(oo + BLOCK_SIZE, oldBuf.length)
          if (oldBuf.subarray(oo, oe).equals(bd)) { matched = true; break }
        }
      }
      if (matched) break

      insertData = Buffer.concat([insertData, bd])
      offset += bd.length
      if (bd.length < BLOCK_SIZE) break
    }

    chunks.push({ type: OP_INSERT, data: insertData })
    insertBytes += insertData.length
  }

  const delta = serializeDelta({
    oldSize: oldBuf.length,
    newSize: newBuf.length,
    newHash,
    chunks
  })

  const ratio = newBuf.length > 0 ? (delta.length / newBuf.length) : 0

  return {
    delta,
    stats: {
      copyBytes,
      insertBytes,
      deltaSize: delta.length,
      newSize: newBuf.length,
      ratio: Math.round(ratio * 100) / 100,
      chunkCount: chunks.length
    }
  }
}

// ============================================================
// 应用差分: oldBuf + delta → newBuf
// 返回 { buf: Buffer, hash: Buffer, verified: boolean }
// ============================================================
export function applyDelta(oldBuf, deltaBuf) {
  if (!Buffer.isBuffer(oldBuf)) oldBuf = Buffer.from(oldBuf)

  const { oldSize, newSize, newHash, chunks } = parseDelta(deltaBuf)

  // 校验旧文件大小
  if (oldBuf.length !== oldSize) {
    throw new Error(`旧文件大小不匹配: 期望 ${oldSize}, 实际 ${oldBuf.length}`)
  }

  // 构建新文件
  const newBuf = Buffer.alloc(newSize)
  let writePos = 0

  for (const chunk of chunks) {
    if (chunk.type === OP_COPY) {
      // 从旧文件复制
      const srcEnd = chunk.oldOffset + chunk.length
      if (srcEnd > oldBuf.length) {
        throw new Error(`COPY 越界: offset=${chunk.oldOffset}, length=${chunk.length}, oldSize=${oldBuf.length}`)
      }
      if (writePos + chunk.length > newSize) {
        throw new Error(`写入越界: writePos=${writePos}, length=${chunk.length}, newSize=${newSize}`)
      }
      oldBuf.copy(newBuf, writePos, chunk.oldOffset, srcEnd)
      writePos += chunk.length
    } else if (chunk.type === OP_INSERT) {
      // 插入新数据
      if (writePos + chunk.data.length > newSize) {
        throw new Error(`写入越界: writePos=${writePos}, length=${chunk.data.length}, newSize=${newSize}`)
      }
      chunk.data.copy(newBuf, writePos)
      writePos += chunk.data.length
    }
  }

  if (writePos !== newSize) {
    throw new Error(`生成文件大小不匹配: 期望 ${newSize}, 实际 ${writePos}`)
  }

  // SHA256 校验
  const actualHash = sha256(newBuf)
  const verified = actualHash.equals(newHash)

  return { buf: newBuf, hash: actualHash, expectedHash: newHash, verified }
}

// ============================================================
// 从 GitHub Release assets 中查找差分资产
// 命名规则: update-{oldVersion}-{newVersion}.delta
// ============================================================
export function findDeltaAsset(assets, currentVersion, targetVersion) {
  if (!Array.isArray(assets) || assets.length === 0) return null

  // 查找匹配的 delta 文件
  const normalizedName = `update-${currentVersion}-${targetVersion}.delta`.toLowerCase()

  for (const a of assets) {
    const name = (a.name || '').toLowerCase()
    if (name === normalizedName && a.browser_download_url) {
      return { url: a.browser_download_url, size: a.size || 0 }
    }
  }

  // 也支持通配匹配: update-*-*.delta
  for (const a of assets) {
    const name = (a.name || '').toLowerCase()
    if (name.endsWith('.delta') && name.includes(currentVersion) && a.browser_download_url) {
      return { url: a.browser_download_url, size: a.size || 0 }
    }
  }

  return null
}

// ============================================================
// 判断差分是否值得使用(差分包小于完整包的 80%)
// ============================================================
export function isDeltaWorthIt(deltaSize, fullSize) {
  if (!deltaSize || !fullSize || fullSize === 0) return false
  return deltaSize < fullSize * 0.8
}
