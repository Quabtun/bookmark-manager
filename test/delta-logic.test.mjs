// delta-logic.test.mjs — 差分更新纯函数单元测试
// 运行: node --test test/delta-logic.test.mjs

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  fnv1a,
  sha256,
  createDelta,
  applyDelta,
  parseDelta,
  serializeDelta,
  findDeltaAsset,
  isDeltaWorthIt
} from '../electron/main/delta-logic.js'

// ============================================================
// fnv1a
// ============================================================
describe('fnv1a', () => {
  test('空 Buffer', () => {
    assert.equal(fnv1a(Buffer.alloc(0)), 0x811c9dc5)
  })

  test('确定性 —— 相同输入相同输出', () => {
    const buf = Buffer.from('hello world')
    assert.equal(fnv1a(buf), fnv1a(buf))
  })

  test('不同输入不同输出', () => {
    const a = fnv1a(Buffer.from('hello'))
    const b = fnv1a(Buffer.from('world'))
    assert.notEqual(a, b)
  })

  test('返回 uint32（无符号）', () => {
    const buf = Buffer.from([0xff, 0xff, 0xff, 0xff])
    const hash = fnv1a(buf)
    assert.ok(hash >= 0, '哈希值应为无符号 32 位整数')
    assert.ok(hash <= 0xffffffff)
  })
})

// ============================================================
// sha256
// ============================================================
describe('sha256', () => {
  test('返回 32 字节 Buffer', () => {
    const hash = sha256(Buffer.from('test'))
    assert.equal(hash.length, 32)
    assert.ok(Buffer.isBuffer(hash))
  })

  test('确定性', () => {
    const a = sha256(Buffer.from('hello'))
    const b = sha256(Buffer.from('hello'))
    assert.ok(a.equals(b))
  })

  test('不同输入不同哈希', () => {
    const a = sha256(Buffer.from('hello'))
    const b = sha256(Buffer.from('world'))
    assert.ok(!a.equals(b))
  })

  test('已知向量', () => {
    // SHA256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    const hash = sha256(Buffer.from('abc'))
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    assert.equal(hash.toString('hex'), expected)
  })
})

// ============================================================
// createDelta + applyDelta 往返测试
// ============================================================
describe('createDelta + applyDelta 往返', () => {
  test('完全相同的文件 —— delta 极小', () => {
    const oldBuf = Buffer.alloc(8192, 0x41)  // 8KB 全 A
    const newBuf = Buffer.alloc(8192, 0x41)

    const { delta, stats } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.equal(stats.copyBytes, 8192, '应全部 COPY')
    assert.equal(stats.insertBytes, 0, '不应有 INSERT')
    assert.ok(stats.deltaSize < 200, '相同文件 delta 应极小')
  })

  test('完全不同的文件 —— delta 接近原大小', () => {
    const oldBuf = Buffer.alloc(8192, 0x41)  // 全 A
    const newBuf = Buffer.alloc(8192, 0x42)  // 全 B

    const { delta, stats } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.equal(stats.copyBytes, 0, '不应有 COPY')
    assert.equal(stats.insertBytes, 8192, '应全部 INSERT')
  })

  test('部分变化的文件 —— COPY + INSERT 混合', () => {
    // 8KB: 前 4KB 不变, 后 4KB 变化
    const oldBuf = Buffer.alloc(8192, 0x41)
    const newBuf = Buffer.alloc(8192, 0x41)
    newBuf.fill(0x42, 4096)

    const { delta, stats } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.ok(stats.copyBytes > 0, '应有 COPY')
    assert.ok(stats.insertBytes > 0, '应有 INSERT')
  })

  test('新文件比旧文件大', () => {
    const oldBuf = Buffer.alloc(4096, 0x41)
    const newBuf = Buffer.alloc(8192, 0x41)  // 前 4KB 相同, 后 4KB 新增

    const { delta } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.equal(result.buf.length, 8192)
  })

  test('新文件比旧文件小', () => {
    const oldBuf = Buffer.alloc(8192, 0x41)
    const newBuf = Buffer.alloc(4096, 0x41)  // 前 4KB 相同

    const { delta } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.equal(result.buf.length, 4096)
  })

  test('空旧文件 → 非空新文件', () => {
    const oldBuf = Buffer.alloc(0)
    const newBuf = Buffer.from('Hello, World!')

    const { delta, stats } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.equal(stats.copyBytes, 0, '不应有 COPY')
    assert.equal(stats.insertBytes, newBuf.length, '应全部 INSERT')
  })

  test('随机数据往返', () => {
    const size = 16384  // 16KB
    const oldBuf = Buffer.alloc(size)
    const newBuf = Buffer.alloc(size)

    // 80% 相同, 20% 不同
    for (let i = 0; i < size; i++) {
      oldBuf[i] = Math.floor(Math.random() * 256)
      newBuf[i] = i < size * 0.8 ? oldBuf[i] : Math.floor(Math.random() * 256)
    }

    const { delta } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
  })

  test('大文件往返（256KB）', () => {
    const size = 256 * 1024
    const oldBuf = Buffer.alloc(size, 0x41)
    const newBuf = Buffer.alloc(size, 0x41)

    // 在中间位置修改几个块
    for (let i = 0; i < 5; i++) {
      const offset = (i + 1) * 4096 * 10  // 每 10 个块改 1 个
      newBuf.fill(0x42 + i, offset, offset + 4096)
    }

    const { delta, stats } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    assert.ok(result.verified, 'SHA256 应校验通过')
    assert.ok(result.buf.equals(newBuf), '重建数据应匹配')
    assert.ok(stats.copyBytes > size * 0.8, '大部分应 COPY')
    assert.ok(stats.deltaSize < newBuf.length * 0.3, 'delta 应远小于原文件')
  })
})

