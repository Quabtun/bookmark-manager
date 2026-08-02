import { app, session, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEncrypted, saveEncrypted, FILES } from './crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// cookies 结构：{ "<域名>": [ { name, value, domain, path, secure, httpOnly, expires, hostOnly, session } ] }
let cache = null

function load() {
  if (cache === null) cache = loadEncrypted(FILES.cookies, {})
  return cache
}

// 数据目录切换时重置缓存
export function resetCookieCache() { cache = null }

function persist() {
  saveEncrypted(FILES.cookies, cache)
}

// 为指定网站打开独立登录窗口，登录后由前端调用 captureCookies 抓取
export async function openLoginWindow(url) {
  const win = new BrowserWindow({
    width: 960, height: 720,
    title: '登录 - ' + url,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:login' // 独立分区持久化，便于复用登录态
    }
  })
  win.loadURL(url)
  return win.id
}

// 抓取指定 url 的 cookies 并加密保存
export async function captureCookies(url) {
  const u = new URL(url)
  const host = u.hostname
  const ses = session.fromPartition('persist:login')
  const cookies = await ses.cookies.get({ url })
  const list = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    hostOnly: !!c.hostOnly,
    session: !!c.session,
    expires: c.expirationDate || null
  }))
  const data = load()
  data[host] = list
  persist()
  return { host, count: list.length }
}

export function getCookiesForHost(host) {
  return (load()[host] || []).map((c) => ({ ...c, value: '' }))
}

export function getAllCookies() {
  const out = {}
  for (const [host, list] of Object.entries(load())) {
    out[host] = list.map((c) => ({ ...c, value: '' }))
  }
  return out
}

export function revealCookieValue(host, name) {
  const list = load()[host] || []
  const c = list.find((x) => x.name === name)
  return c ? c.value : null
}

export function deleteCookie(host, name) {
  const data = load()
  if (!data[host]) return false
  data[host] = data[host].filter((c) => c.name !== name)
  if (data[host].length === 0) delete data[host]
  persist()
  return true
}

export function clearCookies(host) {
  const data = load()
  if (host) {
    delete data[host]
  } else {
    for (const k of Object.keys(data)) delete data[k]
  }
  persist()
  return true
}
