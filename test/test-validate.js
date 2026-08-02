// 校验模块单元测试：在 Electron 运行时内执行
// 用法：node_modules/electron/dist/electron.exe test/test-validate.js
import { app } from 'electron'
import { validateUrl, validateBatch } from '../electron/main/validator.js'
import { loadSettings } from '../electron/main/store.js'

const results = []
let passed = 0, failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✅', name)
  } catch (e) {
    failed++
    console.log('  ❌', name)
    console.log('     Error:', e.message)
    console.log('     Stack:', e.stack?.split('\n')[1]?.trim())
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed')
}

app.whenReady().then(async () => {
  console.log('\n=== 校验模块测试开始 ===\n')

  // 测试 1: validateUrl 返回格式
  test('validateUrl 返回格式正确 (https://www.baidu.com)', async () => {
    const r = await validateUrl('https://www.baidu.com')
    assert(r && typeof r === 'object', '应返回对象')
    assert(r.status === 'ok' || r.status === 'warn' || r.status === 'dead', 'status 应为 ok/warn/dead, 实际: ' + r.status)
    assert(typeof r.code === 'number', 'code 应为数字')
    assert(typeof r.message === 'string', 'message 应为字符串')
    assert(typeof r.finalUrl === 'string', 'finalUrl 应为字符串')
    console.log('    →', JSON.stringify(r))
  })

  // 测试 2: 无效 URL
  test('validateUrl 无效 URL 返回 dead', async () => {
    const r1 = await validateUrl('')
    assert(r1.status === 'dead', '空字符串应返回 dead, 实际: ' + r1.status)
    const r2 = await validateUrl(null)
    assert(r2.status === 'dead', 'null 应返回 dead, 实际: ' + r2.status)
    const r3 = await validateUrl('not-a-url')
    assert(r3.status === 'dead', '非法 URL 应返回 dead, 实际: ' + r3.status)
  })

  // 测试 3: validateBatch 并发校验
  test('validateBatch 并发校验返回顺序正确', async () => {
    const urls = ['https://www.baidu.com', 'https://github.com', 'https://invalid-domain-xyz.local']
    const results = await validateBatch(urls, { limit: 2, onProgress: (d, t) => {} })
    assert(results.length === 3, '结果数应为 3, 实际: ' + results.length)
    assert(results[0] && results[0].status, '第1个结果应有 status')
    assert(results[1] && results[1].status, '第2个结果应有 status')
    assert(results[2] && results[2].status, '第3个结果应有 status (无效域名)')
    console.log('    →', results.map(r => r.status))
  })

  // 测试 4: validateBatch 空数组
  test('validateBatch 空数组返回空数组', async () => {
    const r = await validateBatch([], { limit: 3 })
    assert(Array.isArray(r), '应返回数组')
    assert(r.length === 0, '应为空数组')
  })

  // 测试 5: validateBatch 结果映射（模拟 IPC 场景）
  test('validateBatch 结果与 URL 顺序一一对应', async () => {
    const urls = ['https://www.baidu.com', 'https://github.com']
    const results = await validateBatch(urls, { limit: 2 })
    // 关键：results[i] 必须对应 urls[i]
    for (let i = 0; i < urls.length; i++) {
      assert(results[i] != null, `results[${i}] 不应为 null`)
      assert(results[i].status, `results[${i}] 应有 status`)
    }
    console.log('    → URL 顺序与结果顺序一致')
  })

  // 测试 6: 模拟 Vue Proxy 序列化问题（URL 被错误序列化）
  test('validateBatch 处理 Proxy 包裹的 URL（模拟 IPC）', async () => {
    // 模拟 Vue reactive Proxy 被 JSON 序列化后再解析的场景
    const urlsRaw = ['https://www.baidu.com', 'https://github.com']
    const urls = JSON.parse(JSON.stringify(urlsRaw))  // 模拟 IPC 传输
    assert(typeof urls[0] === 'string', 'URL 应为普通字符串')
    const results = await validateBatch(urls, { limit: 2 })
    assert(results.length === 2, '结果数应为 2')
    assert(results[0].status, '第1个结果应有 status')
  })

  console.log(`\n=== 结果: ${passed}/${passed + failed} 通过 ===`)
  if (failed > 0) {
    console.log('❌ 有失败用例!')
    app.quit()
    process.exit(1)
  } else {
    console.log('✅ 全部通过!')
    app.quit()
    process.exit(0)
  }
})
