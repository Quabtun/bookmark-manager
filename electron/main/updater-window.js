import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkForUpdates, startDownload, installUpdate, cancelDownload, getState, isDownloading } from './updater.js'

let updaterWindow = null

// ============================================================
// 独立更新窗口的 HTML（内联，不依赖 Vue 打包产物）
// ============================================================
function getUpdaterHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>检查更新</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* ---- 浅色主题变量 ---- */
  :root {
    --bg: #f0f4f8;
    --bg-gradient: linear-gradient(160deg, #f0f4f8 0%, #e8eef5 50%, #eef4ff 100%);
    --card-bg: #ffffff;
    --card-hover: #fafbfc;
    --text: #1e293b;
    --text-muted: #64748b;
    --accent: #3563ff;
    --accent-hover: #1e42f5;
    --accent-light: #eef4ff;
    --accent-glow: rgba(53,99,255,0.15);
    --border: #e2e8f0;
    --border-hover: #cbd5e1;
    --success: #10b981;
    --success-hover: #059669;
    --warn: #f59e0b;
    --error: #ef4444;
    --error-bg: #fef2f2;
    --radius: 14px;
    --radius-sm: 10px;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 16px -4px rgba(0,0,0,0.1);
    --shadow-accent: 0 4px 12px -2px rgba(53,99,255,0.35);
    --scrollbar: #cbd5e1;
    --scrollbar-hover: #94a3b8;
    --code-bg: #f1f5f9;
    --notes-bg: #f8fafc;
  }

  /* ---- 深色主题变量 ---- */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --bg-gradient: linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #1a1f3a 100%);
      --card-bg: #1e293b;
      --card-hover: #243044;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #598bff;
      --accent-hover: #3563ff;
      --accent-light: #1e2a4a;
      --accent-glow: rgba(89,139,255,0.2);
      --border: #334155;
      --border-hover: #475569;
      --success: #34d399;
      --success-hover: #10b981;
      --error: #f87171;
      --error-bg: #450a0a;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --shadow-md: 0 4px 16px -4px rgba(0,0,0,0.4);
      --shadow-accent: 0 4px 12px -2px rgba(89,139,255,0.3);
      --scrollbar: #475569;
      --scrollbar-hover: #64748b;
      --code-bg: #0f172a;
      --notes-bg: #0d1421;
    }
  }

  body {
    font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
    background: var(--bg-gradient);
    background-attachment: fixed;
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    user-select: none;
    transition: background 0.3s ease;
  }

  /* ---- 标题栏 ---- */
  .titlebar {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
    transition: background 0.3s ease, border-color 0.3s ease;
  }
  .titlebar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .titlebar-close {
    -webkit-app-region: no-drag;
    width: 28px; height: 28px;
    border: none; background: transparent;
    border-radius: 6px; cursor: pointer;
    font-size: 18px; color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease;
  }
  .titlebar-close:hover {
    background: var(--error-bg);
    color: var(--error);
    transform: scale(1.1);
  }
  .titlebar-close:active { transform: scale(0.95); }

  /* ---- 主内容 ---- */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .content::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }

  /* ---- 版本信息卡片 ---- */
  .version-card {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 20px;
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: var(--shadow-sm);
    transition: all 0.25s ease;
  }
  .version-card:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-hover);
  }
  .app-icon {
    width: 52px; height: 52px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; color: #fff;
    box-shadow: var(--shadow-accent);
    flex-shrink: 0;
    transition: transform 0.25s ease;
  }
  .version-card:hover .app-icon { transform: scale(1.05); }
  .version-info { flex: 1; min-width: 0; }
  .version-info h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .version-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .version-badge {
    font-size: 12px; font-weight: 500;
    padding: 2px 8px; border-radius: 6px;
    background: var(--code-bg); color: var(--text-muted);
    font-family: 'Consolas', monospace;
    transition: background 0.3s ease;
  }
  .version-badge.new {
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 600;
  }
  .version-arrow { color: var(--text-muted); font-size: 14px; }
  .build-mode {
    font-size: 10px; padding: 1px 6px; border-radius: 4px;
    background: var(--code-bg); color: var(--text-muted);
  }

  /* ---- 状态区域 ---- */
  .status-area {
    background: var(--card-bg);
    border-radius: var(--radius);
    padding: 20px;
    border: 1px solid var(--border);
    min-height: 120px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: var(--shadow-sm);
    transition: all 0.25s ease;
    animation: fadeInUp 0.3s ease;
  }
  .status-area:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-hover);
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ---- 状态提示 ---- */
  .status-msg {
    display: flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 500;
    animation: fadeIn 0.25s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .status-msg.checking { color: var(--accent); }
  .status-msg.available { color: var(--accent); }
  .status-msg.downloading { color: var(--accent); }
  .status-msg.downloaded { color: var(--success); }
  .status-msg.not-available { color: var(--success); }
  .status-msg.error { color: var(--error); }
  .status-msg.installing { color: var(--accent); }
  .status-msg.delta-downloading { color: var(--accent); }
  .status-msg.delta-applying { color: var(--accent); }

  .spinner {
    width: 18px; height: 18px;
    border: 2.5px solid var(--accent-light);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ---- 更新日志（Markdown 渲染） ---- */
  .release-notes {
    background: var(--notes-bg);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-muted);
    max-height: 200px;
    overflow-y: auto;
    word-break: break-word;
    border: 1px solid var(--border);
    transition: background 0.3s ease, border-color 0.3s ease;
  }
  .release-notes::-webkit-scrollbar { width: 5px; }
  .release-notes::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .release-notes::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }
  .release-notes h1, .release-notes h2, .release-notes h3 {
    color: var(--text); font-weight: 600; margin: 8px 0 4px;
  }
  .release-notes h1 { font-size: 15px; }
  .release-notes h2 { font-size: 14px; }
  .release-notes h3 { font-size: 13px; }
  .release-notes ul, .release-notes ol { padding-left: 18px; margin: 4px 0; }
  .release-notes li { margin: 2px 0; }
  .release-notes code {
    background: var(--code-bg); padding: 1px 5px;
    border-radius: 4px; font-family: 'Consolas', monospace;
    font-size: 11px; color: var(--accent);
  }
  .release-notes pre {
    background: var(--code-bg); padding: 8px 10px;
    border-radius: 6px; overflow-x: auto;
    margin: 6px 0; border: 1px solid var(--border);
  }
  .release-notes pre code {
    background: none; padding: 0; color: var(--text-muted);
    font-size: 11px;
  }
  .release-notes a { color: var(--accent); text-decoration: none; }
  .release-notes a:hover { text-decoration: underline; }
  .release-notes strong { color: var(--text); font-weight: 600; }
  .release-notes p { margin: 4px 0; }
  .release-notes hr { border: none; border-top: 1px solid var(--border); margin: 8px 0; }

  /* ---- 下载进度 ---- */
  .progress-area { display: flex; flex-direction: column; gap: 8px; }
  .progress-header {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; color: var(--text-muted);
  }
  .progress-percent {
    font-size: 18px; font-weight: 700; color: var(--accent);
    font-family: 'Consolas', monospace;
  }
  .progress-detail {
    display: flex; gap: 12px; font-size: 11px; color: var(--text-muted);
  }
  .progress-bar {
    width: 100%; height: 10px;
    background: var(--code-bg);
    border-radius: 5px;
    overflow: hidden;
    position: relative;
    transition: background 0.3s ease;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), #8eb4ff);
    border-radius: 5px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    width: 0%;
    position: relative;
    overflow: hidden;
  }
  .progress-fill::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
    animation: shimmer 1.5s infinite;
  }
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .progress-meta {
    display: flex; justify-content: space-between;
    font-size: 11px; color: var(--text-muted);
  }
  .progress-eta {
    display: flex; align-items: center; gap: 4px;
    color: var(--accent); font-weight: 500;
  }

  /* ---- 按钮组 ---- */
  .actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding: 0 24px 20px;
  }
  .btn {
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; align-items: center; gap: 6px;
    position: relative;
    overflow: hidden;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 2px 8px -2px var(--accent-glow);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: 0 4px 14px -2px var(--accent-glow);
    transform: translateY(-1px);
  }
  .btn-success {
    background: var(--success);
    color: #fff;
    box-shadow: 0 2px 8px -2px rgba(16,185,129,0.3);
  }
  .btn-success:hover:not(:disabled) {
    background: var(--success-hover);
    box-shadow: 0 4px 14px -2px rgba(16,185,129,0.4);
    transform: translateY(-1px);
  }
  .btn-ghost {
    background: var(--code-bg);
    color: var(--text-muted);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--border);
    color: var(--text);
  }

  /* ---- 底部信息 ---- */
  .footer {
    padding: 0 24px 20px;
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
  }
  .footer a { color: var(--accent); text-decoration: none; cursor: pointer; }
  .footer a:hover { text-decoration: underline; }

  /* ---- 空状态 ---- */
  .empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px; padding: 30px 0;
    color: var(--text-muted);
    animation: fadeIn 0.3s ease;
  }
  .empty-state-icon { font-size: 36px; }
  .empty-state-text { font-size: 13px; }

  /* ---- 重试提示 ---- */
  .retry-hint {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--warn);
    background: rgba(245,158,11,0.1);
    padding: 6px 10px; border-radius: 6px;
    animation: fadeIn 0.25s ease;
  }
  .retry-hint .retry-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--warn);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }
