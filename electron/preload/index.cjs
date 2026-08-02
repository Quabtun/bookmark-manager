const { contextBridge, ipcRenderer } = require('electron')

// IPC 通道白名单：仅允许渲染进程调用这些通道
const ALLOWED_CHANNELS = new Set([
  // 书签
  'bm:list', 'bm:save', 'bm:add', 'bm:update', 'bm:delete',
  'bm:removeDuplicates', 'bm:clearAll', 'bm:deleteBatch',
  'bm:reorder', 'bm:qrcode',
  // 锁屏
  'lock:check',
  // 分类
  'cat:list', 'cat:save',
  // favicon
  'favicon:fetch', 'favicon:path',
  // 校验
  'validate:one', 'validate:batch',
  // 预览
  'preview:generate', 'preview:get', 'preview:image',
  'preview:batch', 'preview:cacheSize', 'preview:enforceLimit',
  // GeoIP
  'geo:lookup', 'geo:ready',
  // WHOIS
  'whois:lookup', 'whois:ready',
  // 自动分类
  'classify:suggest', 'classify:suggestBatch', 'classify:apply',
  // 快照
  'snap:list', 'snap:create', 'snap:restore', 'snap:delete',
  // 浏览器
  'browser:open', 'browser:detect',
  // 导入导出
  'io:detectBrowsers', 'io:importFromBrowser', 'io:importHtml',
  'io:exportCategory', 'io:exportHtml', 'io:exportJson', 'io:importJson',
  'io:exportStyledHtml', 'io:importPocketCsv', 'io:importCsv', 'io:exportMarkdown',
  // 设置
  'settings:get', 'settings:save', 'proxy:detect',
  // 数据目录
  'dataDir:get', 'dataDir:pick', 'dataDir:set', 'dataDir:reset',
  // GeoIP mmdb 导入
  'geoip:importMmdb',
  // 凭证
  'cred:list', 'cred:add', 'cred:update', 'cred:delete', 'cred:reveal',
  // Cookie
  'cookie:openLogin', 'cookie:capture', 'cookie:list',
  'cookie:reveal', 'cookie:delete', 'cookie:clear',
  // 通用
  'app:openDataDir',
  // 自动备份
  'backup:create', 'backup:list', 'backup:start', 'backup:stop',
  // 多窗口预览
  'previewWindow:create', 'previewWindow:close', 'previewWindow:list',
  'previewWindow:closeAll', 'previewWindow:focus',
  // 插件系统
  'plugin:loadAll', 'plugin:unloadAll', 'plugin:list', 'plugin:scan',
  'plugin:load', 'plugin:unload', 'plugin:getSettings', 'plugin:getTab',
  // 版本更新
  'updater:check', 'updater:download', 'updater:install',
  'updater:cancel', 'updater:getState', 'updater:version',
  'updater:openReleases', 'updater:openWindow', 'updater:closeWindow'
])

// 允许监听的事件通道（主进程 → 渲染进程）
const ALLOWED_ON_CHANNELS = new Set([
  'bm:favicon-updated', 'validate:progress', 'preview:progress',
  'quickAdd', 'plugin:message',
  'updater:state-changed', 'updater:update-available', 'updater:update-not-available',
  'updater:progress', 'updater:download-complete', 'updater:error',
  'updater:close-requested'
])

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error('IPC channel not allowed: ' + channel))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel, cb) => {
    if (!ALLOWED_ON_CHANNELS.has(channel)) {
      console.warn('[preload] blocked listen on:', channel)
      return () => {}
    }
    const wrapped = (_e, payload) => cb(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
})
