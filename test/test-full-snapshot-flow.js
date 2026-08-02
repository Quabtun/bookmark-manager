// 完整端到端测试：自动分类快照保存 → 列表 → 恢复
// 用法：node_modules/electron/dist/electron.exe test/test-full-snapshot-flow.js
import { app } from 'electron'
import {
  loadBookmarks, saveBookmarks,
  loadSnapshots, saveSnapshots,
  FILES
} from '../electron/main/store.js'
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot } from '../electron/main/snapshot.js'
import { applyAutoClassify } from '../electron/main/classifier.js'
import fs from 'node:fs'

let passed = 0, failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { passed++; console.log('  ✅', name) },
        (e) => { failed++; console.log('  ❌', name); console.log('     Error:', e.message) }
      )
    }
    passed++
    console.log('  ✅', name)
    return result
  } catch (e) {
    failed++
    console.log('  ❌', name)
    console.log('     Error:', e.message)
    console.log('     Stack:', e.stack?.split('\n')[1]?.trim())
    return null
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed')
}

app.whenReady().then(async () => {
  console.log('\n=== 完整快照流程测试 ===\n')

  // 清理
  saveBookmarks([])
  saveSnapshots([])
  deleteSnapshot(':all')

  // 写入测试书签
  const bms = [
    { id: 'bm-1', url: 'https://github.com/vuejs/vue', title: 'Vue', categoryId: 'cat-other', manualSet: false },
    { id: 'bm-2', url: 'https://github.com/facebook/react', title: 'React', categoryId: 'cat-dev', manualSet: true },
    { id: 'bm-3', url: 'https://zhihu.com', title: '知乎', categoryId: 'cat-other', manualSet: false },
  ]
  saveBookmarks(bms)
  console.log('  初始书签:', bms.map(b => b.title + '→' + b.categoryId).join(', '))

  // 【步骤 1】模拟自动分类（完整 IPC handler 逻辑）
  test('Step 1: 模拟 classify:apply IPC — 创建快照+分类+保存', () => {
    const bookmarks = loadBookmarks()
    console.log('    分类前:', bookmarks.map(b => b.title + '→' + b.categoryId).join(', '))

    // 模拟 ipc.js classify:apply handler
    createSnapshot(bookmarks, { name: '自动分类前 ' + new Date().toISOString().slice(0, 19), kind: 'auto' })
    const classified = applyAutoClassify(bookmarks, { protectManual: true })
    saveBookmarks(classified)

    // 验证快照已写入磁盘
    const raw = fs.readFileSync(FILES.snapshots, 'utf8')
    const snapshots = JSON.parse(raw)
    assert(snapshots.length === 1, '快照文件应有1条, 实际:' + snapshots.length)
    assert(snapshots[0].kind === 'auto', '快照类型应为 auto')
    assert(snapshots[0].count === 3, '快照 count 应为3, 实际:' + snapshots[0].count)
    assert(!!snapshots[0].mapping, '快照应有 mapping')
    assert(snapshots[0].mapping['bm-1'] === 'cat-other', 'bm-1 旧分类应为 cat-other')
    assert(snapshots[0].mapping['bm-2'] === 'cat-dev', 'bm-2 旧分类应为 cat-dev（手动）')

    // 验证书签已更新
    const saved = loadBookmarks()
    const bm1 = saved.find(b => b.id === 'bm-1')
    assert(bm1.categoryId === 'cat-dev', 'bm-1 应被自动分类为 cat-dev, 实际:' + bm1.categoryId)
    const bm2 = saved.find(b => b.id === 'bm-2')
    assert(bm2.categoryId === 'cat-dev', 'bm-2 手动分类应保留 cat-dev')
    console.log('    分类后:', saved.map(b => b.title + '→' + b.categoryId + (b.manualSet ? '(手)' : '')).join(', '))
    console.log('    快照名称:', snapshots[0].name)
  })

  // 【步骤 2】模拟 SnapshotPanel 加载列表
  test('Step 2: snap:list 返回快照列表', () => {
    const list = listSnapshots()
    assert(Array.isArray(list), '应返回数组')
    assert(list.length === 1, '应有1个快照, 实际:' + list.length)
    assert(list[0].kind === 'auto', '类型应为 auto')
    assert(list[0].count === 3, 'count 应为3')
    console.log('    快照列表:', list.map(s => s.name + '(' + s.count + '条)').join(', '))
  })

  // 【步骤 3】模拟点击"恢复"
  test('Step 3: 从快照恢复分类', () => {
    const current = loadBookmarks()
    const snaps = listSnapshots()
    const snap = snaps[0]
    console.log('    恢复前:', current.map(b => b.title + '→' + b.categoryId).join(', '))

    const { bookmarks: restored, restored: count } = restoreSnapshot(current, snap.id)
    assert(count === 3, '应恢复3条, 实际:' + count)
    saveBookmarks(restored)

    const afterRestore = loadBookmarks()
    assert(afterRestore.find(b => b.id === 'bm-1').categoryId === 'cat-other', 'bm-1 应恢复为 cat-other')
    assert(afterRestore.find(b => b.id === 'bm-2').categoryId === 'cat-dev', 'bm-2 应恢复为 cat-dev')
    console.log('    恢复后:', afterRestore.map(b => b.title + '→' + b.categoryId).join(', '))
  })

  // 【步骤 4】再次自动分类，验证快照累加
  test('Step 4: 再次自动分类，快照累加', () => {
    const bookmarks = loadBookmarks()
    createSnapshot(bookmarks, { name: '第2次自动分类前', kind: 'auto' })
    const classified = applyAutoClassify(bookmarks, { protectManual: true })
    saveBookmarks(classified)

    const snaps = listSnapshots()
    assert(snaps.length === 2, '应有2个快照, 实际:' + snaps.length)
    console.log('    快照数:', snaps.length)
  })

  // 【步骤 5】验证快照文件内容完整性
  test('Step 5: 快照文件 JSON 结构完整', () => {
    const raw = fs.readFileSync(FILES.snapshots, 'utf8')
    const data = JSON.parse(raw)
    for (const s of data) {
      assert(!!s.id, '快照应有 id')
      assert(!!s.name, '快照应有 name')
      assert(!!s.mapping, '快照应有 mapping')
      assert(typeof s.mapping === 'object', 'mapping 应为对象')
      assert(Object.keys(s.mapping).length === s.count, 'mapping 键数应等于 count')
    }
    console.log('    所有快照结构正确')
  })

  // 清理
  saveBookmarks([])
  saveSnapshots([])

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
