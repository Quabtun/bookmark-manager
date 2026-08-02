import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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

  return { categories, sorted, tree, byId, loaded, load, save, add, update, remove, reorder }
})
