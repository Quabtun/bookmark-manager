import fs from 'node:fs'
import path from 'node:path'
import { loadBookmarks, loadCategories, loadSettings, DATA_DIR } from './store.js'

const BACKUP_DIR_NAME = 'backups'
let _timer = null
let _settings = null

function getBackupDir(customDir) {
  const dir = customDir || path.join(DATA_DIR, BACKUP_DIR_NAME)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getSettings() {
  if (!_settings) {
    try { _settings = loadSettings() } catch { _settings = {} }
  }
  return _settings
}

function createBackup(backupDir) {
  const dir = getBackupDir(backupDir)
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `bookmark-backup-${ts}.json`
  const filePath = path.join(dir, filename)

  const data = {
    version: 1,
    exportedAt: Date.now(),
    bookmarks: loadBookmarks(),
    categories: loadCategories(),
    settings: loadSettings()
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  console.log('[backup] created:', filePath)

  // 清理旧备份（保留最多 30 个）
  cleanOldBackups(dir, 30)

  return { path: filePath, filename }
}

function cleanOldBackups(dir, maxKeep) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('bookmark-backup-') && f.endsWith('.json'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)

    for (let i = maxKeep; i < files.length; i++) {
      fs.unlinkSync(path.join(dir, files[i].name))
      console.log('[backup] removed old:', files[i].name)
    }
  } catch { /* ignore */ }
}

export function startAutoBackup(intervalMinutes) {
  stopAutoBackup()
  const ms = (intervalMinutes || 60) * 60 * 1000
  _timer = setInterval(() => {
    const s = getSettings()
    if (s.backup?.enabled) {
      try {
        createBackup(s.backup.dir || null)
      } catch (e) {
        console.error('[backup] auto backup failed:', e.message)
      }
    }
  }, ms)
  console.log('[backup] auto timer started, interval:', intervalMinutes, 'min')
  // 立即执行一次
  const s = getSettings()
  if (s.backup?.enabled) {
    try { createBackup(s.backup.dir || null) } catch { /* ignore */ }
  }
}

export function stopAutoBackup() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

export function createBackupNow(customDir) {
  return createBackup(customDir)
}

export function listBackups(customDir) {
  const dir = getBackupDir(customDir)
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.startsWith('bookmark-backup-') && f.endsWith('.json'))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f))
        return {
          filename: f,
          path: path.join(dir, f),
          size: stat.size,
          createdAt: stat.mtime
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch { return [] }
}
