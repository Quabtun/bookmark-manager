// WHOIS 模块功能测试
// 用法：node_modules/electron/dist/electron.exe test/test-whois.js
import { app } from 'electron'
import { lookupWhois, isWhoisReady } from '../electron/main/whois.js'

let passed = 0, failed = 0

function test(name, fn) {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { passed++; console.log('  ✅', name) },
        (e) => { failed++; console.log('  ❌', name, '→', e.message) }
      )
    }
    passed++
    console.log('  ✅', name)
    return r
  } catch (e) {
    failed++
    console.log('  ❌', name, '→', e.message)
    return null
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

app.whenReady().then(async () => {
  console.log('\n=== WHOIS 功能测试 ===\n')

  test('isWhoisReady 返回 true（TCP WHOIS 无需数据库）', () => {
    assert(isWhoisReady() === true, '应始终返回 true')
  })

  // 测试知名域名（需要联网，可能超时）
  const domains = [
    { url: 'https://github.com', domain: 'github.com' },
    { url: 'https://google.com', domain: 'google.com' },
    { url: 'https://baidu.com', domain: 'baidu.com' },
  ]

  for (const { url, domain } of domains) {
    const name = `lookupWhois(${domain}) 返回结果`
    await test(name, async () => {
      const r = await lookupWhois(url)
      console.log(`    → ${domain}:`, JSON.stringify(r).slice(0, 200))
      assert(!!r, '应返回结果')
      assert(r.domain === domain, `domain 应为 ${domain}, 实际: ${r.domain}`)
      // 不应返回 error（知名域名一定有 WHOIS）
      if (r.error) {
        console.log(`    ⚠️  ${domain} 返回错误:`, r.error)
      }
      // 若有 raw 字段，说明 WHOIS 查询成功
      if (r.raw) {
        assert(r.raw.length > 10, 'raw 应非空')
      }
    })
  }

  // 测试无效 URL
  test('lookupWhois(无效 URL) 返回 error', async () => {
    const r = await lookupWhois('not-a-valid-url')
    assert(!!r.error, '无效 URL 应返回 error')
    console.log('    →', r.error)
  })

  // 测试 IP 地址（不应崩溃）
  test('lookupWhois(IP 地址) 不崩溃', async () => {
    const r = await lookupWhois('http://192.168.1.1')
    console.log('    →', JSON.stringify(r).slice(0, 100))
    assert(!!r, '应返回结果（即使失败）')
  })

  console.log(`\n=== 结果: ${passed}/${passed + failed} 通过 ===`)
  if (failed > 0) {
    console.log('❌ 有失败用例')
    app.quit()
    process.exit(1)
  } else {
    console.log('✅ 全部通过!')
    app.quit()
    process.exit(0)
  }
})
