import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 给定一组分类与起始 id，返回「包含自身」的整棵子树 id 集合。
 * @param {Array<{id:string,parentId:string|null}>} categories
 * @param {string|null|undefined} id
 * @returns {Set<string>}
 */
export function collectDescendantIds(categories, id) {
  const set = new Set()
  if (!id) return set
  set.add(id)
  const stack = [id]
  while (stack.length > 0) {
    const pid = stack.pop()
    for (const c of categories) {
      if (c.parentId === pid && !set.has(c.id)) {
        set.add(c.id)
        stack.push(c.id)
      }
    }
  }
  return set
}

/**
 * 判断 ancestorId 是否是 descendantId 的祖先（不含自身）。
 * @param {Array<{id:string,parentId:string|null}>} categories
 * @param {string} ancestorId
 * @param {string} descendantId
 * @returns {boolean}
 */
export function isAncestorOf(categories, ancestorId, descendantId) {
  if (!ancestorId || !descendantId) return false
  const byId = new Map()
  for (const c of categories) byId.set(c.id, c)
  let cur = byId.get(descendantId)
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true
    cur = byId.get(cur.parentId)
  }
  return false
}

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref([])
  const loaded = ref(false)

  const sorted = computed(() => [...categories.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
  const byId = computed(() => {
    const map = {}
    for (const c of categories.value) map[c.id] = c
    return map
  })
  // 树形结构（用于分类管理弹窗等保留全量数据的地方）
  const tree = computed(() => buildTree(sorted.value))

  // 仅“手动添加”的分类树（按 origin 划分，兼容旧数据 manual=true）
  const manualList = computed(() => categories.value.filter((c) => {
    if (c.origin === 'imported') return false
    if (c.origin === 'manual') return true
    return c.manual !== false
  }))
  const manualTree = computed(() => buildTree(manualList.value))

  // 仅“导入”的分类树（浏览器/HTML/CSV/JSON/Pocket 等导入流产生的分类）
  const importedList = computed(() => categories.value.filter((c) => c.origin === 'imported'))
  const importedTree = computed(() => buildTree(importedList.value))

  function buildTree(list) {
    const map = {}
    for (const c of list) {
      map[c.id] = { ...c, children: [] }
    }
    const roots = []
    for (const c of list) {
      if (c.parentId && map[c.parentId]) {
        map[c.parentId].children.push(map[c.id])
      } else {
        roots.push(map[c.id])
      }
    }
    const sortChildren = (nodes) => {
      for (const n of nodes) {
        n.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        sortChildren(n.children)
      }
    }
    sortChildren(roots)
    return roots
  }

  async function load() {
    categories.value = await window.api.invoke('cat:list')
    loaded.value = true
  }

  async function save(list) {
    categories.value = list
    const r = await window.api.invoke('cat:save', JSON.parse(JSON.stringify(list)))  // 深拷贝确保序列化
    if (r && r.error) throw new Error(r.error)
    return r
  }

  async function add(cat) {
    const maxOrder = categories.value.reduce((m, c) => Math.max(m, c.order ?? 0), -1)
    const newCat = {
      id: 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name: cat.name || '新分类',
      icon: cat.icon || '📁',
      color: cat.color || '#64748b',
      order: maxOrder + 1,
      parentId: cat.parentId || null,
      tags: cat.tags || [],
      // 分类来源：'manual' = 用户手动创建；'imported' = 浏览器/HTML/CSV/JSON/Pocket 等导入流
      // 默认新建为手动分类，避免导入流意外写入手动树
      origin: cat.origin || (cat.manual === false ? 'imported' : 'manual'),
      // 兼容旧数据：origin 缺省时按 manual 字段认定
      manual: cat.manual === undefined ? (cat.origin === 'imported' ? false : true) : !!cat.manual
    }
    categories.value.push(newCat)
    try {
      await save(categories.value)
    } catch (e) {
      // 保存失败回滚 UI，避免出现"内存有数据但磁盘没有"的鬼影
      const i = categories.value.findIndex((c) => c.id === newCat.id)
      if (i !== -1) categories.value.splice(i, 1)
      throw e
    }
    return newCat
  }

  async function update(id, patch) {
    const i = categories.value.findIndex((c) => c.id === id)
    if (i !== -1) {
      categories.value[i] = { ...categories.value[i], ...patch }
      await save(categories.value)
    }
  }

  async function remove(id) {
    categories.value = categories.value.filter((c) => c.id !== id)
    // 异步保存，不阻塞UI
    save(categories.value).catch(() => {})
  }

  async function reorder(newList) {
    newList.forEach((c, i) => { c.order = i })
    categories.value = newList
    await save(categories.value)
  }

  // 给定分类 id，返回「包含自身」的整棵子树 id 列表
  function descendantIds(id) {
    return collectDescendantIds(categories.value, id)
  }

  // 给定一组 id，返回其全部后代 id 的并集（含自身）
  function descendantIdsUnion(ids) {
    const set = new Set()
    for (const id of ids) {
      const sub = descendantIds(id)
      for (const v of sub) set.add(v)
    }
    return set
  }

  // 判断 ancestorId 是否是 descendantId 的祖先（用于拖拽防循环）
  function isAncestor(ancestorId, descendantId) {
    return isAncestorOf(categories.value, ancestorId, descendantId)
  }

  // 给定一条「从根到当前」的路径（不含根 id），按顺序 ensure 出分类节点
  // 例如 path = ['工具', '开发', 'IDE'] 会保证存在：
  //   工具 / 工具 › 开发 / 工具 › 开发 › IDE
  // 同一名字同名时复用第一个匹配节点（按 parentId + name 定位）
  // 选项 options: { origin: 'imported' | 'manual', icon, color }
  // 返回最终叶子节点的 id
  function ensureByPath(path, options = {}) {
    if (!Array.isArray(path) || path.length === 0) return null
    const origin = options.origin || 'imported'
    let parentId = null
    let created = null
    for (const seg of path) {
      const name = String(seg || '').trim()
      if (!name) continue
      const exist = categories.value.find(
        (c) => c.parentId === parentId && c.name === name && (c.origin || (c.manual === false ? 'imported' : 'manual')) === origin
      )
      if (exist) {
        parentId = exist.id
        created = exist
        continue
      }
      // 同步创建（不 await save，调用方统一收尾）
      const maxOrder = categories.value.reduce((m, c) => Math.max(m, c.order ?? 0), -1)
      const newCat = {
        id: 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        name,
        icon: options.icon || '📁',
        color: options.color || '#64748b',
        order: maxOrder + 1,
        parentId,
        tags: [],
        origin,
        manual: origin !== 'imported'
      }
      categories.value.push(newCat)
      parentId = newCat.id
      created = newCat
    }
    return created?.id || null
  }

  // 启动回填：把孤立分类 id（bookmark.categoryId 指向但 cats.byId 里没有的 id）
  // 创建成占位节点，确保 imported 树能渲染出来。
  // 输入：bookmark 列表（避免 store 互相依赖）
  // 返回：本次新增的占位节点 id 集合（用于可能的去重/合并）
  function backfillOrphans(bookmarkList) {
    const known = new Set(categories.value.map((c) => c.id))
    const ids = new Set()
    for (const b of (bookmarkList || [])) {
      const cid = b?.categoryId
      if (cid && !known.has(cid) && !ids.has(cid)) ids.add(cid)
    }
    if (ids.size === 0) return []
    const created = []
    for (const id of ids) {
      // 占位节点：使用 id 作为 name 片段，便于在 UI 看到原始 id 便于诊断
      const maxOrder = categories.value.reduce((m, c) => Math.max(m, c.order ?? 0), -1)
      const placeholder = {
        id,
        name: '导入-' + id,
        icon: '📁',
        color: '#64748b',
        order: maxOrder + 1,
        parentId: null,
        tags: [],
        origin: 'imported',
        manual: false,
        synthetic: true
      }
      categories.value.push(placeholder)
      known.add(id)
      created.push(placeholder)
    }
    // 异步持久化（不阻塞 UI）
    if (created.length > 0) {
      save(categories.value).catch(() => {})
    }
    return created
  }

  return { categories, sorted, tree, byId, manualTree, importedTree, manualList, importedList, loaded, load, save, add, update, remove, reorder, descendantIds, descendantIdsUnion, isAncestor, ensureByPath, backfillOrphans }
})
