# 书签管理器

一个纯本地运行、注重隐私与安全的桌面书签管理器（Windows）。基于 Electron + Vue 3 + Vite + Tailwind CSS。

## 功能

- **自动校验失效**：批量检测书签状态（正常 / 跳转 / 异常 / 失效），并发校验、可按状态筛选。
- **服务器位置与服务商**：离线为主（MaxMind GeoLite2，查询不出网）+ 在线兜底（ip-api）。显示国家/省/市、ISP、ASN。
- **悬停预览**：鼠标悬停 0.5 秒弹出预览（分享大图 + 标题 + 描述 + 状态 + 位置）。预览数据持久化到磁盘，不会立即清除。
- **一键加载所有预览**：批量抓取所有书签的元数据预览，顶部进度条。
- **预览缓存上限**：可配置缓存上限（MB），超限自动清理最久未访问的图片，保留文字元数据。
- **自动获取官网图标**：按 `<link icon>` → `/favicon.ico` → Google S2 优先级抓取，失败回退首字母方块。
- **修改书签**：编辑标题/URL/描述/分类/标签/备注；改 URL 后自动重抓图标与预览。
- **拖动分类**：把书签卡片拖到左侧分类即归类。
- **快速分类**：右键书签弹出分类网格，按数字键 1-9 快速归类。
- **自动分类**：域名规则库 + 关键词权重打分；手动分类过的书签默认受保护不被覆盖。
- **快照保存与恢复**：自动分类前自动保存全量快照；也可手动存档，随时一键恢复所有书签的分类状态。
- **导入 / 导出**：导入浏览器书签 HTML；导出为 **Chrome 可直接导入**的 Netscape 书签 HTML；JSON 备份导入/导出。
- **双击打开**：双击书签在浏览器打开，可在设置中配置默认浏览器（系统默认 / Chrome / Edge / Firefox / 自定义路径）。
- **账号密码存储**：使用 Windows DPAPI（`safeStorage`）加密，**密钥绑定当前 Windows 账户**，文件被拷走无法解密。
- **Cookie 捕获 / 查看**：打开登录窗口登录后一键捕获 Cookie，加密保存，表格查看/显示值/删除/清空。
- **优美界面**：浅色/深色/跟随系统主题，玻璃拟态卡片，启动闪屏 + 主窗淡入。

## 技术栈

| 层级 | 技术 |
|------|------|
| 渲染层框架 | Vue 3 + Vue Router + Pinia |
| 构建工具 | Vite 5 + @vitejs/plugin-vue |
| 桌面框架 | Electron 30 + electron-builder |
| UI 样式 | Tailwind CSS 3 + 玻璃拟态 |
| 加密方案 | Electron safeStorage (Windows DPAPI) |
| 离线定位 | MaxMind (maxmind + GeoLite2 mmdb) |

## 项目架构

### Electron 主进程 (`electron/main/`)

| 文件 | 职责 |
|------|------|
| `index.js` | 主入口、窗口管理、闪屏 |
| `ipc.js` | IPC 注册中心（50+ 通道） |
| `store.js` | JSON 存储（原子写入） |
| `crypto.js` | safeStorage 加密/解密封装 |
| `credentials.js` | 账号密码管理 |
| `cookies.js` | Cookie 捕获/存储 |
| `validator.js` | 书签失效检测（HEAD/GET 回退，并发限制） |
| `crawler.js` | 元数据爬虫 + 预览缓存 + LRU 清理 |
| `favicon.js` | 网站图标抓取（多策略 fallback） |
| `geoip.js` | GeoLite2 离线库 + ip-api 在线兜底 |
| `classifier.js` | 自动分类引擎（域名规则 + 关键词权重） |
| `snapshot.js` | 分类快照/恢复 |
| `browser.js` | 默认浏览器配置 + 浏览器探测 |
| `browserimport.js` | Netscape 书签 HTML 解析/导出 |
| `http.js` | 统一 HTTP 客户端（超时、限流、重定向控制） |

### Vue 渲染层 (`src/`)

| 文件 | 职责 |
|------|------|
| `App.vue` | 根组件、全局通知、进度条 |
| `main.js` / `router.js` | 入口、路由 |
| `stores/bookmarks.js` | 书签 store（筛选、统计、批量操作） |
| `stores/categories.js` | 分类 store（排序、增删改） |
| `stores/settings.js` | 设置 store（主题切换） |
| `stores/ui.js` | UI 缓存 store（favicon/preview dataUrl 缓存） |
| `components/Sidebar.vue` | 侧边栏（分类列表、拖拽目标） |
| `components/Toolbar.vue` | 工具栏（搜索、筛选、批量操作、导入导出） |
| `components/BookmarkCard.vue` | 书签卡片（状态点、图标、拖拽源、悬停触发） |
| `components/PreviewPopup.vue` | 悬停预览弹层 |
| `components/EditModal.vue` | 书签编辑弹窗 |
| `components/CategoryManager.vue` | 分类管理弹窗 |
| `components/SnapshotPanel.vue` | 快照列表/恢复 |
| `components/GeoInfoPanel.vue` | 服务器位置详情 |
| `components/CredentialPanel.vue` | 账号密码管理面板 |
| `components/CookiePanel.vue` | Cookie 管理面板 |
| `views/HomeView.vue` | 主视图（书签网格/列表、右键快速分类） |
| `views/SettingsView.vue` | 设置页（主题、浏览器、缓存、GeoIP、自动校验） |

## 开发

```bash
npm install
npm run dev        # 开发模式（热更新）
```

## 打包为 Windows 可执行文件

```bash
npm run build      # 生成安装包到 release/
npm run build:dir  # 仅生成免安装目录（调试用）
```

## GeoLite2 离线库（可选）

服务器定位默认走离线库，需要一次性下载：

1. 到 [MaxMind 官网](https://www.maxmind.com/en/geolite2/signup) 免费注册。
2. 下载 `GeoLite2-City.mmdb` 和 `GeoLite2-ASN.mmdb`。
3. 在「设置 → 服务器定位」中导入这两个文件。

未导入时会自动使用在线兜底（ip-api）；可在设置中关闭在线兜底以完全保护隐私。

## 数据存储

所有数据保存在本地用户数据目录 `%APPDATA%/bookmark-manager/`。

| 文件 | 内容 |
|------|------|
| `bookmarks.json` | 书签 |
| `categories.json` | 分类 |
| `settings.json` | 设置 |
| `snapshots.json` | 分类快照 |
| `credentials.enc` | 加密的账号密码 |
| `cookies.enc` | 加密的 Cookie |
| `previews/` | 预览元数据与图片 |
| `favicons/` | 网站图标 |

## 数据与隐私

- 所有数据保存在本地用户数据目录（设置页可一键打开）。
- 账号密码与 Cookie 使用 Windows DPAPI 加密，绑定当前账户。
- 无后端服务、无遥测。离线库查询不联网。
