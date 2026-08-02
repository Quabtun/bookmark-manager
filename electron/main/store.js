import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// 路径变量（可通过 setDataDir 重载）
let DATA_DIR, PREVIEWS_DIR, IMAGES_DIR, FAVICONS_DIR
const FILES = { bookmarks: '', categories: '', settings: '', snapshots: '', credentials: '', cookies: '' }

function reloadPaths(customDir) {
  DATA_DIR = customDir || app.getPath('userData')
  PREVIEWS_DIR = path.join(DATA_DIR, 'previews')
  IMAGES_DIR = path.join(PREVIEWS_DIR, 'images')
  FAVICONS_DIR = path.join(DATA_DIR, 'favicons')
  // 原地更新 FILES 对象（保持引用一致，其他模块的 import 才能看到变化）
  Object.assign(FILES, {
    bookmarks:   path.join(DATA_DIR, 'bookmarks.json'),
    categories:  path.join(DATA_DIR, 'categories.json'),
    settings:    path.join(DATA_DIR, 'settings.json'),
    snapshots:   path.join(DATA_DIR, 'snapshots.json'),
    credentials: path.join(DATA_DIR, 'credentials.enc'),
    cookies:     path.join(DATA_DIR, 'cookies.enc')
  })
}

// 初始化默认路径（app.getPath('userData') 已包含应用名，不需要再拼接）
const DEFAULT_DATA_DIR = app.getPath('userData')
reloadPaths(DEFAULT_DATA_DIR)

// 尝试从已有设置恢复自定义数据目录
try {
  const settingsPath = path.join(DEFAULT_DATA_DIR, 'settings.json')
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    if (raw.trim()) {
      const s = JSON.parse(raw)
      if (s.dataDir && s.dataDir !== DEFAULT_DATA_DIR && fs.existsSync(s.dataDir)) {
        reloadPaths(s.dataDir)
      }
    }
  }
} catch { /* keep default */ }

export function getDataDir() { return DATA_DIR }
export function setDataDir(newPath) {
  if (!newPath) return false
  const parent = path.dirname(newPath)
  if (!fs.existsSync(parent)) {
    try { fs.mkdirSync(parent, { recursive: true }) } catch { return false }
  }
  if (!fs.existsSync(newPath)) {
    try { fs.mkdirSync(newPath, { recursive: true }) } catch { return false }
  }
  reloadPaths(newPath)
  return true
}

function ensureDirs() {
  for (const d of [DATA_DIR, PREVIEWS_DIR, IMAGES_DIR, FAVICONS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  }
}

export { ensureDirs }

export function writeFileAtomic(filePath, content) {
  ensureDirs()
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp-' + process.pid
  fs.writeFileSync(tmp, content, 'utf8')
  // Windows 上 rename 可能因文件被其他进程占用而失败，回退为 copy + unlink
  try {
    fs.renameSync(tmp, filePath)
  } catch {
    fs.copyFileSync(tmp, filePath)
    try { fs.unlinkSync(tmp) } catch { /* ignore cleanup failure */ }
  }
}

export function readJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return fallback
    return JSON.parse(raw)
  } catch (e) {
    console.error('readJSON error', filePath, e.message)
    return fallback
  }
}

export function writeJSON(filePath, data) {
  writeFileAtomic(filePath, JSON.stringify(data, null, 2))
}

export { DATA_DIR, PREVIEWS_DIR, IMAGES_DIR, FAVICONS_DIR, FILES, DEFAULT_DATA_DIR }

// ---- 默认值 ----
const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultBrowser: { preset: 'system', path: '' },
  previewCacheLimitMB: 200,
  geoip: {
    cityMmdbPath: '',
    asnMmdbPath: '',
    allowOnlineFallback: true
  },
  autoValidate: {
    onStartup: false,
    intervalDays: 7
  },
  proxy: {
    enabled: false,
    host: '',
    port: '',
    type: 'http',  // http | socks5
    username: '',
    password: ''
  },
  whois: {
    onlineFallback: true
  },
  backup: {
    enabled: false,
    intervalMinutes: 60,  // 60 = 1小时
    dir: ''
  },
  autoCheckUpdate: true,
  silentDownload: false,
  dataDir: ''
}

