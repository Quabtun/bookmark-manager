# 书签管理器 - 全面代码审计报告

> 审计日期: 2026-08-01
> 审计范围: Electron + Vue 3 书签管理器应用
> 审计文件数: 35+ 文件 (src/stores, src/components, src/views, electron/main, electron/preload)

---

## 审计摘要

| 严重程度 | 数量 |
|---------|------|
| Critical | 4 |
| High | 8 |
| Medium | 10 |
| Low | 9 |
| **合计** | **31** |

---

## CRITICAL (严重)

### C-1. XSS 漏洞: v-html 渲染未转义的书签标题

- **文件**: `src/views/HomeView.vue`
- **行号**: 432, 1054
- **问题描述**: Spotlight 搜索结果使用 `v-html="item._highlight"` 渲染高亮标题。`_highlight` 通过 `replace(re, '<span class="text-accent font-semibold">$1</span>')` 生成,但书签标题来自用户输入或网页抓取,**未进行 HTML 转义**。恶意标题如 `<img src=x onerror=alert(document.cookie)>` 将直接执行任意 JavaScript 代码。
- **影响**: 渲染进程中的任意代码执行,可窃取加密凭证、Cookie 等敏感数据。
- **建议修复**:
  ```js
  // 先转义 HTML,再做高亮替换
  const escapeHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const escaped = escapeHtml(b.title || '')
  const highlight = escaped.replace(re, '<span class="text-accent font-semibold">$1</span>')
  ```

### C-2. 插件系统允许任意代码执行

- **文件**: `electron/main/plugins.js`
- **行号**: 117
- **问题描述**: 插件加载使用 `new Function('exports', 'api', 'require', code)` 执行任意 JavaScript 代码,且将 `require` 函数直接暴露给插件。任何插件都可以 `require('child_process').exec('任意命令')`,在主进程中执行任意系统命令。
- **影响**: 恶意插件可完全控制系统,执行任意命令,读写任意文件。
- **建议修复**:
  - 移除对 `require` 的暴露,改用受限的 API sandbox
  - 或使用 Worker 线程 / vm2 沙箱隔离插件代码
  - 至少应禁止 require,仅允许通过 `api` 对象暴露的受控接口操作

### C-3. CSP 配置过于宽松

