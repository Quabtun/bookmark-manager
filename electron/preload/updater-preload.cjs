const { contextBridge, ipcRenderer } = require('electron')

// 更新窗口专用 preload：仅暴露更新相关 IPC
const UPDATER_INVOKE_CHANNELS = new Set([
  'updater:check', 'updater:download', 'updater:install',
  'updater:cancel', 'updater:getState', 'updater:version',
  'updater:openReleases', 'updater:closeWindow'
])

const UPDATER_ON_CHANNELS = new Set([
  'updater:state-changed', 'updater:progress',
  'updater:download-complete', 'updater:error',
  'updater:install-progress'
])

contextBridge.exposeInMainWorld('updater', {
  invoke: (channel, ...args) => {
    if (!UPDATER_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error('Channel not allowed: ' + channel))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, cb) => {
    if (!UPDATER_ON_CHANNELS.has(channel)) {
      return () => {}
    }
    const wrapped = (_e, payload) => cb(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
})
