import { loadEncrypted, saveEncrypted, FILES } from './crypto.js'

// 凭证结构：{ "<域名>": [ { id, username, password, note, updatedAt } ] }
let cache = null

function load() {
  if (cache === null) cache = loadEncrypted(FILES.credentials, {})
  return cache
}

// 数据目录切换时重置缓存（由 store.js 的 reloadPaths 间接触发）
export function resetCredentialCache() { cache = null }

function persist() {
  saveEncrypted(FILES.credentials, cache)
}

export function getCredentialsForHost(host) {
  return load()[host] || []
}

export function getAllCredentials() {
  // 返回时屏蔽密码
  const out = {}
  for (const [host, list] of Object.entries(load())) {
    out[host] = list.map((c) => ({ ...c, password: '' }))
  }
  return out
}

export function addCredential(host, { username, password, note }) {
  const data = load()
  if (!data[host]) data[host] = []
  const entry = {
    id: 'cred-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    username, password, note: note || '', updatedAt: Date.now()
  }
  data[host].push(entry)
  persist()
  return entry
}

export function updateCredential(host, id, patch) {
  const data = load()
  const list = data[host] || []
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() }
  persist()
  return list[idx]
}

export function deleteCredential(host, id) {
  const data = load()
  if (!data[host]) return false
  data[host] = data[host].filter((c) => c.id !== id)
  if (data[host].length === 0) delete data[host]
  persist()
  return true
}

// 仅在用户显式查看时返回真实密码
export function revealPassword(host, id) {
  const list = load()[host] || []
  const c = list.find((x) => x.id === id)
  return c ? c.password : null
}
