const { contextBridge } = require('electron')

// 预览窗口的 preload：不暴露任何 IPC，仅用于 webview 加载
contextBridge.exposeInMainWorld('previewApi', {
  isPreviewWindow: true
})
