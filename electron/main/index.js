import { app, BrowserWindow, shell, nativeTheme, globalShortcut, session, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpc, getMainWindow, setMainWindow } from './ipc.js'
import { loadSettings, saveSettings, loadBookmarks, saveBookmarks, loadCategories, saveCategories } from './store.js'
import { loadAllPlugins, unloadAllPlugins } from './plugins.js'
import { createLockWindow, checkPassword } from './lockscreen.js'
import { initUpdater, isDownloading, isInstalling, isInstallDone } from './updater.js'
import { createUpdaterWindow, getUpdaterWindow, closeUpdaterWindow, registerUpdaterWindowIpc, focusUpdaterWindow } from './updater-window.js'

// 确保首次启动时数据文件存在
try {
  saveSettings(loadSettings())
  saveCategories(loadCategories())
  saveBookmarks(loadBookmarks())
} catch (e) { console.error('init save error:', e) }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 单实例锁
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // [FIX] 第二个实例尝试启动时，聚焦已有窗口
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

let mainWindow = null
let splashWindow = null

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    center: true,
    show: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 内联闪屏 HTML
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width:360px; height:240px; display:flex; flex-direction:column;
             align-items:center; justify-content:center;
             font-family:'Microsoft YaHei','Segoe UI',sans-serif;
             background:transparent; }
      .card { width:300px; padding:28px 24px; border-radius:18px;
              background:rgba(255,255,255,0.92); backdrop-filter:blur(20px);
              box-shadow:0 12px 40px -8px rgba(30,40,100,0.3);
              display:flex; flex-direction:column; align-items:center; gap:14px; }
      .logo { width:54px; height:54px; border-radius:14px;
              background:linear-gradient(135deg,#3563ff,#1e42f5);
              display:flex; align-items:center; justify-content:center;
              color:#fff; font-size:28px; box-shadow:0 6px 16px -4px rgba(53,99,255,0.6); }
      .title { font-size:16px; font-weight:600; color:#1e293b; }
      .bar { width:100%; height:4px; border-radius:2px; background:#e2e8f0; overflow:hidden; }
      .bar > i { display:block; width:40%; height:100%; border-radius:2px;
                 background:linear-gradient(90deg,#3563ff,#8eb4ff);
                 animation:slide 1.1s ease-in-out infinite; }
      @keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }
    </style></head><body>
      <div class="card">
        <div class="logo">★</div>
        <div class="title">书签管理器启动中…</div>
        <div class="bar"><i></i></div>
      </div>
    </body></html>
  `))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f8fafc',
    title: '书签管理器',
    autoHideMenuBar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  // 关键：将主窗口引用传给 IPC 模块，dialog 才能正确的作为父窗口的模态框出现
  setMainWindow(mainWindow)

  // 淡入显示
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
      }
      mainWindow.show()
    }, 350)
  })

  // 外链在系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  // 覆盖 CSP：允许 file:// 协议加载本地资源（修复打包后白屏）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "img-src 'self' data: https: file:; " +
          "style-src 'self' 'unsafe-inline'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' file:; " +
          "connect-src 'self' https: file:; " +
          "frame-src *;"
        ]
      }
    })
  })

  registerIpc()
  // 注册更新窗口 IPC
  registerUpdaterWindowIpc()
  // 初始化版本更新检查
  try { await initUpdater() } catch (e) { console.error('updater init error:', e) }
  // 应用主题
  try {
    const settings = loadSettings()
    if (settings.theme === 'dark') nativeTheme.themeSource = 'dark'
    else if (settings.theme === 'light') nativeTheme.themeSource = 'light'
    else nativeTheme.themeSource = 'system'

    // 检查是否启用锁定
    if (settings.lockEnabled && settings.lockPassword) {
      createSplash()
      await new Promise((r) => setTimeout(r, 200))
      const lockWin = createLockWindow(
        // onQuit
        () => { app.quit() }
      )
      // 监听 IPC lock:check 中的解锁事件
      const { ipcMain } = await import('electron')
      ipcMain.handle('lock:check', async (_e, input) => {
        const ok = checkPassword(input, settings.lockPassword)
        if (ok) {
          lockWin._unlocked = true
          setImmediate(() => {
            lockWin.close()
            createMainWindow()
            try { loadAllPlugins() } catch (e) { console.error('plugin load error:', e) }
          })
        }
        return { ok }
      })
      return // 不继续执行后续代码，等锁屏解锁后走回调
    }
  } catch (e) { /* 默认 */ }

  createSplash()
  // 预加载数据，让首屏更流畅
  await new Promise((r) => setTimeout(r, 200))
  createMainWindow()

  // 加载插件
  try { loadAllPlugins() } catch (e) { console.error('plugin load error:', e) }

  // 全局热键：快速添加书签 (Ctrl+Shift+N)
  const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+N'
  globalShortcut.register(QUICK_ADD_SHORTCUT, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('quickAdd')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// 防止下载中意外退出：拦截退出事件，提示用户
let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) return
  // 安装中：阻止退出（除非安装已完成）
  if (isInstalling() && !isInstallDone()) {
    e.preventDefault()
    return
  }
  // 如果正在下载更新，阻止退出并聚焦更新窗口
  if (isDownloading()) {
    e.preventDefault()
    isQuitting = true
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: '更新下载进行中',
      message: '正在下载更新，退出将中断下载。',
      buttons: ['后台继续下载', '仍然退出'],
      defaultId: 0,
      cancelId: 0
    })
    isQuitting = false
    if (choice === 0) {
      // 聚焦或打开更新窗口
      const win = getUpdaterWindow()
      if (win && !win.isDestroyed()) {
        focusUpdaterWindow()
      } else {
        createUpdaterWindow(false)
      }
    } else {
      // 用户选择退出，强制退出
      app.exit(0)
    }
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  // 确保更新窗口被清理
  closeUpdaterWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { getMainWindow }