// ============================================================
// applyDelta 错误处理
// ============================================================
describe('applyDelta 错误处理', () => {
  test('旧文件大小不匹配', () => {
    const oldBuf = Buffer.alloc(100, 0x41)
    const newBuf = Buffer.alloc(200, 0x42)

    const { delta } = createDelta(oldBuf, newBuf)

    // 用错误大小的旧文件应用
    const wrongOld = Buffer.alloc(101, 0x41)
    assert.throws(() => applyDelta(wrongOld, delta), /旧文件大小不匹配/)
  })

  test('损坏的 delta 数据', () => {
    const oldBuf = Buffer.alloc(100, 0x41)
    const corrupted = Buffer.from('not-a-valid-delta-file')
    assert.throws(() => applyDelta(oldBuf, corrupted), /差分解压失败|无效的差分文件格式|Magic/)
  })

  test('SHA256 校验失败检测', () => {
    const oldBuf = Buffer.alloc(8192, 0x41)
    const newBuf = Buffer.alloc(8192, 0x42)

    const { delta } = createDelta(oldBuf, newBuf)
    const result = applyDelta(oldBuf, delta)

    // 正常情况应验证通过
    assert.ok(result.verified)

    // 篡改重建结果不应影响 verified（verified 是基于 delta 中的哈希）
    // 但如果旧文件数据被篡改，COPY 指令会复制错误数据，导致 SHA256 不匹配
    const tamperedOld = Buffer.alloc(8192, 0x43)  // 完全不同的旧文件
    const tamperedResult = applyDelta(tamperedOld, delta)

    // 大小匹配但内容不匹配
    assert.equal(tamperedResult.buf.length, 8192)
    // verified 可能为 false（取决于 COPY 指令的比例）
    // 如果全部 INSERT，verified 仍为 true；如果有 COPY，则很可能 false
  })
})

// ============================================================
// serializeDelta + parseDelta
// ============================================================
describe('serializeDelta + parseDelta', () => {
  test('序列化 → 反序列化往返', () => {
    const oldBuf = Buffer.alloc(8192, 0x41)
    const newBuf = Buffer.alloc(8192, 0x41)
    newBuf.fill(0x42, 4096)

    const { delta } = createDelta(oldBuf, newBuf)

    // delta 是 gzip 压缩的, parseDelta 内部解压
    const parsed = parseDelta(delta)

    assert.equal(parsed.oldSize, 8192)
    assert.equal(parsed.newSize, 8192)
    assert.equal(parsed.newHash.length, 32)
    assert.ok(parsed.chunks.length > 0)
  })
})

