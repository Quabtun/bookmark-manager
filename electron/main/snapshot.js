import { loadSnapshots, saveSnapshots } from './store.js'

// 快照结构: { id, name, createdAt, kind: 'auto'|'manual', mapping: { bookmarkId: categoryId } }
export function listSnapshots() {
  return loadSnapshots().sort((a, b) => b.createdAt - a.createdAt)
}

// 保存全量书签的分类映射为快照
export function createSnapshot(bookmarks, { name, kind = 'manual' } = {}) {
  if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
    console.error('[createSnapshot] bookmarks 无效:', typeof bookmarks, Array.isArray(bookmarks) ? bookmarks.length : '')
    throw new Error('没有书签数据可保存')
  }
  const list = loadSnapshots()
  const now = Date.now()
  const mapping = {}
  let savedCount = 0
  for (const bm of bookmarks) {
    if (!bm || !bm.id) {
      console.warn('[createSnapshot] 跳过无效书签条目:', bm)
      continue  // 跳过无效条目
    }
    mapping[bm.id] = bm.categoryId || 'cat-other'
    savedCount++
  }
  if (savedCount === 0) {
    console.error('[createSnapshot] 所有书签条目均无效, bookmarks[0]:', bookmarks[0])
    throw new Error('没有有效的书签数据可保存到快照')
  }
  console.log('[createSnapshot] 创建快照「' + name + '」，共', savedCount, '个书签映射')
  const snap = {
    id: 'snap-' + now + '-' + Math.random().toString(36).slice(2, 6),
    name: name || (kind === 'auto' ? '自动分类前 ' + formatTime(now) : '手动存档 ' + formatTime(now)),
    createdAt: now,
    kind,
    count: savedCount,
    mapping
  }
  list.push(snap)
  const trimmed = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
  saveSnapshots(trimmed)
  return snap
}

// 从快照恢复：返回新的书签数组（仅更新 categoryId）
export function restoreSnapshot(bookmarks, snapshotId) {
  const list = loadSnapshots()
  const snap = list.find((s) => s.id === snapshotId)
  if (!snap) return { bookmarks, restored: 0 }
  let restored = 0
  const out = bookmarks.map((bm) => {
    if (snap.mapping[bm.id] !== undefined) {
      restored++
      // 防止 categoryId 为 null 导致 UI 异常
      return { ...bm, categoryId: snap.mapping[bm.id] || 'cat-other' }
    }
    return bm
  })
  return { bookmarks: out, restored }
}

export function deleteSnapshot(snapshotId) {
  const list = loadSnapshots().filter((s) => s.id !== snapshotId)
  saveSnapshots(list)
  return true
}

function formatTime(t) {
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