</style>
</head>
<body>
  <div class="titlebar">
    <div class="titlebar-title">🔄 检查更新</div>
    <button class="titlebar-close" id="btnClose">×</button>
  </div>

  <div class="content">
    <!-- 版本信息 -->
    <div class="version-card">
      <div class="app-icon">★</div>
      <div class="version-info">
        <h2>书签管理器</h2>
        <div class="version-row" id="versionRow">
          <span class="version-badge" id="currentVersion">v…</span>
          <span class="build-mode" id="buildMode" style="display:none"></span>
          <span class="version-arrow" id="versionArrow" style="display:none">→</span>
          <span class="version-badge new" id="latestVersion" style="display:none"></span>
        </div>
      </div>
    </div>

    <!-- 状态区域 -->
    <div class="status-area" id="statusArea">
      <div class="empty-state" id="emptyState">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">正在检查更新…</div>
      </div>
    </div>
  </div>

  <div class="actions" id="actions">
    <button class="btn btn-ghost" id="btnCheck">🔍 检查更新</button>
    <button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>
  </div>

  <div class="footer">
    更新通过 GitHub Releases 分发 · <a id="linkReleases">查看所有版本</a>
  </div>

<script>
(function() {
  const $ = (id) => document.getElementById(id)
  let state = { state: 'idle', updateInfo: null, downloadProgress: null, error: '', currentVersion: '', canAutoUpdate: false, isPortable: false }
  let vInfo = null

  // ---- 工具函数 ----

  // 格式化字节
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0, val = bytes
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
    return val.toFixed(1) + ' ' + units[i]
  }

  // 格式化 ETA（秒 → 可读时间）
  function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '计算中…'
    if (seconds < 60) return seconds + ' 秒'
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    if (min < 60) return sec > 0 ? min + ' 分 ' + sec + ' 秒' : min + ' 分'
    const hr = Math.floor(min / 60)
    const remainMin = min % 60
    return hr + ' 时 ' + remainMin + ' 分'
  }

  // 转义 HTML
  function escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  // 简易 Markdown → HTML 渲染器
  function renderMarkdown(md) {
    if (!md) return ''
    // 先转义 HTML 防止 XSS
    let html = escapeHtml(md)

    // 代码块（三反引号包裹）
    html = html.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, (m, code) => {
      return '<pre><code>' + code.trim() + '</code></pre>'
    })

    // 标题 # ## ###
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // 分割线
    html = html.replace(/^---$/gm, '<hr>')

    // 加粗 **text**
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')

    // 斜体 *text*
    html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>')

    // 行内代码 \`code\`
    html = html.replace(/\`(.+?)\`/g, '<code>$1</code>')

    // 链接 [text](url)
    html = html.replace(/\\[(.+?)\\]\\((.+?)\\)/g, '<a href="$2" target="_blank">$1</a>')

    // 无序列表
    const lines = html.split('\\n')
    let inList = false
    let listType = ''
    const result = []
    for (const line of lines) {
      const ulMatch = line.match(/^[\\-\\*] (.+)$/)
      const olMatch = line.match(/^\\d+\\. (.+)$/)
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push('</' + listType + '>')
          result.push('<ul>')
          inList = true
          listType = 'ul'
        }
        result.push('<li>' + ulMatch[1] + '</li>')
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push('</' + listType + '>')
          result.push('<ol>')
          inList = true
          listType = 'ol'
        }
        result.push('<li>' + olMatch[1] + '</li>')
      } else {
        if (inList) {
          result.push('</' + listType + '>')
          inList = false
        }
        if (line.trim()) {
          // 跳过已被 HTML 标签包裹的行
          if (!/^<[hup][^>]*>/.test(line.trim()) && line.trim() !== '<hr>') {
            result.push('<p>' + line + '</p>')
          } else {
            result.push(line)
          }
        }
      }
    }
    if (inList) result.push('</' + listType + '>')

    return result.join('\\n')
  }

  // ---- 渲染界面 ----
  function render() {
    const statusArea = $('statusArea')
    const actions = $('actions')
    const s = state.state
    const info = state.updateInfo
    const prog = state.downloadProgress

    // 版本显示
    $('currentVersion').textContent = 'v' + (state.currentVersion || '…')
    if (info && info.version) {
      $('versionArrow').style.display = ''
      $('latestVersion').style.display = ''
      $('latestVersion').textContent = 'v' + info.version
    } else {
      $('versionArrow').style.display = 'none'
      $('latestVersion').style.display = 'none'
    }

    // 构建模式标签
    const bm = $('buildMode')
    if (state.buildMode) {
      bm.textContent = state.buildMode
      bm.style.display = ''
    } else {
      bm.style.display = 'none'
    }

    // 状态区域 + 按钮区域
    if (s === 'idle') {
      statusArea.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">点击「检查更新」查看是否有新版本</div></div>'
      actions.innerHTML = '<button class="btn btn-primary" id="btnCheck">🔍 检查更新</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'checking') {
      statusArea.innerHTML = '<div class="status-msg checking"><div class="spinner"></div>正在检查更新…</div>'
      actions.innerHTML = '<button class="btn btn-ghost" disabled>🔍 检查中…</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'not-available') {
      statusArea.innerHTML = '<div class="status-msg not-available">✅ 当前已是最新版本</div>'
      actions.innerHTML = '<button class="btn btn-primary" id="btnCheck">🔍 重新检查</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'available') {
      let notesHtml = ''
      if (info && info.releaseNotes) {
        notesHtml = '<div class="release-notes">' + renderMarkdown(info.releaseNotes) + '</div>'
      }
      const dateStr = info && info.releaseDate ? info.releaseDate.slice(0, 10) : ''
      const modeHint = state.isPortable ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">将下载到暂存文件夹，安装后自动清理</div>' : ''
      const deltaHint = info && info.useDelta && info.deltaSize
        ? '<div style="font-size:11px;color:var(--success);margin-top:4px">⚡ 支持差分更新 · 仅需下载 ' + formatBytes(info.deltaSize) + '（完整包 ' + formatBytes(info.downloadSize) + '）</div>'
        : ''
      statusArea.innerHTML =
        '<div class="status-msg available">✨ 发现新版本' + (info && info.version ? ' v' + info.version : '') + '</div>' +
        (dateStr ? '<div style="font-size:12px;color:var(--text-muted)">发布日期：' + dateStr + '</div>' : '') +
        notesHtml + modeHint + deltaHint
      const dlBtn = '<button class="btn btn-primary" id="btnDownload">📥 下载更新</button>'
      actions.innerHTML = dlBtn + '<button class="btn btn-ghost" id="btnCheck">🔍 重新检查</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'downloading') {
      const pct = prog ? prog.percent : 0
      const transferred = prog ? formatBytes(prog.transferred) : '0 B'
      const total = prog ? formatBytes(prog.total) : '…'
      const speed = prog && prog.bytesPerSecond ? formatBytes(prog.bytesPerSecond) + '/s' : '…'
      const eta = prog ? formatETA(prog.eta || 0) : '计算中…'
      statusArea.innerHTML =
        '<div class="status-msg downloading"><div class="spinner"></div>正在下载更新…</div>' +
        '<div class="progress-area">' +
          '<div class="progress-header">' +
            '<span class="progress-percent">' + pct + '%</span>' +
            '<span>' + transferred + ' / ' + total + '</span>' +
          '</div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="progress-meta">' +
            '<span>速度：' + speed + '</span>' +
            '<span class="progress-eta">⏳ 剩余 ' + eta + '</span>' +
          '</div>' +
        '</div>'
      actions.innerHTML = '<button class="btn btn-ghost" id="btnCancel">✕ 取消下载</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'delta-downloading') {
      const pct = prog ? prog.percent : 0
      const transferred = prog ? formatBytes(prog.transferred) : '0 B'
      const total = prog ? formatBytes(prog.total) : '…'
      const speed = prog && prog.bytesPerSecond ? formatBytes(prog.bytesPerSecond) + '/s' : '…'
      const eta = prog ? formatETA(prog.eta || 0) : '计算中…'
      const deltaSize = info && info.deltaSize ? formatBytes(info.deltaSize) : ''
      const fullSize = info && info.downloadSize ? formatBytes(info.downloadSize) : ''
      const savingsHint = deltaSize && fullSize
        ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">📦 差分更新 · 仅下载变化部分（' + deltaSize + ' / 完整包 ' + fullSize + '）</div>'
        : ''
      statusArea.innerHTML =
        '<div class="status-msg delta-downloading"><div class="spinner"></div>正在下载差分更新包…</div>' +
        savingsHint +
        '<div class="progress-area">' +
          '<div class="progress-header">' +
            '<span class="progress-percent">' + pct + '%</span>' +
            '<span>' + transferred + ' / ' + total + '</span>' +
          '</div>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="progress-meta">' +
            '<span>速度：' + speed + '</span>' +
            '<span class="progress-eta">⏳ 剩余 ' + eta + '</span>' +
          '</div>' +
        '</div>'
      actions.innerHTML = '<button class="btn btn-ghost" id="btnCancel">✕ 取消下载</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'delta-applying') {
      const applyMsg = state.applyMessage || '正在应用差分更新…'
      statusArea.innerHTML =
        '<div class="status-msg delta-applying"><div class="spinner"></div>' + escapeHtml(applyMsg) + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.6">' +
          '正在用差分数据重建新版本文件，此过程需要读取本地程序文件。<br/>' +
          '完成后会自动校验 SHA256 完整性。' +
        '</div>'
      actions.innerHTML = '<button class="btn btn-ghost" disabled>⏳ 应用中…</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'downloaded') {
      statusArea.innerHTML = '<div class="status-msg downloaded">✅ 更新已下载完成，可以安装了</div>'
      actions.innerHTML = '<button class="btn btn-success" id="btnInstall">🚀 立即安装并重启</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 发布页</button>'
    } else if (s === 'installing') {
      statusArea.innerHTML =
        '<div class="status-msg installing"><div class="spinner"></div>正在安装更新，应用即将重启…</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.6">' +
          '安装脚本已启动，请勿关闭此窗口。<br/>' +
          '应用退出后将自动完成安装并启动新版本。' +
        '</div>'
      actions.innerHTML = '<button class="btn btn-ghost" disabled>安装中…</button>'
    } else if (s === 'error') {
      // 检测是否是重试中的错误
      const isRetrying = state.error && state.error.indexOf('自动重试') !== -1
      let retryHint = ''
      if (isRetrying) {
        retryHint = '<div class="retry-hint"><div class="retry-dot"></div>' + escapeHtml(state.error) + '</div>'
      }
      statusArea.innerHTML =
        '<div class="status-msg error">⚠️ ' + escapeHtml(isRetrying ? '下载遇到问题' : (state.error || '检查更新失败')) + '</div>' +
        retryHint
      if (isRetrying) {
        actions.innerHTML = '<button class="btn btn-ghost" disabled>⏳ 自动重试中…</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 手动下载</button>'
      } else {
        actions.innerHTML = '<button class="btn btn-primary" id="btnCheck">🔍 重试</button><button class="btn btn-ghost" id="btnReleases" style="margin-left:auto">📂 手动下载</button>'
      }
    }

    bindActions()
  }

  function bindActions() {
    const btnCheck = $('btnCheck')
    const btnDownload = $('btnDownload')
    const btnInstall = $('btnInstall')
    const btnCancel = $('btnCancel')
    const btnReleases = $('btnReleases')

    if (btnCheck) btnCheck.onclick = () => window.updater.invoke('updater:check')
    if (btnDownload) btnDownload.onclick = () => window.updater.invoke('updater:download')
    if (btnInstall) btnInstall.onclick = () => window.updater.invoke('updater:install')
    if (btnCancel) btnCancel.onclick = () => window.updater.invoke('updater:cancel')
    if (btnReleases) btnReleases.onclick = () => window.updater.invoke('updater:openReleases')
  }

  // 关闭按钮 —— 直接请求关闭，主进程 close 事件会处理下载中确认
  $('btnClose').onclick = async () => {
    await window.updater.invoke('updater:closeWindow')
  }

  // 底部链接
  $('linkReleases').onclick = () => window.updater.invoke('updater:openReleases')

  // 监听状态变化
  window.updater.on('updater:state-changed', (payload) => {
    state = payload
    // 保留版本信息
    if (vInfo) {
      if (!state.currentVersion) state.currentVersion = vInfo.version
      if (!state.buildMode) {
        if (vInfo.isPortable) state.buildMode = 'Portable'
        else if (!vInfo.isPackaged) state.buildMode = 'Dev'
        else if (vInfo.canAutoUpdate) state.buildMode = 'Installed'
      }
    }
    render()
  })

  window.updater.on('updater:progress', (prog) => {
    state.downloadProgress = prog
    state.state = 'downloading'
    render()
  })

  // 初始获取状态
  async function init() {
    // 获取版本信息
    try {
      vInfo = await window.updater.invoke('updater:version')
      state.currentVersion = vInfo.version
      if (vInfo.isPortable) state.buildMode = 'Portable'
      else if (!vInfo.isPackaged) state.buildMode = 'Dev'
      else if (vInfo.canAutoUpdate) state.buildMode = 'Installed'
    } catch {}

    // 获取当前更新状态
    try {
      const st = await window.updater.invoke('updater:getState')
      state = st
      // 补充版本信息
      if (!state.currentVersion) state.currentVersion = vInfo?.version
      if (!state.buildMode) {
        if (vInfo?.isPortable) state.buildMode = 'Portable'
        else if (vInfo && !vInfo.isPackaged) state.buildMode = 'Dev'
        else if (vInfo?.canAutoUpdate) state.buildMode = 'Installed'
      }
    } catch {}

    render()

    // 如果当前是 idle 状态，自动检查
    if (state.state === 'idle') {
      window.updater.invoke('updater:check')
    }
  }

  init()
})()
</script>
</body>
</html>`
}