- **文件**: `electron/main/index.js`
- **行号**: 131-145
- **问题描述**: Content-Security-Policy 包含 `'unsafe-eval'`、`'unsafe-inline'`、`file:`(script-src) 和 `frame-src *`,等于形同虚设。结合 C-1 的 XSS 漏洞,攻击者可在渲染进程中执行任意代码。`frame-src *` 允许嵌入任意外部页面。
- **影响**: 降低了 XSS 攻击的门槛,使渲染进程 RCE 成为可能。
- **建议修复**:
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https:;
  frame-src 'self';
  ```
  移除 `'unsafe-eval'`、`file:` 和 `frame-src *`。

### C-4. io:importFromBrowser 允许读取任意文件

- **文件**: `electron/main/ipc.js`
- **行号**: 357-358
- **问题描述**: `io:importFromBrowser` 处理器接收 `browserPath` 参数并直接调用 `parseBrowserBookmarks(browserPath)`,后者使用 `fs.readFileSync(filePath, 'utf8')` 读取文件。**没有验证路径是否为合法的浏览器书签文件路径**。被 compromise 的渲染进程可传入任意路径,读取系统上的任意文件内容。
- **影响**: 任意文件读取,可泄露系统敏感文件(如 SSH 密钥、配置文件)。
- **建议修复**:
  ```js
  safeHandle('io:importFromBrowser', async (_e, browserPath) => {
    // 仅允许读取通过 detectBrowserBookmarks 检测到的路径
    const detected = detectBrowserBookmarks()
    const isAllowed = detected.some(b => b.path === browserPath)
    if (!isAllowed) return { error: '非法的书签文件路径' }
    // ... 继续处理
  })
  ```

---

## HIGH (高危)

### H-1. 加密降级为不安全的 Base64 编码

- **文件**: `electron/main/crypto.js`
- **行号**: 14-16
- **问题描述**: 当 `safeStorage.isEncryptionAvailable()` 返回 `false` 时,加密退化为 `Buffer.from(plain, 'utf8').toString('base64')`。Base64 是编码而非加密,可被轻松解码。凭证和 Cookie 文件实际上以明文形式存储。
- **影响**: 在 safeStorage 不可用的环境中(如某些 Linux 环境),所有凭证和 Cookie 以明文存储。
- **建议修复**:
  ```js
  function encrypt(plain) {
    if (!isEncryptionAvailable()) {
      // 不应降级,而应拒绝存储敏感数据
      throw new Error('当前环境不支持加密存储,无法保存凭证')
    }
    const buf = safeStorage.encryptString(plain)
    return { enc: buf.toString('base64'), avail: true }
  }
  ```

### H-2. IPC 通道缺乏输入验证

- **文件**: `electron/main/ipc.js`
- **行号**: 68, 112, 326, 722, 731
- **问题描述**: 多个 IPC 处理器未验证输入参数:
  - `bm:add` (L68): 未验证 URL 格式,可添加 `javascript:` 或 `file:` 协议 URL
  - `bm:update` (L112): `patch` 对象无白名单校验,可覆盖任意字段(如 `id`、`createdAt`)
  - `browser:open` (L326): 未验证 URL,可打开 `file:` 或其他危险协议
  - `cred:add` (L722): 未验证 `host` 参数格式
  - `cookie:openLogin` (L731): 未验证 URL,可在登录窗口中加载任意 URL
- **影响**: 数据完整性破坏、协议注入、潜在的安全绕过。
- **建议修复**:
  ```js
  // URL 验证函数
  function isValidHttpUrl(str) {
    try {
      const u = new URL(str)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch { return false }
  }

  // bm:update 字段白名单
  const ALLOWED_PATCH_FIELDS = new Set([
    'url', 'title', 'description', 'categoryId', 'manualCategoryId',
    'manualSet', 'tags', 'notes', 'favicon', 'status', 'statusCheckedAt',
    'geo', 'whois', 'pinned', 'archived', 'recycled', 'recycledAt',
    'readStatus', 'openCount', 'lastOpenedAt', 'order', 'previewHash',
    'autoCategorySuggested', '_isManual'
  ])
  function sanitizePatch(patch) {
    const clean = {}
    for (const k of Object.keys(patch)) {
      if (ALLOWED_PATCH_FIELDS.has(k)) clean[k] = patch[k]
    }
    return clean
  }
  ```

### H-3. TLS 证书验证被禁用

- **文件**: `electron/main/http.js`
- **行号**: 54
- **问题描述**: HTTPS 请求中 `rejectUnauthorized: false` 禁用了证书验证。所有通过 `directRequest` 发起的 HTTPS 请求都容易受到中间人(MITM)攻击。
- **影响**: URL 校验、favicon 抓取、预览生成等功能的网络流量可被劫持。
- **建议修复**:
  ```js
  // 移除 rejectUnauthorized: false,或仅在显式调试模式下启用
  const req = lib.request(u, { method, headers: reqHeaders, timeout }, (res) => {
  ```

### H-4. Webview 沙箱配置过于宽松

- **文件**: `src/components/WebPreview.vue`
- **行号**: 26
- **问题描述**: webview 的 sandbox 属性为 `allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation`。`allow-same-origin` + `allow-scripts` 的组合使加载的网页可以访问 Electron 应用的资源(如通过同源策略访问 file:// 资源)。
- **影响**: 在预览面板中加载的恶意网页可能访问应用本地资源。
- **建议修复**: 移除 `allow-same-origin`,或使用 `<iframe>` + CSP 替代 webview:
  ```html
  sandbox="allow-scripts allow-forms allow-popups"
  ```

### H-5. 锁屏密码比较非恒定时间

- **文件**: `electron/main/lockscreen.js`
- **行号**: 35
- **问题描述**: `inputHash === parsed.hash` 使用普通字符串比较,不是恒定时间比较。理论上可通过时间侧信道攻击逐字节推断密码哈希。
- **影响**: 虽然在本地环境中利用难度较高,但不符合安全最佳实践。
- **建议修复**:
  ```js
  import crypto from 'node:crypto'
  // 使用 crypto.timingSafeEqual 进行恒定时间比较
  export function checkPassword(input, storedLockPassword) {
    const parsed = parseStored(storedLockPassword)
    if (!parsed) return false
    const inputHash = deriveHash(input, parsed.salt)
    const a = Buffer.from(inputHash, 'hex')
    const b = Buffer.from(parsed.hash, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }
  ```

### H-6. 锁屏窗口拥有完整 IPC 权限

- **文件**: `electron/main/lockscreen.js`
- **行号**: 56-61
- **问题描述**: 锁屏窗口使用与主窗口相同的 preload (`../preload/index.cjs`),拥有完整的 IPC 通道访问权限,包括 `cred:list`、`cred:reveal`、`cookie:reveal` 等敏感操作。锁屏窗口中内联的 JavaScript 代码可直接调用这些 IPC 通道绕过锁屏。
- **影响**: 锁屏机制可被绕过,直接访问加密凭证。
- **建议修复**: 为锁屏窗口创建专用 preload,仅暴露 `lock:check` 通道:
  ```js
  // electron/preload/lock-preload.cjs
  const { contextBridge, ipcRenderer } = require('electron')
  contextBridge.exposeInMainWorld('api', {
    invoke: (channel, ...args) => {
      if (channel === 'lock:check') return ipcRenderer.invoke(channel, ...args)
      return Promise.reject(new Error('not allowed'))
    }
  })
  ```

### H-7. 二维码生成泄露 URL 到第三方服务

- **文件**: `electron/main/ipc.js`
- **行号**: 175-187
- **问题描述**: 二维码生成通过 `https://quickchart.io/qr?text=...` 调用外部 API,将书签 URL 明文发送到第三方服务器。
- **影响**: 用户的书签 URL 被泄露给第三方。
- **建议修复**: 使用本地 QR 码生成库(如 `qrcode` npm 包),不依赖外部 API。

### H-8. Favicon 和 GeoIP 在线兜底泄露隐私

- **文件**: `electron/main/favicon.js` (行号 64), `electron/main/geoip.js` (行号 55)
- **问题描述**:
  - Favicon 抓取失败时回退到 `https://www.google.com/s2/favicons?domain=...`,将所有书签域名泄露给 Google。
  - GeoIP 离线库未命中时回退到 `http://ip-api.com/json/...`,将 IP 地址泄露给第三方,且使用明文 HTTP。
- **影响**: 用户的浏览目标和书签列表被泄露给第三方服务。
- **建议修复**: 将在线兜底设为默认关闭,或至少让用户明确知情同意。GeoIP 的 HTTP 请求应改为 HTTPS。

---

## MEDIUM (中等)

### M-1. 异步操作未处理 Promise rejection

- **文件**: `src/stores/bookmarks.js`
- **行号**: 90-97, 99-106, 127-134, 377-381
- **问题描述**: `archive()`、`unarchive()`、`recordOpen()`、`togglePin()` 等 async 函数中的 `await window.api.invoke(...)` 调用没有 try-catch 包裹。如果 IPC 调用失败(reject),会产生未处理的 Promise rejection,且 UI 状态已先于 IPC 更新,导致数据不一致。
- **影响**: IPC 失败时 UI 与实际数据不同步,可能显示已归档但实际未归档。
- **建议修复**:
  ```js
  async function archive(id) {
    const i = bookmarks.value.findIndex(b => b.id === id)
    if (i === -1) return
    try {
      const updated = await window.api.invoke('bm:update', id, { archived: true })
      if (updated && !updated.error) {
        bookmarks.value[i] = { ...bookmarks.value[i], archived: true }
        pushUndo({ type: 'update', bookmarkId: id, data: { archived: false } })
      } else {
        window.$toast && window.$toast('归档失败', 'error')
      }
    } catch (e) {
      window.$toast && window.$toast('归档失败: ' + (e.message || ''), 'error')
    }
  }
  ```

### M-2. 深度 watch 整个 bookmarks 数组

- **文件**: `src/stores/bookmarks.js`
- **行号**: 41-44
- **问题描述**: `watch(bookmarks, ..., { deep: true })` 深度监听整个 bookmarks 数组。每次任何书签的任何字段变化都会触发回调,对 `recycledCount` 和 `archivedCount` 重新计算。当书签数量达到数千时,这会造成显著性能开销。
- **影响**: 大数据量下的性能瓶颈。
- **建议修复**: 使用 computed 代替 deep watch:
  ```js
  const recycledCount = computed(() => bookmarks.value.filter(b => b.recycled === true).length)
  const archivedCount = computed(() => bookmarks.value.filter(b => b.archived === true).length)
  ```

### M-3. UI Store 缓存无上限增长

- **文件**: `src/stores/ui.js`
- **行号**: 6-7
- **问题描述**: `faviconCache` 和 `previewCache` 使用 Map 存储,没有 LRU 淘汰策略或大小限制。长时间使用后,内存占用会持续增长,尤其是 previewCache 中存储的 data URL 可能很大。
- **影响**: 内存泄漏风险,长时间运行后内存占用过高。
- **建议修复**: 实现简单的 LRU 缓存,限制最大条目数:
  ```js
  const MAX_CACHE_SIZE = 500
  function setWithLimit(map, key, value) {
    if (map.size >= MAX_CACHE_SIZE) {
      const firstKey = map.keys().next().value
      map.delete(firstKey)
    }
    map.set(key, value)
  }
  ```

### M-4. BookmarkCard 挂载时自动触发 GeoIP 查询

- **文件**: `src/components/BookmarkCard.vue`
- **行号**: 129-136
- **问题描述**: `autoGeoLookup()` 在组件创建时立即执行,每个 BookmarkCard 实例都会触发一次 `geo:lookup` IPC 调用。每页 60 个书签意味着同时发起 60 次网络请求(DNS 解析 + HTTP 请求),造成网络拥塞和主进程负载高峰。
- **影响**: 页面加载时的网络请求风暴,可能导致超时和资源浪费。
- **建议修复**: 改为延迟加载(如用户悬停时)或使用批量查询接口:
  ```js
  // 仅在用户首次悬停时查询
  let geoQueried = false
  async function ensureGeoLookup() {
    if (props.bm.geo || geoQueried) return
    geoQueried = true
    // ... 查询逻辑
  }
  ```

### M-5. emptyRecycleBin 逐条删除效率低

- **文件**: `src/stores/bookmarks.js`
- **行号**: 337-346
- **问题描述**: `emptyRecycleBin()` 对每个回收站书签单独调用 `bm:delete` IPC,产生 N 次 IPC 往返。已有 `bm:deleteBatch` 批量删除接口但未使用。
- **影响**: 回收站中有大量书签时,清空操作非常慢。
- **建议修复**:
  ```js
  async function emptyRecycleBin() {
    const recycledIds = bookmarks.value.filter(b => b.recycled === true).map(b => b.id)
    await window.api.invoke('bm:deleteBatch', recycledIds)
    const idSet = new Set(recycledIds)
    bookmarks.value = bookmarks.value.filter(b => !idSet.has(b.id))
    undoStack.value = undoStack.value.filter(a => !idSet.has(a.bookmarkId))
  }
  ```

### M-6. SOCKS5 代理忽略认证配置

- **文件**: `electron/main/http.js`
- **行号**: 152-154
- **问题描述**: SOCKS5 代理实现始终发送 `0x00`(无认证)握手,即使配置了 `proxy.username` 和 `proxy.password`。需要认证的 SOCKS5 代理将无法使用。
- **影响**: 配置了认证的 SOCKS5 代理无法正常工作。
- **建议修复**: 实现 SOCKS5 用户名/密码认证(RFC 1929):
  ```js
  socket.on('connect', () => {
    if (proxy.username) {
      // 发送用户名/密码认证方法 (0x02)
      socket.write(Buffer.from([0x05, 0x01, 0x02]))
    } else {
      socket.write(Buffer.from([0x05, 0x01, 0x00]))
    }
  })
  // 在 onData 中处理认证阶段
  ```

### M-7. 文件写入非原子操作(Windows 回退)

- **文件**: `electron/main/store.js`
- **行号**: 65-78
- **问题描述**: `writeFileAtomic` 在 rename 失败时回退到 `copyFileSync` + `unlinkSync`,这不是原子操作。如果进程在 copy 过程中崩溃,目标文件可能处于部分写入状态。
- **影响**: 极端情况下数据文件可能损坏。
- **建议修复**: 使用 `fs.writeFileSync(filePath + '.new', content)` + rename 的方式,确保旧文件在写入完成前不被破坏。Windows 上可使用 `fs.renameSync` 配合重试机制。

### M-8. backup.js 缓存设置不刷新

- **文件**: `electron/main/backup.js`
- **行号**: 7, 15-20
- **问题描述**: `_settings` 在模块级别缓存,只在首次调用 `getSettings()` 时加载,之后永不刷新。如果用户在设置中更改了备份目录或间隔,备份模块仍使用旧的缓存设置。
- **影响**: 备份设置变更后不生效,可能备份到错误目录或以错误间隔执行。
- **建议修复**: 每次执行备份时重新加载设置:
  ```js
  function getSettings() {
    try { return loadSettings() } catch { return {} }
  }
  ```

### M-9. recycledAt 时间戳格式不一致

- **文件**: `src/stores/bookmarks.js`
- **行号**: 321, 389
- **问题描述**: `softDelete()` 和 `removeBatch()` 中 `recycledAt` 使用 `new Date().toISOString()`(字符串),而 `addedAt`、`createdAt`、`lastOpenedAt` 等使用 `Date.now()`(数值)。时间戳格式不一致可能导致排序或显示异常。
- **影响**: 数据一致性问题,可能在按时间排序或显示时出现异常。
- **建议修复**: 统一使用数值时间戳:
  ```js
  recycledAt: Date.now()  // 替代 new Date().toISOString()
  ```

### M-10. send 函数广播到所有窗口

- **文件**: `electron/main/ipc.js`
- **行号**: 836-841
- **问题描述**: `send()` 函数遍历 `BrowserWindow.getAllWindows()` 向所有窗口发送事件,包括锁屏窗口、闪屏窗口和预览窗口。这些窗口可能不需要也不应该接收书签更新事件。
- **影响**: 不必要的事件广播,可能引发意外行为(如锁屏窗口接收到书签数据)。
- **建议修复**: 仅向主窗口发送:
  ```js
  function send(channel, payload) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      try { win.webContents.send(channel, payload) } catch { /* ignore */ }
    }
  }
  ```

---

## LOW (低)

### L-1. 重复的 decodeEntities 函数

- **文件**: `electron/main/browserimport.js` (行号 8), `electron/main/crawler.js` (行号 74)
- **问题描述**: `decodeEntities` 函数在两个文件中完全重复定义。
- **建议修复**: 提取到共享工具模块(如 `utils.js`)中,统一引用。

### L-2. 重复的 CSV 行解析函数

- **文件**: `electron/main/browserimport.js`
- **行号**: 143 (`parseCsv` 内的 `parseLine`), 543 (`parseCsvLine`)
- **问题描述**: 两个功能完全相同的 CSV 行解析函数,只是一个在 `parseCsv` 内部,一个独立定义。
- **建议修复**: 统一使用 `parseCsvLine` 函数。

### L-3. Settings store 每次加载都写入磁盘

- **文件**: `src/stores/settings.js`
- **行号**: 39-40
- **问题描述**: `load()` 方法在加载设置后立即调用 `settings:save` 将设置写回磁盘。这在每次应用启动时产生一次不必要的磁盘写入。
- **建议修复**: 仅在设置实际变更时写入:
  ```js
  async function load() {
    settings.value = await window.api.invoke('settings:get')
    loaded.value = true
    applyTheme()
    return settings.value  // 移除 settings:save 调用
  }
  ```

### L-4. archive/unarchive 中未使用的 snapshot 变量

- **文件**: `src/stores/bookmarks.js`
- **行号**: 93, 102
- **问题描述**: `archive()` 和 `unarchive()` 中创建 `const snapshot = JSON.parse(JSON.stringify(bookmarks.value[i]))` 但从未使用,浪费内存和 CPU。
- **建议修复**: 删除未使用的 `snapshot` 变量。

### L-5. BookmarkCard favicon 更新事件监听失效

- **文件**: `src/components/BookmarkCard.vue`
- **行号**: 271-279
- **问题描述**: 组件监听 `window.addEventListener('favicon-updated', onFaviconUpdated)`,但 IPC 通过 `w.webContents.send('bm:favicon-updated', ...)` 发送事件,这触发的是 preload 中的 `ipcRenderer.on` 回调,不是 DOM 自定义事件。除非有其他代码将 IPC 事件桥接为 DOM 事件,否则此监听器是死代码。
- **建议修复**: 使用 `window.api.on` 监听 IPC 事件:
  ```js
  let removeListener = null
  onMounted(() => {
    removeListener = window.api.on('bm:favicon-updated', (payload) => {
      if (payload.id === props.bm.id) {
        ui.clearFavicon(payload.favicon)
        loadFavicon()
      }
    })
  })
  onUnmounted(() => { removeListener && removeListener() })
  ```

### L-6. window.__dragBookmarkId 全局变量

- **文件**: `src/components/BookmarkCard.vue`
- **行号**: 140, 159, 166
- **问题描述**: 使用 `window.__dragBookmarkId` 全局变量传递拖拽的书签 ID。全局变量容易被其他代码意外覆盖,且不利于维护。
- **建议修复**: 使用 Vue 的 provide/inject 或 Pinia store 管理拖拽状态。

### L-7. 导入去重逻辑重复

- **文件**: `electron/main/ipc.js`
- **行号**: 437-463 (importHtml), 486-514 (importCsv), 615-643 (importPocketCsv)
- **问题描述**: 三个导入处理器中的去重逻辑(构建 `existing` Set + 检查重复 URL + 创建书签对象)几乎完全相同,存在大量重复代码。
- **建议修复**: 提取通用的导入处理函数:
  ```js
  function mergeBookmarks(parsed, list) {
    const existing = new Set(list.map(b => b.url.toLowerCase().trim()))
    let added = 0, skipped = 0
    for (const p of parsed) {
      const url = (p.url || '').toLowerCase().trim()
      if (!url || existing.has(url)) { skipped++; continue }
      existing.add(url)
      const suggested = suggestCategory({ url: p.url, title: p.title })
      list.push({ /* ... */ })
      added++
    }
    return { added, skipped }
  }
  ```

### L-8. HTTP 代理请求不支持重定向

- **文件**: `electron/main/http.js`
- **行号**: 84-137
- **问题描述**: `httpProxyRequest` 函数不像 `directRequest` 那样处理 HTTP 重定向(301/302/307/308)。通过 HTTP 代理访问的 URL 如果返回重定向,将直接返回重定向响应而非跟随。
- **建议修复**: 在代理请求的响应处理中添加重定向跟随逻辑,与 `directRequest` 保持一致。

### L-9. 缺少全局 unhandledRejection 处理

- **文件**: `electron/main/index.js`
- **问题描述**: 主进程没有注册 `process.on('unhandledRejection', ...)` 和 `process.on('uncaughtException', ...)` 处理器。未捕获的异常会导致应用直接崩溃,没有错误日志或用户提示。
- **建议修复**:
  ```js
  process.on('unhandledRejection', (reason) => {
    console.error('[main] Unhandled Rejection:', reason)
  })
  process.on('uncaughtException', (err) => {
    console.error('[main] Uncaught Exception:', err)
    // 可选: 显示错误对话框后退出
    dialog.showErrorBox('应用错误', err.message || '未知错误')
    app.quit()
  })
  ```

---

## 架构建议

1. **IPC 输入验证层**: 建议创建统一的 IPC 验证中间件,在 `safeHandle` 之上封装参数验证逻辑,避免每个处理器重复编写验证代码。

2. **插件安全模型**: 当前插件系统等同于直接执行任意代码,建议参考 VS Code 的扩展模型,使用进程隔离 + 受控 API 的方式运行插件。

3. **数据持久化策略**: 当前每次修改都立即写盘(`saveBookmarks` 在每次 `bm:update`、`bm:add`、`bm:delete` 时调用),大数据量下磁盘 I/O 频繁。建议引入防抖/批量写入机制。

4. **时间戳规范**: 统一所有时间戳为数值类型(`Date.now()`),避免 ISO 字符串和数值混用。

5. **网络隐私**: 所有在线兜底功能(favicon、geoip、whois、qr 码)应默认关闭,在设置中让用户明确知情同意后开启。