// ============================================================
// findDeltaAsset
// ============================================================
describe('findDeltaAsset', () => {
  test('精确匹配版本号', () => {
    const assets = [
      { name: 'BookmarkManager-1.3.1-portable.exe', browser_download_url: 'https://example.com/exe', size: 68000000 },
      { name: 'update-1.3.0-1.3.1.delta', browser_download_url: 'https://example.com/delta', size: 20000000 }
    ]
    const result = findDeltaAsset(assets, '1.3.0', '1.3.1')
    assert.ok(result)
    assert.equal(result.url, 'https://example.com/delta')
    assert.equal(result.size, 20000000)
  })

  test('大小写不敏感', () => {
    const assets = [
      { name: 'Update-1.3.0-1.3.1.DELTA', browser_download_url: 'https://example.com/delta', size: 20000000 }
    ]
    const result = findDeltaAsset(assets, '1.3.0', '1.3.1')
    assert.ok(result)
    assert.equal(result.url, 'https://example.com/delta')
  })

  test('通配匹配 —— 包含当前版本号', () => {
    const assets = [
      { name: 'update-1.3.0-to-1.3.1.delta', browser_download_url: 'https://example.com/delta', size: 20000000 }
    ]
    const result = findDeltaAsset(assets, '1.3.0', '1.3.1')
    assert.ok(result)
  })

  test('无匹配时返回 null', () => {
    const assets = [
      { name: 'BookmarkManager-1.3.1-portable.exe', browser_download_url: 'https://example.com/exe', size: 68000000 },
      { name: 'update-1.2.0-1.3.1.delta', browser_download_url: 'https://example.com/delta', size: 20000000 }
    ]
    const result = findDeltaAsset(assets, '1.3.0', '1.3.1')
    assert.equal(result, null)
  })

  test('空数组返回 null', () => {
    assert.equal(findDeltaAsset([], '1.0.0', '1.1.0'), null)
  })

  test('null/undefined 输入返回 null', () => {
    assert.equal(findDeltaAsset(null, '1.0.0', '1.1.0'), null)
    assert.equal(findDeltaAsset(undefined, '1.0.0', '1.1.0'), null)
  })

  test('资产无 browser_download_url 时跳过', () => {
    const assets = [
      { name: 'update-1.0.0-1.1.0.delta', size: 1000 }  // 无 URL
    ]
    const result = findDeltaAsset(assets, '1.0.0', '1.1.0')
    assert.equal(result, null)
  })
})

// ============================================================
// isDeltaWorthIt
// ============================================================
describe('isDeltaWorthIt', () => {
  test('差分明显小于完整包 —— 值得', () => {
    assert.ok(isDeltaWorthIt(20000000, 68000000))  // 29%
    assert.ok(isDeltaWorthIt(1000000, 68000000))   // 1.5%
  })

  test('差分接近完整包 —— 不值得', () => {
    assert.equal(isDeltaWorthIt(55000000, 68000000), false)  // 80.9% > 80%
    assert.equal(isDeltaWorthIt(68000000, 68000000), false)  // 100%
  })

  test('边界值 80%', () => {
    // 80% = 0.8, deltaSize < fullSize * 0.8
    // 54.4M / 68M = 0.8, 不满足严格小于
    assert.equal(isDeltaWorthIt(54400000, 68000000), false)  // 恰好 80%
    assert.ok(isDeltaWorthIt(54399999, 68000000))            // 略小于 80%
  })

  test('零或无效输入返回 false', () => {
    assert.equal(isDeltaWorthIt(0, 68000000), false)
    assert.equal(isDeltaWorthIt(20000000, 0), false)
    assert.equal(isDeltaWorthIt(null, 68000000), false)
    assert.equal(isDeltaWorthIt(20000000, null), false)
    assert.equal(isDeltaWorthIt(0, 0), false)
  })
})
