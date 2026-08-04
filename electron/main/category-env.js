// 分类环境管理
// 每个环境包含独立的分类列表和书签分类映射
// 切换环境时，保存当前环境的分类和映射，加载目标环境的分类和映射

import path from 'node:path'
import { DATA_DIR, readJSON, writeJSON, loadBookmarks, saveBookmarks, loadCategories, saveCategories } from './store.js'

const ENV_FILE = path.join(DATA_DIR, 'category-environments.json')

// 环境数据结构：
// {
//   environments: [
//     { id, name, categories: [...], bookmarkMappings: { bookmarkId: categoryId }, createdAt }
//   ],
//   currentEnvId: 'xxx'
// }

export function loadEnvironments() {
  return readJSON(ENV_FILE, { environments: [], currentEnvId: null })
}

export function saveEnvironments(data) {
  writeJSON(ENV_FILE, data)
}

export function getCurrentEnvironment() {
  const data = loadEnvironments()
  return data.environments.find(e => e.id === data.currentEnvId) || null
}

// 初始化默认环境（首次使用时自动创建）
export function ensureDefaultEnvironment() {
  const data = loadEnvironments()
  if (data.environments.length === 0) {
    const cats = loadCategories()
    const bookmarks = loadBookmarks()
    const mappings = {}
    for (const bm of bookmarks) {
      if (bm.categoryId) mappings[bm.id] = bm.categoryId
    }
    const defaultEnv = {
      id: 'env-default-' + Date.now(),
      name: '默认环境',
      categories: cats,
      bookmarkMappings: mappings,
      createdAt: Date.now()
    }
    data.environments.push(defaultEnv)
    data.currentEnvId = defaultEnv.id
    saveEnvironments(data)
  }
  // 如果 currentEnvId 无效，修正为第一个环境
  if (!data.environments.find(e => e.id === data.currentEnvId)) {
    data.currentEnvId = data.environments[0]?.id || null
    if (data.currentEnvId) saveEnvironments(data)
  }
  return data
}

// 创建新环境（空分类）
export function createEnvironment(name) {
  ensureDefaultEnvironment()
  const data = loadEnvironments()
  const newEnv = {
    id: 'env-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    name: name || '新环境',
    categories: [],
    bookmarkMappings: {},
    createdAt: Date.now()
  }
  data.environments.push(newEnv)
  saveEnvironments(data)
  return newEnv
}

// 切换环境：保存当前 → 加载目标
export function switchEnvironment(envId) {
  const data = loadEnvironments()
  const targetEnv = data.environments.find(e => e.id === envId)
  if (!targetEnv) return { ok: false, error: '环境不存在' }
  if (envId === data.currentEnvId) return { ok: false, error: '已是当前环境' }

  // 1. 保存当前环境的分类和书签映射
  const currentEnv = data.environments.find(e => e.id === data.currentEnvId)
  if (currentEnv) {
    currentEnv.categories = loadCategories()
    const bookmarks = loadBookmarks()
    const mappings = {}
    for (const bm of bookmarks) {
      if (bm.categoryId) mappings[bm.id] = bm.categoryId
    }
    currentEnv.bookmarkMappings = mappings
  }

  // 2. 设置当前环境
  data.currentEnvId = envId
  saveEnvironments(data)

  // 3. 加载目标环境的分类
  saveCategories(targetEnv.categories || [])

  // 4. 应用目标环境的书签映射
  const bookmarks = loadBookmarks()
  const mappings = targetEnv.bookmarkMappings || {}
  for (const bm of bookmarks) {
    const catId = mappings[bm.id] || null
    bm.categoryId = catId
    bm.manualCategoryId = catId
    bm.manualSet = !!catId
  }
  saveBookmarks(bookmarks)

  return { ok: true, env: targetEnv }
}

// 镜像环境：复制当前环境（含分类和书签映射）创建新环境
export function mirrorEnvironment(newName) {
  ensureDefaultEnvironment()
  const data = loadEnvironments()
  const currentEnv = data.environments.find(e => e.id === data.currentEnvId)
  if (!currentEnv) return { ok: false, error: '无当前环境' }

  // 同步当前环境的最新状态
  const currentCategories = loadCategories()
  const bookmarks = loadBookmarks()
  const currentMappings = {}
  for (const bm of bookmarks) {
    if (bm.categoryId) currentMappings[bm.id] = bm.categoryId
  }

  const newEnv = {
    id: 'env-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    name: newName || (currentEnv.name + ' (镜像)'),
    categories: JSON.parse(JSON.stringify(currentCategories)),
    bookmarkMappings: JSON.parse(JSON.stringify(currentMappings)),
    createdAt: Date.now()
  }
  data.environments.push(newEnv)
  saveEnvironments(data)
  return { ok: true, env: newEnv }
}

// 删除环境
export function deleteEnvironment(envId) {
  const data = loadEnvironments()
  if (data.environments.length <= 1) return { ok: false, error: '至少保留一个环境' }
  if (envId === data.currentEnvId) return { ok: false, error: '不能删除当前环境' }
  data.environments = data.environments.filter(e => e.id !== envId)
  saveEnvironments(data)
  return { ok: true }
}

// 重命名环境
export function renameEnvironment(envId, newName) {
  const data = loadEnvironments()
  const env = data.environments.find(e => e.id === envId)
  if (!env) return { ok: false, error: '环境不存在' }
  env.name = newName
  saveEnvironments(data)
  return { ok: true }
}

// 获取环境列表（不包含 categories/mappings 详情，减少 IPC 传输量）
export function listEnvironments() {
  const data = ensureDefaultEnvironment()
  return {
    environments: data.environments.map(e => ({
      id: e.id,
      name: e.name,
      categoryCount: (e.categories || []).length,
      bookmarkCount: Object.keys(e.bookmarkMappings || {}).length,
      createdAt: e.createdAt
    })),
    currentEnvId: data.currentEnvId
  }
}
