const { contextBridge, ipcRenderer } = require('electron')

// 锁屏窗口专用 preload：仅暴露 lock:check 通道，禁止访问书签、凭证、Cookie 等敏感操作
// 防止锁屏窗口内联脚本绕过锁屏直接读取加密数据
contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (channel !== 'lock:check') {
      return Promise.reject(new Error('not allowed in lock screen'))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: () => () => {}
})
