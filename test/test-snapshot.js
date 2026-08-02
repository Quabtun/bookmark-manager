// 快照模块测试：验证自动分类前后快照正确保存和恢复
// 用法：node_modules/electron/dist/electron.exe test/test-snapshot.js
import { app } from 'electron'
import {
  loadBookmarks, saveBookmarks,
  loadSnapshots, saveSnapshots,
  FILES
} from '../electron/main/store.js'
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot } from '../electron/main/snapshot.js'
import { applyAutoClassify, suggestCategory } from '../electron/main/classifier.js'
import fs from 'node:fs'

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
  console.log('\n=== 快照模块测试开始 ===\n')

  // 清理测试数据
  saveBookmarks([])
  saveSnapshots([])

  // 准备测试书签（有分类和未分类混合）
  const testBookmarks = [
    { id: 'bm-1', url: 'https://github.com/facebook/react', title: 'React', categoryId: 'cat-dev', manualSet: true, manualCategoryId: 'cat-dev' },
    { id: 'bm-2', url: 'https://dribbble.com', title: 'Dribbble', categoryId: 'cat-design', manualSet: false, manualCategoryId: null },
    { id: 'bm-3', url: 'https://www.zhihu.com', title: '知乎', categoryId: 'cat-other', manualSet: false, manualCategoryId: null },
    { id: 'bm-4', url: 'https://github.com/vuejs/vue', title: 'Vue', categoryId: 'cat-other', manualSet: false, manualCategoryId: null },
    { id: 'bm-5', url: 'https://bilibili.com', title: 'B站', categoryId: 'cat-fun', manualSet: true, manualCategoryId: 'cat-fun' },
  ]
  saveBookmarks(testBookmarks)
  console.log('  测试书签已写入:', testBookmarks.map(b => `${b.title}→${b.categoryId}`).join(', '))

  // 测试 1: 自动分类前创建快照，快照包含旧分类
  test('自动分类前创建快照，快照保留旧分类', () => {
    const before = loadBookmarks()
    const snap = createSnapshot(before, { name: '自动分类前', kind: 'auto' })
    assert(!!snap.id, '快照应有ID')
    assert(snap.count === 5, '快照应包含5条, 实际:' + snap.count)
    assert(snap.mapping['bm-1'] === 'cat-dev', 'bm-1 旧分类应为 cat-dev')
    assert(snap.mapping['bm-4'] === 'cat-other', 'bm-4 旧分类应为 cat-other（未分类）')
    console.log('    → 快照 mapping:', JSON.stringify(snap.mapping))
  })

  // 测试 2: 应用自动分类
  test('applyAutoClassify 保护手动分类', () => {
    const before = loadBookmarks()
    const after = applyAutoClassify(before, { protectManual: true })
    assert(after.length === 5, '应有5条')

    const bm1 = after.find(b => b.id === 'bm-1')  // 手动设为 cat-dev
    assert(bm1.categoryId === 'cat-dev', 'bm-1 手动分类应保留 cat-dev, 实际:' + bm1.categoryId)
    assert(bm1.manualSet === true, 'bm-1 manualSet 应为 true')

    const bm5 = after.find(b => b.id === 'bm-5')  // 手动设为 cat-fun
    assert(bm5.categoryId === 'cat-fun', 'bm-5 手动分类应保留 cat-fun, 实际:' + bm5.categoryId)

    const bm4 = after.find(b => b.id === 'bm-4')  // 未手动，应被自动分类
    console.log('    → bm-4(' + bm4.title + ') 自动分类至:', bm4.categoryId, '建议:', bm4.autoCategorySuggested)
    assert(bm4.categoryId !== 'cat-other', 'bm-4 应被自动分类，不应仍是 cat-other')

    // 保存分类结果
    saveBookmarks(after)
    console.log('    → 分类后:', after.map(b => `${b.title}→${b.categoryId}${b.manualSet ? '(手)' : ''}`).join(', '))
  })

  // 测试 3: 从快照恢复
  test('从快照恢复分类', () => {
    const current = loadBookmarks()
    const snaps = listSnapshots()
    assert(snaps.length >= 1, '应有至少1个快照, 实际:' + snaps.length)
    const autoSnap = snaps.find(s => s.kind === 'auto')
    assert(!!autoSnap, '应有一个 auto 类型快照')

    const { bookmarks: restored, restored: count } = restoreSnapshot(current, autoSnap.id)
    assert(count === 5, '应恢复5条, 实际:' + count)
    assert(restored.find(b => b.id === 'bm-1').categoryId === 'cat-dev', 'bm-1 应恢复为 cat-dev')
    assert(restored.find(b => b.id === 'bm-4').categoryId === 'cat-other', 'bm-4 应恢复为 cat-other（未分类）')
    console.log('    → 恢复后:', restored.map(b => `${b.title}→${b.categoryId}`).join(', '))
  })

  // 测试 4: 模拟完整 IPC classify:apply 流程
  test('IPC classify:apply 完整流程（创建快照+分类+保存）', () => {
    // 重置书签到初始状态
    saveBookmarks(testBookmarks)
    saveSnapshots([])

    const bookmarks = loadBookmarks()
    // 模拟 ipc.js classify:apply handler 的逻辑
    createSnapshot(bookmarks, { name: '自动分类前', kind: 'auto' })
    const classified = applyAutoClassify(bookmarks, { protectManual: true })
    saveBookmarks(classified)

    // 验证快照已保存
    const snaps = loadSnapshots()
    assert(snaps.length === 1, '应保存1个快照, 实际:' + snaps.length)
    assert(snaps[0].kind === 'auto', '快照类型应为 auto')

    // 验证书签已更新
    const saved = loadBookmarks()
    assert(saved.length === 5, '保存的书签数应为5')
    console.log('    → 快照列表:', snaps.map(s => s.name))
  })

  // 测试 5: 快照文件实际写入磁盘
  test('快照文件正确写入磁盘', () => {
    const raw = fs.readFileSync(FILES.snapshots, 'utf8')
    const data = JSON.parse(raw)
    assert(Array.isArray(data), '快照文件应为数组')
    assert(data.length >= 1, '快照文件应至少有1条')
    assert(!!data[0].mapping, '快照应有 mapping 字段')
    assert(typeof data[0].mapping === 'object', 'mapping 应为对象')
    console.log('    → 快照文件内容（前200字）:', raw.slice(0, 200))
  })

  // 测试 6: 多次自动分类，快照累加（最多50个）
  test('多次自动分类，快照正确累加', () => {
    const bookmarks = loadBookmarks()
    createSnapshot(bookmarks, { name: '第2次', kind: 'auto' })
    const snaps = loadSnapshots()
    assert(snaps.length === 2, '应有2个快照, 实际:' + snaps.length)
    console.log('    → 快照数:', snaps.length, '最新:', snaps[0].name)
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