const DEFAULT_CATEGORIES = [
  { id: 'cat-dev',     name: '开发',   icon: '💻', color: '#3563ff', order: 0, parentId: null, tags: ['GitHub', '开源', '编程', '前端', '后端', 'API', '框架', '代码'] },
  { id: 'cat-design',  name: '设计',   icon: '🎨', color: '#ec4899', order: 1, parentId: null, tags: ['UI', 'UX', '图标', '配色', '素材', 'Figma', 'Sketch', '灵感'] },
  { id: 'cat-study',   name: '学习',   icon: '📚', color: '#10b981', order: 2, parentId: null, tags: ['教程', '课程', '文档', '百科', '考试', '笔记'] },
  { id: 'cat-tools',   name: '工具',   icon: '🛠️', color: '#f59e0b', order: 3, parentId: null, tags: ['在线工具', '转换', '生成器', '下载', '效率', '网盘'] },
  { id: 'cat-social',  name: '社交',   icon: '💬', color: '#06b6d4', order: 4, parentId: null, tags: ['社区', '论坛', '微博', 'Twitter', 'Discord', 'Telegram'] },
  { id: 'cat-news',    name: '新闻',   icon: '📰', color: '#ef4444', order: 5, parentId: null, tags: ['资讯', '头条', '日报', '科技', '财经'] },
  { id: 'cat-shop',    name: '购物',   icon: '🛒', color: '#8b5cf6', order: 6, parentId: null, tags: ['淘宝', '京东', '拼多多', '亚马逊', '优惠', '折扣'] },
  { id: 'cat-fun',     name: '娱乐',   icon: '🎮', color: '#f43f5e', order: 7, parentId: null, tags: ['游戏', '视频', '电影', '音乐', '动漫', '直播', '小说'] },
  { id: 'cat-other',   name: '其他',   icon: '📦', color: '#64748b', order: 8, parentId: null, tags: [] }
]

// ---- 业务存取 ----
export function loadBookmarks() {
  return readJSON(FILES.bookmarks, [])
}
export function saveBookmarks(list) {
  writeJSON(FILES.bookmarks, list)
}

export function loadCategories() {
  const cats = readJSON(FILES.categories, null)
  // 仅当分类文件不存在或格式非法时才使用默认分类；
  // 若文件存在但用户已清空/删除所有分类，则尊重用户选择，不再自动重建默认分类
  if (cats === null || !Array.isArray(cats)) return DEFAULT_CATEGORIES
  // 合并预设标签：如果旧分类没有 tags 字段，从默认值补充
  return cats.map((c) => {
    const def = DEFAULT_CATEGORIES.find((d) => d.id === c.id)
    return { ...c, tags: c.tags || (def ? def.tags : []) }
  })
}
export function saveCategories(cats) {
  writeJSON(FILES.categories, cats)
}

export function loadSettings() {
  const s = readJSON(FILES.settings, {})
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    defaultBrowser: { ...DEFAULT_SETTINGS.defaultBrowser, ...(s.defaultBrowser || {}) },
    geoip: { ...DEFAULT_SETTINGS.geoip, ...(s.geoip || {}) },
    autoValidate: { ...DEFAULT_SETTINGS.autoValidate, ...(s.autoValidate || {}) },
    proxy: { ...DEFAULT_SETTINGS.proxy, ...(s.proxy || {}) }
  }
}
export function saveSettings(settings) {
  // 确保 dataDir 被记录（用于下次启动恢复自定义目录）
  settings.dataDir = DATA_DIR
  writeJSON(FILES.settings, settings)
}

export function loadSnapshots() {
  return readJSON(FILES.snapshots, [])
}
export function saveSnapshots(list) {
  writeJSON(FILES.snapshots, list)
}
