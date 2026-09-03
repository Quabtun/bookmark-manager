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
  // 树形结构（用于 Chrome 书签管理器风格的侧边栏）
  const tree = computed(() => buildTree(sorted.value))

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
    await window.api.invoke('cat:save', JSON.parse(JSON.stringify(list)))  // 深拷贝确保序列化
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
      tags: cat.tags || []
    }
    categories.value.push(newCat)
    await save(categories.value)
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

  return { categories, sorted, tree, byId, loaded, load, save, add, update, remove, reorder, descendantIds, descendantIdsUnion, isAncestor }
})
