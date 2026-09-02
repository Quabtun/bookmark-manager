import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './store.js'

const PLUGINS_DIR_NAME = 'plugins'
const TRUSTED_PLUGIN_IDS = new Set()
const THIRD_PARTY_PLUGIN_DISABLED_REASON = '第三方插件已默认禁用，以防止未受信任代码访问本地数据或执行系统操作。'
const _plugins = new Map() // id -> { manifest, module, enabled, instance }

function getPluginsDir() {
  const dir = path.join(DATA_DIR, PLUGINS_DIR_NAME)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// 扫描并加载所有插件
export function scanPlugins() {
  const dir = getPluginsDir()
  const folders = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const pluginDir = path.join(dir, entry.name)
        const manifestPath = path.join(pluginDir, 'plugin.json')
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
            manifest._dir = pluginDir
            manifest._id = entry.name
            folders.push(manifest)
          } catch (e) {
            console.warn('[plugin] invalid manifest in', entry.name, e.message)
          }
        }
      }
    }
  } catch { /* ignore */ }
  return folders
}

// 创建插件 API sandbox
function createPluginApi(pluginId) {
  return {
    // 书签操作
    getBookmarks: () => {
      const { loadBookmarks } = require('./store.js')
      return loadBookmarks()
    },
    getCategories: () => {
      const { loadCategories } = require('./store.js')
      return loadCategories()
    },
    // 消息系统（插件间通信 / 插件→UI）
    send: (channel, data) => {
      const { send } = require('./ipc.js')
      send('plugin:message', { pluginId, channel, data })
    },
    // 存储（插件私有数据）
    store: {
      get(key, defaultVal) {
        try {
          const storePath = path.join(DATA_DIR, PLUGINS_DIR_NAME, pluginId, 'store.json')
          if (!fs.existsSync(storePath)) return defaultVal
          const data = JSON.parse(fs.readFileSync(storePath, 'utf8'))
          return data[key] !== undefined ? data[key] : defaultVal
        } catch { return defaultVal }
      },
      set(key, value) {
        try {
          const storeDir = path.join(DATA_DIR, PLUGINS_DIR_NAME, pluginId)
          const storePath = path.join(storeDir, 'store.json')
          if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true })
          let data = {}
          if (fs.existsSync(storePath)) data = JSON.parse(fs.readFileSync(storePath, 'utf8'))
          data[key] = value
          fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8')
        } catch (e) { console.error('[plugin] store error:', e.message) }
      },
      delete(key) {
        try {
          const storePath = path.join(DATA_DIR, PLUGINS_DIR_NAME, pluginId, 'store.json')
          if (!fs.existsSync(storePath)) return
          const data = JSON.parse(fs.readFileSync(storePath, 'utf8'))
          delete data[key]
          fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8')
        } catch { /* ignore */ }
      }
    },
    // 日志
    log: (...args) => console.log(`[plugin:${pluginId}]`, ...args),
    warn: (...args) => console.warn(`[plugin:${pluginId}]`, ...args),
    error: (...args) => console.error(`[plugin:${pluginId}]`, ...args)
  }
}

// 加载插件模块
export function loadPlugin(manifest) {
  const id = manifest._id
  const dir = manifest._dir

  // 检查是否已加载
  if (_plugins.has(id)) return _plugins.get(id)

  if (!TRUSTED_PLUGIN_IDS.has(id)) {
    console.warn('[plugin] third-party plugin blocked:', id)
    return null
  }

  // 查找入口文件
  const entry = manifest.main || 'index.js'
  const entryPath = path.join(dir, entry)

  if (!fs.existsSync(entryPath)) {
    console.warn('[plugin] entry not found:', entryPath)
    return null
  }

  try {
    const api = createPluginApi(id)
    const moduleExports = {}

    // 简单的插件加载：读取 JS 并执行，注入受限 api（不暴露 require，防止插件执行系统命令）
    const code = fs.readFileSync(entryPath, 'utf8')
    const fn = new Function('exports', 'api', code)
    fn(moduleExports, api)

    const plugin = {
      id,
      manifest: { ...manifest },
      module: moduleExports,
      enabled: true
    }

    // 调用插件的 activate 生命周期
    if (typeof moduleExports.activate === 'function') {
      try { moduleExports.activate(api) } catch (e) { console.error('[plugin] activate error:', e.message) }
    }

    _plugins.set(id, plugin)
    console.log('[plugin] loaded:', id, manifest.name || id)
    return plugin
  } catch (e) {
    console.error('[plugin] load error:', id, e.message)
    return null
  }
}

// 卸载插件
export function unloadPlugin(id) {
  const plugin = _plugins.get(id)
  if (plugin) {
    if (typeof plugin.module.deactivate === 'function') {
      try { plugin.module.deactivate() } catch (e) { console.error('[plugin] deactivate error:', e.message) }
    }
    _plugins.delete(id)
    console.log('[plugin] unloaded:', id)
  }
}

// 获取所有已加载插件
export function getLoadedPlugins() {
  const list = []
  for (const [id, plugin] of _plugins) {
    list.push({
      id,
      name: plugin.manifest.name || id,
      version: plugin.manifest.version || '0.0.0',
      description: plugin.manifest.description || '',
      enabled: plugin.enabled,
      hasSettings: typeof plugin.module.renderSettings === 'function',
      hasTab: typeof plugin.module.renderTab === 'function',
      hooks: plugin.manifest.hooks || []
    })
  }
  return list
}

export function getPluginStatus() {
  return scanPlugins().map((manifest) => ({
    id: manifest._id,
    name: manifest.name || manifest._id,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    icon: manifest.icon || '📦',
    enabled: TRUSTED_PLUGIN_IDS.has(manifest._id) && _plugins.has(manifest._id),
    blocked: !TRUSTED_PLUGIN_IDS.has(manifest._id),
    blockedReason: !TRUSTED_PLUGIN_IDS.has(manifest._id) ? THIRD_PARTY_PLUGIN_DISABLED_REASON : '',
    hasSettings: false,
    hasTab: false,
    hooks: manifest.hooks || [],
  }))
}

// 获取插件的设置面板 HTML
export function getPluginSettingsHtml(id) {
  const plugin = _plugins.get(id)
  if (!plugin || typeof plugin.module.renderSettings !== 'function') return null
  try {
    return plugin.module.renderSettings(createPluginApi(id))
  } catch (e) {
    return '<p style="color:red">插件设置渲染错误: ' + e.message + '</p>'
  }
}

// 获取插件的标签页 HTML
export function getPluginTabHtml(id) {
  const plugin = _plugins.get(id)
  if (!plugin || typeof plugin.module.renderTab !== 'function') return null
  try {
    return plugin.module.renderTab(createPluginApi(id))
  } catch (e) {
    return '<p style="color:red">插件标签页渲染错误: ' + e.message + '</p>'
  }
}

// 加载所有插件
export function loadAllPlugins() {
  const manifests = scanPlugins()
  const loaded = []
  for (const m of manifests) {
    const p = loadPlugin(m)
    if (p) loaded.push(p)
  }
  return loaded
}

// 卸载所有插件
export function unloadAllPlugins() {
  for (const [id] of _plugins) {
    unloadPlugin(id)
  }
}
