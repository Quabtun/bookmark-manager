import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const _windows = new Map() // id -> BrowserWindow

// 创建独立的预览窗口
export function createPreviewWindow(url, title) {
  const id = 'preview-' + Date.now()
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 400,
    minHeight: 300,
    title: title || url,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preview-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  win.loadURL(url)

  win.on('closed', () => {
    _windows.delete(id)
  })

  _windows.set(id, win)
  return { id, win }
}

// 关闭预览窗口
export function closePreviewWindow(id) {
  const win = _windows.get(id)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  _windows.delete(id)
}

// 获取所有预览窗口列表
export function listPreviewWindows() {
  const list = []
  for (const [id, win] of _windows) {
    if (!win.isDestroyed()) {
      list.push({
        id,
        title: win.getTitle(),
        url: win.webContents.getURL(),
        isFocused: win.isFocused()
      })
    } else {
      _windows.delete(id)
    }
  }
  return list
}

// 关闭所有预览窗口
export function closeAllPreviewWindows() {
  for (const [id, win] of _windows) {
    if (!win.isDestroyed()) win.close()
    _windows.delete(id)
  }
}

// 聚焦预览窗口
export function focusPreviewWindow(id) {
  const win = _windows.get(id)
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
}