// ============================================================
// 创建独立更新窗口
// ============================================================
export function createUpdaterWindow(autoCheck = true) {
  // 如果窗口已存在，聚焦它
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.focus()
    return updaterWindow
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const isDark = nativeTheme.shouldUseDarkColors

  updaterWindow = new BrowserWindow({
    width: 480,
    height: 580,
    minWidth: 400,
    minHeight: 480,
    show: false,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    parent: null,  // 独立窗口，不依附主窗口
    modal: false,
    title: '检查更新',
    backgroundColor: isDark ? '#0f172a' : '#f0f4f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/updater-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 标记为更新窗口
  updaterWindow._isUpdaterWindow = true

  // 加载内联 HTML
  updaterWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getUpdaterHTML()))

  updaterWindow.once('ready-to-show', () => {
    updaterWindow.show()
    updaterWindow.focus()
  })

  // 下载中时阻止直接关闭，需要用户确认
  updaterWindow.on('close', (e) => {
    if (isDownloading() && !updaterWindow._forceClose) {
      e.preventDefault()
      const choice = dialog.showMessageBoxSync(updaterWindow, {
        type: 'warning',
        title: '下载进行中',
        message: '正在下载更新，确定要关闭窗口吗？',
        detail: '下载将在后台继续，完成后会再次弹出窗口。',
        buttons: ['后台继续下载', '取消'],
        defaultId: 0,
        cancelId: 1
      })
      if (choice === 0) {
        updaterWindow._forceClose = true
        updaterWindow.close()
      }
    }
  })

  updaterWindow.on('closed', () => {
    updaterWindow = null
  })

  return updaterWindow
}

// ============================================================
// 窗口管理 API
// ============================================================
export function getUpdaterWindow() {
  return updaterWindow
}

export function closeUpdaterWindow() {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow._forceClose = true
    updaterWindow.close()
  }
  updaterWindow = null
}

export function focusUpdaterWindow() {
  if (updaterWindow && !updaterWindow.isDestroyed()) {
    if (updaterWindow.isMinimized()) updaterWindow.restore()
    updaterWindow.focus()
  }
}

// ============================================================
// 注册窗口管理 IPC
// ============================================================
export function registerUpdaterWindowIpc() {
  // 打开更新窗口
  ipcMain.handle('updater:openWindow', async (_e, autoCheck) => {
    createUpdaterWindow(autoCheck !== false)
    return { ok: true }
  })

  // 关闭更新窗口（来自渲染进程的请求，不走强制关闭）
  ipcMain.handle('updater:closeWindow', async () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      // 不设置 _forceClose，让 close 事件处理器决定是否需要确认
      updaterWindow.close()
    }
    return { ok: true }
  })
}
