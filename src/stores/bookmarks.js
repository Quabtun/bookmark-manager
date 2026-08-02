import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from './settings.js'

export const useBookmarksStore = defineStore('bookmarks', () => {
  const bookmarks = ref([])
  const loaded = ref(false)
  const searchQuery = ref('')
  const activeCategory = ref('all') // 'all' | 'unclassified' | categoryId
  const statusFilter = ref('all')   // 'all' | 'ok' | 'dead' | 'warn' | 'unknown'
  const tagFilter = ref('')        // '' = 不筛选, 'tag-name' = 按标签筛选
  const selected = ref(new Set())    // 多选书签 ID 集合
  const sortBy = ref('addedAt')     // 'title' | 'addedAt' | 'status' | 'url' | 'frequency' | 'custom'
  const sortOrder = ref('desc')      // 'asc' | 'desc'
  const dateFrom = ref('')           // 高级筛选：日期起
  const dateTo = ref('')             // 高级筛选：日期止
  const domainFilter = ref('')       // 高级筛选：域名关键词（逗号分隔）
  const groupByCategory = ref(false) // 按分类分组显示
  const readFilter = ref('')         // 阅读状态筛选：'' / 'unread' / 'reading' / 'done'
  const focusMode = ref(false)      // 专注模式

  // 回收站
  const showRecycled = ref(false)
  const recycledCount = ref(0)

  // 归档
  const showArchived = ref(false)
  const archivedCount = ref(0)

  // 分页
  const pageSize = ref(60)
  const currentPage = ref(1)

  // 撤销栈
  const undoStack = ref([])

  // 状态排序权重
  const STATUS_ORDER = { dead: 0, warn: 1, redirect: 2, unknown: 3, ok: 4 }

  // 监听 bookmarks 变化更新回收站数量和归档数量
  watch(bookmarks, (list) => {
    recycledCount.value = list.filter(b => b.recycled === true).length
    archivedCount.value = list.filter(b => b.archived === true).length
  }, { deep: true })

  function setSort(field) {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = field === 'title' ? 'asc' : 'desc'
    }
  }

  // 所有标签（去重，按使用次数降序）
  const allTags = computed(() => {
    const map = {}
    for (const b of bookmarks.value) {
      for (const t of (b.tags || [])) map[t] = (map[t] || 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }))
  })

  // 回收站书签列表
  const recycled = computed(() => {
    return bookmarks.value.filter(b => b.recycled === true)
  })

  // 归档书签列表
  const archived = computed(() => {
    return bookmarks.value.filter(b => b.archived === true)
  })

  // 扁平化 filtered 列表（用于分页）
  const flatFiltered = computed(() => {
    const f = filtered.value
    if (f && f.grouped) return Object.values(f.groups).flat()
    return f || []
  })

  // 分页相关
  const totalPages = computed(() => Math.ceil(flatFiltered.value.length / pageSize.value) || 1)
  const paginatedFiltered = computed(() => {
    const list = flatFiltered.value
    const start = (currentPage.value - 1) * pageSize.value
    return list.slice(start, start + pageSize.value)
  })

  // ---- 归档操作 ----
  async function archive(id) {
    const i = bookmarks.value.findIndex(b => b.id === id)
    if (i === -1) return
    const snapshot = JSON.parse(JSON.stringify(bookmarks.value[i]))
    await window.api.invoke('bm:update', id, { archived: true })
    bookmarks.value[i] = { ...bookmarks.value[i], archived: true }
    pushUndo({ type: 'update', bookmarkId: id, data: { archived: false } })
  }

  async function unarchive(id) {
    const i = bookmarks.value.findIndex(b => b.id === id)
    if (i === -1) return
    const snapshot = JSON.parse(JSON.stringify(bookmarks.value[i]))
    await window.api.invoke('bm:update', id, { archived: false })
    bookmarks.value[i] = { ...bookmarks.value[i], archived: false }
    pushUndo({ type: 'update', bookmarkId: id, data: { archived: true } })
  }

  function toggleSelect(id) {
    const s = new Set(selected.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    selected.value = s
  }
  function selectAll() {
    const f = filtered.value
    const list = (f && f.grouped) ? Object.values(f.groups).flat() : f
    selected.value = new Set(list.map(b => b.id))
  }
  function clearSelection() {
    selected.value = new Set()
  }
  function isSelected(id) {
    return selected.value.has(id)
  }

  // 记录打开（用于"常用"排序）
  async function recordOpen(id) {
    const i = bookmarks.value.findIndex((b) => b.id === id)
    if (i === -1) return
    const b = bookmarks.value[i]
    const openCount = (b.openCount || 0) + 1
    await window.api.invoke('bm:update', id, { openCount, lastOpenedAt: Date.now() })
    bookmarks.value[i] = { ...b, openCount, lastOpenedAt: Date.now() }
  }

  // 计算属性
  const filtered = computed(() => {
    let list = bookmarks.value
    // 回收站过滤
    if (showRecycled.value) {
      list = list.filter(b => b.recycled === true)
    } else if (showArchived.value) {
      list = list.filter(b => b.archived === true)
    } else {
      list = list.filter(b => !b.recycled && !b.archived)
    }
    if (activeCategory.value === 'unclassified') {
      list = list.filter((b) => !b.categoryId)
    } else if (activeCategory.value !== 'all' && !activeCategory.value.startsWith('smart:')) {
      list = list.filter((b) => b.categoryId === activeCategory.value)
    }
    if (statusFilter.value !== 'all') {
      list = list.filter((b) => (b.status || 'unknown') === statusFilter.value)
    }
    if (tagFilter.value) {
      list = list.filter((b) => (b.tags || []).includes(tagFilter.value))
    }
    const q = searchQuery.value.trim().toLowerCase()
    if (q) {
      list = list.filter((b) =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.url || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q) ||
        (b.tags || []).some((t) => t.toLowerCase().includes(q))
      )
    }
    // 高级筛选：日期范围
    if (dateFrom.value) {
      const fromTs = new Date(dateFrom.value).getTime()
      list = list.filter((b) => (b.addedAt || 0) >= fromTs)
    }
    if (dateTo.value) {
      const toTs = new Date(dateTo.value).getTime() + 86400000 - 1 // 包含当天
      list = list.filter((b) => (b.addedAt || 0) <= toTs)
    }
    // 高级筛选：域名过滤
    const domainStr = domainFilter.value.trim()
    if (domainStr) {
      const domains = domainStr.split(/[,，]/).map(d => d.trim().toLowerCase()).filter(Boolean)
      if (domains.length > 0) {
        list = list.filter((b) => {
          try {
            const hostname = new URL(b.url).hostname.toLowerCase()
            return domains.some(d => hostname.includes(d))
          } catch { return false }
        })
      }
    }
    // 阅读状态筛选
    if (readFilter.value && !showRecycled.value && !showArchived.value) {
      list = list.filter((b) => (b.readStatus || 'unread') === readFilter.value)
    }
    // 排序
    const dir = sortOrder.value === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      // 置顶书签始终排在最前面
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (sortBy.value === 'custom') {
        return (a.order || 0) - (b.order || 0)
      }
      if (sortBy.value === 'title') {
        return dir * (a.title || '').localeCompare(b.title || '', 'zh-CN')
      }
      if (sortBy.value === 'status') {
        const wa = STATUS_ORDER[a.status || 'unknown'] ?? 2
        const wb = STATUS_ORDER[b.status || 'unknown'] ?? 2
        return dir * (wa - wb)
      }
      if (sortBy.value === 'url') {
        return dir * (a.url || '').localeCompare(b.url || '')
      }
      if (sortBy.value === 'frequency') {
        return dir * ((a.openCount || 0) - (b.openCount || 0)) || dir * ((a.lastOpenedAt || 0) - (b.lastOpenedAt || 0))
      }
      // addedAt（默认）
      return dir * ((a.addedAt || 0) - (b.addedAt || 0))
    })
    // 按分类分组
    if (groupByCategory.value) {
      const groups = {}
      for (const b of list) {
        const catId = b.categoryId || 'unclassified'
        if (!groups[catId]) groups[catId] = []
        groups[catId].push(b)
      }
      return { grouped: true, groups }
    }
    return list
  })

  const countByCategory = computed(() => {
    const map = {}
    for (const b of bookmarks.value) {
      const k = b.categoryId || 'unclassified'
      map[k] = (map[k] || 0) + 1
    }
    return map
  })

  const stats = computed(() => {
    const active = bookmarks.value.filter(b => !b.recycled && !b.archived)
    const s = { total: active.length, ok: 0, dead: 0, warn: 0, redirect: 0, unknown: 0 }
    for (const b of active) {
      const st = b.status || 'unknown'
      if (s[st] !== undefined) s[st]++
    }
    return s
  })

  // filtered 变化时重置页码（必须在 filtered 声明之后）
  watch(filtered, () => { currentPage.value = 1 })

  async function load() {
    bookmarks.value = await window.api.invoke('bm:list')
    loaded.value = true
    return bookmarks.value
  }

  async function persistAll() {
    await window.api.invoke('bm:save', JSON.parse(JSON.stringify(bookmarks.value)))
  }

  // ---- 撤销操作 ----
  function pushUndo(action) {
    undoStack.value = [...undoStack.value.slice(-(30 - 1)), action]
  }

  async function undo() {
    if (undoStack.value.length === 0) return
    const action = undoStack.value[undoStack.value.length - 1]
    undoStack.value = undoStack.value.slice(0, -1)
    switch (action.type) {
      case 'delete':
        await restore(action.bookmarkId)
        break
      case 'update': {
        await window.api.invoke('bm:update', action.bookmarkId, action.data)
        const idx = bookmarks.value.findIndex(b => b.id === action.bookmarkId)
        if (idx !== -1) bookmarks.value[idx] = { ...bookmarks.value[idx], ...action.data }
        break
      }
      case 'add':
        await window.api.invoke('bm:delete', action.bookmarkId)
        bookmarks.value = bookmarks.value.filter(b => b.id !== action.bookmarkId)
        break
      case 'move': {
        await window.api.invoke('bm:update', action.bookmarkId, { categoryId: action.data.categoryId })
        const mi = bookmarks.value.findIndex(b => b.id === action.bookmarkId)
        if (mi !== -1) bookmarks.value[mi] = { ...bookmarks.value[mi], categoryId: action.data.categoryId }
        break
      }
      case 'addTag':
      case 'removeTag': {
        await window.api.invoke('bm:update', action.bookmarkId, { tags: action.data.tags })
        const ti = bookmarks.value.findIndex(b => b.id === action.bookmarkId)
        if (ti !== -1) bookmarks.value[ti] = { ...bookmarks.value[ti], tags: action.data.tags }
        break
      }
      case 'batchDelete': {
        const ids = action.bookmarkIds
        const snapshots = action.data
        for (let i = 0; i < ids.length; i++) {
          await window.api.invoke('bm:update', ids[i], { recycled: false, recycledAt: null })
        }
        for (const snapshot of snapshots) {
          const si = bookmarks.value.findIndex(b => b.id === snapshot.id)
          if (si !== -1) bookmarks.value[si] = { ...bookmarks.value[si], ...snapshot }
        }
        break
      }
    }
  }

  // ---- 回收站操作 ----
  async function softDelete(id) {
    const i = bookmarks.value.findIndex(b => b.id === id)
    if (i === -1) return
    const snapshot = JSON.parse(JSON.stringify(bookmarks.value[i]))
    const updated = await window.api.invoke('bm:update', id, { recycled: true, recycledAt: new Date().toISOString() })
    if (updated) {
      bookmarks.value[i] = { ...bookmarks.value[i], recycled: true, recycledAt: new Date().toISOString() }
      pushUndo({ type: 'delete', bookmarkId: id, data: snapshot })
    }
  }

  async function restore(id) {
    const i = bookmarks.value.findIndex(b => b.id === id)
    if (i === -1) return
    const updated = await window.api.invoke('bm:update', id, { recycled: false, recycledAt: null })
    if (updated) {
      bookmarks.value[i] = { ...bookmarks.value[i], recycled: false, recycledAt: null }
    }
  }

  async function emptyRecycleBin() {
    const recycledItems = bookmarks.value.filter(b => b.recycled === true)
    const recycledIds = new Set(recycledItems.map(b => b.id))
    for (const b of recycledItems) {
      await window.api.invoke('bm:delete', b.id)
    }
    bookmarks.value = bookmarks.value.filter(b => !recycledIds.has(b.id))
    // 清除已永久删除项的撤销记录
    undoStack.value = undoStack.value.filter(a => !recycledIds.has(a.bookmarkId))
  }

  async function add(input) {
    const bm = await window.api.invoke('bm:add', input)
    if (bm && bm.error) { window.$toast && window.$toast('添加失败: ' + bm.error, 'error'); return null }
    if (bm) {
      bookmarks.value.push(bm)
      pushUndo({ type: 'add', bookmarkId: bm.id, data: null })
    }
    return bm
  }

  async function update(id, patch, opts = {}) {
    const i = bookmarks.value.findIndex((b) => b.id === id)
    if (i === -1) return null
    // 操作前保存快照
    const snapshot = JSON.parse(JSON.stringify(bookmarks.value[i]))
    const payload = { ...patch, _isManual: !!opts.isManual }
    const updated = await window.api.invoke('bm:update', id, payload)
    if (updated && updated.error) { window.$toast && window.$toast('更新失败: ' + updated.error, 'error'); return null }
    if (updated) {
      bookmarks.value[i] = { ...bookmarks.value[i], ...updated }
      pushUndo({ type: 'update', bookmarkId: id, data: snapshot })
    }
    return updated
  }

  async function remove(id) {
    await softDelete(id)
  }

  async function togglePin(id) {
    const b = bookmarks.value.find((b) => b.id === id)
    if (!b) return
    await update(id, { pinned: !b.pinned })
  }

  async function removeBatch(ids) {
    const snapshots = []
    for (const id of ids) {
      const i = bookmarks.value.findIndex(b => b.id === id)
      if (i !== -1) {
        snapshots.push({ id, snapshot: JSON.parse(JSON.stringify(bookmarks.value[i])), idx: i })
        const updated = await window.api.invoke('bm:update', id, { recycled: true, recycledAt: new Date().toISOString() })
        if (updated) {
          bookmarks.value[i] = { ...bookmarks.value[i], recycled: true, recycledAt: new Date().toISOString() }
        }
      }
    }
    if (snapshots.length > 0) {
      pushUndo({ type: 'batchDelete', bookmarkIds: snapshots.map(s => s.id), data: snapshots.map(s => s.snapshot) })
    }
  }

  function getById(id) {
    return bookmarks.value.find((b) => b.id === id)
  }

  // 移动到分类（手动）
  async function moveToCategory(id, categoryId, opts = {}) {
    const bm = getById(id)
    if (!bm) return
    const snapshot = JSON.parse(JSON.stringify(bm))
    const r = await window.api.invoke('bm:update', id, { categoryId, _isManual: true })
    if (r && !r.error) {
      const idx = bookmarks.value.findIndex(b => b.id === id)
      if (idx !== -1) {
        bookmarks.value[idx] = { ...bookmarks.value[idx], manualCategoryId: categoryId, manualSet: opts.manual !== false, categoryId }
      }
      pushUndo({ type: 'move', bookmarkId: id, data: snapshot })
    }
  }

  // 批量添加标签
  async function addTagBatch(ids, tags) {
    for (const id of ids) {
      const b = getById(id)
      if (!b) continue
      const existing = new Set(b.tags || [])
      const newTags = tags.filter((t) => !existing.has(t))
      if (newTags.length === 0) continue
      const merged = [...existing, ...newTags]
      await update(id, { tags: merged })
    }
  }

  // 批量应用自动分类
  async function applyAutoClassify(opts) {
    const payload = JSON.parse(JSON.stringify(bookmarks.value))
    const classified = await window.api.invoke('classify:apply', payload, opts || {})
    if (!classified || classified.error) {
      window.$toast && window.$toast('自动分类失败: ' + (classified?.error || '未知错误'), 'error')
      return bookmarks.value
    }
    if (!Array.isArray(classified)) {
      window.$toast && window.$toast('自动分类返回格式异常', 'error')
      return bookmarks.value
    }
    bookmarks.value = classified
    return classified
  }

  // 从快照恢复
  async function restoreSnapshot(snapshotId) {
    const result = await window.api.invoke('snap:restore', snapshotId)
    if (!result || result.error) {
      window.$toast && window.$toast('恢复快照失败: ' + (result?.error || '未知错误'), 'error')
      return 0
    }
    await load()
    return result.restored
  }

  // 批量更新排序
  async function reorder(orders) {
    const r = await window.api.invoke('bm:reorder', orders)
    if (r && r.changed) {
      for (const o of orders) {
        const idx = bookmarks.value.findIndex(b => b.id === o.id)
        if (idx !== -1) bookmarks.value[idx] = { ...bookmarks.value[idx], order: o.order }
      }
    }
    return r
  }

  // 设置阅读状态
  async function setReadStatus(id, status) {
    await update(id, { readStatus: status })
  }

  // 智能文件夹结果
  function smartFolderResults(folderId) {
    const settingsStore = useSettingsStore()
    const folder = (settingsStore.settings.smartFolders || []).find(f => f.id === folderId)
    if (!folder) return []
    let list = bookmarks.value
    if (folder.query) {
      const q = folder.query.trim().toLowerCase()
      if (q) {
        list = list.filter(b =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.url || '').toLowerCase().includes(q) ||
          (b.tags || []).some(t => t.toLowerCase().includes(q))
        )
      }
    }
    if (folder.domainFilter) {
      const domains = folder.domainFilter.split(/[,，]/).map(d => d.trim().toLowerCase()).filter(Boolean)
      if (domains.length > 0) {
        list = list.filter(b => {
          try {
            const hostname = new URL(b.url).hostname.toLowerCase()
            return domains.some(d => hostname.includes(d))
          } catch { return false }
        })
      }
    }
    if (folder.statusFilter && folder.statusFilter !== 'all') {
      list = list.filter(b => (b.status || 'unknown') === folder.statusFilter)
    }
    if (folder.tagFilter) {
      list = list.filter(b => (b.tags || []).includes(folder.tagFilter))
    }
    if (folder.dateFrom) {
      const fromTs = new Date(folder.dateFrom).getTime()
      list = list.filter(b => (b.addedAt || 0) >= fromTs)
    }
    if (folder.dateTo) {
      const toTs = new Date(folder.dateTo).getTime() + 86400000 - 1
      list = list.filter(b => (b.addedAt || 0) <= toTs)
    }
    return list
  }

  return {
    bookmarks, loaded, searchQuery, activeCategory, statusFilter, tagFilter, selected,
    sortBy, sortOrder, dateFrom, dateTo, domainFilter, groupByCategory, readFilter,
    filtered, flatFiltered, paginatedFiltered, countByCategory, stats, allTags,
    pageSize, currentPage, totalPages,
    showRecycled, recycledCount, recycled,
    showArchived, archivedCount, archived,
    softDelete, restore, emptyRecycleBin,
    archive, unarchive,
    undoStack, undo,
    load, persistAll, add, update, remove, removeBatch, getById,
    moveToCategory, addTagBatch, applyAutoClassify, restoreSnapshot,
    toggleSelect, selectAll, clearSelection, isSelected,
    setSort, recordOpen, reorder, togglePin, setReadStatus, smartFolderResults,
    focusMode
  }
})