<template>
  <div class="h-screen flex flex-col">
    <div class="px-5 py-3 glass border-b border-white/30 dark:border-slate-700/50 flex items-center gap-3">
      <router-link to="/" custom v-slot="{ navigate }">
        <button @click="navigate" class="btn-ghost">← 返回</button>
      </router-link>
      <h2 class="text-lg font-semibold">设置</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-2xl mx-auto space-y-5">

        <!-- 外观 / 主题 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🎨 主题</h3>
          <div class="grid grid-cols-3 gap-2.5">
            <button v-for="t in themes" :key="t.key"
                    @click="setTheme(t.key)"
                    @mouseenter="enterThemePreview(t.key)"
                    @mouseleave="leaveThemePreview()"
                    :class="['relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 text-sm overflow-hidden',
                      s.theme === t.key ? 'shadow-md' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600']"
                    :style="s.theme === t.key ? { borderColor: 'var(--accent-500)' } : {}">
              <!-- 渐变背景预览 -->
              <div class="absolute inset-0 opacity-30 rounded-xl" :style="{ background: t.gradient || '' }"></div>
              <span class="text-2xl relative z-10">{{ t.icon }}</span>
              <span class="text-xs font-medium relative z-10">{{ t.name }}</span>
              <!-- 色条 -->
              <div class="flex gap-0.5 h-1.5 w-full rounded-full overflow-hidden relative z-10">
                <div v-for="(c, ci) in t.colors" :key="ci" class="flex-1" :style="{ background: c }"></div>
              </div>
              <!-- 预览色块：accent-500 + 背景渐变 -->
              <div v-if="t.accentColor" class="flex gap-1 mt-0.5 relative z-10">
                <div class="w-3 h-3 rounded-full border border-white/50 shadow-sm" :style="{ background: t.accentColor }" :title="'accent-500: ' + t.accentColor"></div>
                <div class="w-3 h-3 rounded-full border border-white/50 shadow-sm" :style="{ background: t.bgGradient || t.gradient || '#f8fafc' }" title="背景色"></div>
              </div>
              <div v-if="s.theme === t.key" class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white text-[10px] shadow z-20">&#10003;</div>
            </button>
          </div>
        </section>

        <!-- 自定义强调色 -->
        <section v-if="s.theme === 'custom'" class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🎨 自定义强调色</h3>
          <p class="text-xs text-slate-400 mb-3">选择一个自定义的强调色来替换默认主题色</p>
          <div class="flex items-center gap-3">
            <input type="color" v-model="s.customAccentColor" @input="onCustomColorChange" class="w-10 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent" />
            <span class="text-sm text-slate-500 font-mono">{{ s.customAccentColor || '#6366f1' }}</span>
            <button v-if="s.customAccentColor" @click="resetCustomColor" class="btn-ghost text-xs">重置</button>
          </div>
        </section>

        <!-- 默认浏览器 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🌐 默认浏览器</h3>
          <p class="text-xs text-slate-400 mb-3">双击书签时使用</p>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <button v-for="b in browserOptions" :key="b.key"
                    @click="setBrowser(b.key)"
                    :class="['px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-center',
                    s.defaultBrowser.preset === b.key ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-700']">
              <span>{{ b.icon }}</span><span>{{ b.label }}</span>
            </button>
            <button @click="setBrowser('custom')"
                    :class="['col-span-2 px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 justify-center',
                    s.defaultBrowser.preset === 'custom' ? 'bg-accent text-white' : 'bg-slate-100 dark:bg-slate-700']">
              ⚙️ 自定义路径
            </button>
          </div>
          <input v-if="s.defaultBrowser.preset === 'custom'" v-model="s.defaultBrowser.path" @change="save" class="input text-sm" placeholder="C:\Program Files\...\browser.exe" />
        </section>

        <!-- 预览缓存 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🖼️ 预览缓存</h3>
          <p class="text-xs text-slate-400 mb-3">超过上限时自动清理最久未访问的预览图片（保留文字元数据）</p>
          <div class="flex items-center gap-3 mb-2">
            <label class="text-sm text-slate-500 w-28">上限</label>
            <input v-model.number="s.previewCacheLimitMB" @change="save" type="range" min="50" max="2000" step="50" class="flex-1" />
            <span class="text-sm font-medium w-20 text-right">{{ s.previewCacheLimitMB }} MB</span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-500">
            <span>当前占用：{{ cacheMb ?? '…' }} MB</span>
            <button @click="enforceLimitNow" class="text-accent hover:underline">立即清理</button>
          </div>
        </section>

        <!-- GeoIP -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">📍 服务器定位</h3>
          <p class="text-xs text-slate-400 mb-3">离线库查询不出网；未导入时用在线兜底。</p>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm w-28 text-slate-500">City 库</span>
              <span class="flex-1 text-xs px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700">{{ s.geoip.cityMmdbPath ? '✅ 已导入' : '❌ 未导入' }}</span>
              <button @click="importMmdb('city')" class="btn-ghost text-xs">导入</button>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm w-28 text-slate-500">ASN 库</span>
              <span class="flex-1 text-xs px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700">{{ s.geoip.asnMmdbPath ? '✅ 已导入' : '❌ 未导入' }}</span>
              <button @click="importMmdb('asn')" class="btn-ghost text-xs">导入</button>
            </div>
            <label class="flex items-center gap-2 mt-2 text-sm cursor-pointer">
              <input type="checkbox" v-model="s.geoip.allowOnlineFallback" @change="save" class="w-4 h-4" />
              <span>允许在线兜底</span>
            </label>
            <div class="text-xs text-slate-400 mt-2">
              📥 <a href="#" @click.prevent="openLink" class="text-accent hover:underline">MaxMind 官网</a> 免费注册下载 .mmdb 文件
            </div>
          </div>
        </section>

        <!-- 代理 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🔗 代理</h3>
          <p class="text-xs text-slate-400 mb-3">通过代理服务器校验书签（适用于网络受限环境）</p>
          <label class="flex items-center gap-2 text-sm cursor-pointer mb-3">
            <input type="checkbox" v-model="s.proxy.enabled" class="w-4 h-4" />
            <span>启用代理</span>
          </label>
          <div v-if="s.proxy.enabled" class="grid grid-cols-4 gap-2">
            <input v-model="s.proxy.host" class="input text-sm col-span-2" placeholder="代理地址 (127.0.0.1)" />
            <input v-model="s.proxy.port" class="input text-sm" placeholder="端口 (8080)" />
            <select v-model="s.proxy.type" class="input text-sm">
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
            <input v-model="s.proxy.username" class="input text-sm col-span-2" placeholder="用户名（可选）" />
            <input v-model="s.proxy.password" type="password" class="input text-sm col-span-2" placeholder="密码（可选）" />
            <button @click="autoDetectProxy" class="btn-ghost text-xs col-span-2">🔍 自动检测本机代理</button>
            <span v-if="proxyMsg" class="text-[10px] text-slate-400 col-span-4">{{ proxyMsg }}</span>
          </div>
        </section>

        <!-- 自动校验 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🩺 自动校验</h3>
          <label class="flex items-center gap-2 text-sm cursor-pointer mb-2">
            <input type="checkbox" v-model="s.autoValidate.onStartup" @change="save" class="w-4 h-4" />
            <span>启动时自动校验</span>
          </label>
          <div class="flex items-center gap-3">
            <label class="text-sm text-slate-500 w-28">校验周期</label>
            <select v-model.number="s.autoValidate.intervalDays" @change="save" class="input text-sm w-auto">
              <option :value="1">每天</option><option :value="3">每 3 天</option>
              <option :value="7">每周</option><option :value="30">每月</option>
            </select>
          </div>
        </section>

        <!-- 数据 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">💾 数据</h3>
          <div class="space-y-2 mb-3">
            <div class="flex items-center gap-2 text-sm">
              <span class="text-slate-500 w-24 shrink-0">数据目录</span>
              <span class="flex-1 text-xs font-mono truncate px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700">{{ dataDirInfo.current || '加载中…' }}</span>
            </div>
            <div class="flex gap-2">
              <button @click="changeDataDir" class="btn-ghost text-xs">📁 更改目录</button>
              <button v-if="dataDirInfo.current !== dataDirInfo.default" @click="resetDataDir" class="btn-ghost text-xs">🔄 恢复默认</button>
            </div>
          </div>
          <p class="text-xs text-slate-400">所有数据（书签、加密凭证、Cookie、预览）均保存在此本地目录。</p>
        </section>

        <!-- 工作区 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">📂 工作区</h3>
          <p class="text-xs text-slate-400 mb-3">快速切换不同数据目录，每个工作区有独立的书签和分类数据。</p>
          <div class="flex gap-2 mb-3">
            <button @click="addWorkspace" class="btn-ghost text-xs">＋ 添加工作区</button>
          </div>
          <div v-if="(s.workspaces || []).length === 0" class="text-xs text-slate-400 py-2">暂无工作区，点击上方按钮添加</div>
          <div v-else class="space-y-1.5">
            <div v-for="(ws, idx) in s.workspaces" :key="idx"
                 :class="['flex items-center gap-2 px-3 py-2 rounded-lg text-sm', s.currentWorkspace === ws.dir ? 'bg-accent/10 border border-accent/30' : 'bg-slate-50 dark:bg-slate-700/50']">
              <span class="flex-1 min-w-0">
                <span class="font-medium">{{ ws.name }}</span>
                <span class="text-xs text-slate-400 ml-2 font-mono truncate">{{ ws.dir }}</span>
                <span v-if="s.currentWorkspace === ws.dir" class="text-[10px] text-accent ml-1">当前</span>
              </span>
              <button v-if="s.currentWorkspace !== ws.dir" @click="switchWorkspace(ws.dir)" class="text-xs text-accent hover:underline">切换</button>
              <button v-else class="text-xs text-slate-400 cursor-default">使用中</button>
              <button v-if="s.currentWorkspace !== ws.dir" @click="deleteWorkspace(idx)" class="text-xs text-red-400 hover:text-red-600">删除</button>
            </div>
          </div>
        </section>

        <!-- 快捷键 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">⌨️ 快捷键</h3>
          <div class="space-y-2">
            <div v-for="shortcut in shortcuts" :key="shortcut.key" class="flex items-center justify-between py-1.5">
              <span class="text-sm text-slate-600 dark:text-slate-300">{{ shortcut.desc }}</span>
              <div class="flex items-center gap-1">
                <kbd v-for="(part, pi) in shortcut.key.split(/[\+]/)" :key="pi"
                     class="px-1.5 py-0.5 text-xs font-mono rounded bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                  {{ part.trim() }}
                </kbd>
              </div>
            </div>
          </div>
        </section>

        <!-- 自动备份 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">📦 自动备份</h3>
          <div class="space-y-2 mb-3">
            <div class="flex items-center gap-2 text-sm">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="s.backup.enabled" @change="saveBackupSettings" class="rounded" />
                <span>启用自动备份</span>
              </label>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="text-slate-500 w-24 shrink-0">备份间隔</span>
              <select v-model.number="s.backup.intervalMinutes" @change="saveBackupSettings" class="input w-auto text-xs" :disabled="!s.backup.enabled">
                <option :value="30">30 分钟</option>
                <option :value="60">1 小时</option>
                <option :value="120">2 小时</option>
                <option :value="360">6 小时</option>
                <option :value="1440">每天</option>
              </select>
            </div>
            <div class="flex gap-2">
              <button @click="manualBackup" class="btn-ghost text-xs" :disabled="backupSaving">💾 立即备份</button>
              <button v-if="s.backup.enabled" @click="stopBackup" class="btn-ghost text-xs">⏹️ 停止自动备份</button>
            </div>
            <div v-if="backupList.length > 0" class="mt-2">
              <p class="text-xs text-slate-400 mb-1">历史备份（最多保留 30 个）</p>
              <div class="max-h-32 overflow-y-auto text-xs space-y-0.5">
                <div v-for="b in backupList.slice(0, 10)" :key="b.filename" class="flex justify-between px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <span class="font-mono">{{ b.filename.replace('bookmark-backup-', '').replace('.json', '') }}</span>
                  <span class="text-slate-400">{{ (b.size / 1024).toFixed(1) }} KB</span>
                </div>
              </div>
            </div>
          </div>
          <p class="text-xs text-slate-400">自动备份保存在数据目录的 `backups/` 子文件夹中。</p>
        </section>

        <!-- 应用锁定 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🔐 应用锁定</h3>
          <p class="text-xs text-slate-400 mb-3">设置主密码后，每次启动应用需输入密码才能进入。密码使用 PBKDF2+SHA-256 加密存储。</p>
          <div class="space-y-3">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" v-model="s.lockEnabled" @change="save" class="w-4 h-4" />
              <span>启用应用锁定</span>
            </label>
            <div v-if="s.lockEnabled" class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-500 w-24 shrink-0">新密码</span>
                <input v-model="lockPasswordInput" type="password" class="input text-sm flex-1" placeholder="输入新密码" />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-500 w-24 shrink-0">确认密码</span>
                <input v-model="lockPasswordConfirm" type="password" class="input text-sm flex-1" placeholder="再次输入密码" />
              </div>
              <div class="flex gap-2">
                <button @click="setLockPassword" class="btn-accent text-xs" :disabled="lockSaving">
                  {{ s.lockPassword ? '更新密码' : '设置密码' }}
                </button>
                <button v-if="s.lockPassword" @click="clearLockPassword" class="btn-ghost text-xs text-red-400" :disabled="lockSaving">禁用锁定</button>
              </div>
              <div v-if="lockMsg" :class="['text-xs', lockMsgType === 'error' ? 'text-red-400' : 'text-green-500']">{{ lockMsg }}</div>
            </div>
          </div>
        </section>

        <!-- 智能文件夹管理 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🔍 智能文件夹</h3>
          <p class="text-xs text-slate-400 mb-3">管理保存的搜索条件，可从侧边栏快速访问。</p>
          <div v-if="(s.smartFolders || []).length === 0" class="text-xs text-slate-400 py-2">暂无智能文件夹，可在主界面通过侧边栏的"+"按钮创建</div>
          <div v-else class="space-y-1.5">
            <div v-for="(sf, idx) in s.smartFolders" :key="sf.id"
                 class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-slate-50 dark:bg-slate-700/50">
              <span class="flex-1 min-w-0">
                <span class="font-medium">{{ sf.name }}</span>
                <span v-if="sf.query" class="text-xs text-slate-400 ml-2">搜索: {{ sf.query }}</span>
              </span>
              <button @click="deleteSmartFolder(idx)" class="text-xs text-red-400 hover:text-red-600">删除</button>
            </div>
          </div>
        </section>

        <!-- 关于 / 版本更新 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-3 flex items-center gap-2">🔄 关于与更新</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm">
                <span class="text-slate-500">当前版本</span>
                <span class="font-mono font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">v{{ appVersion }}</span>
                <span v-if="buildMode" class="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{{ buildMode }}</span>
              </div>
              <button @click="openUpdateWindow"
                      class="btn-accent text-xs px-4 py-2">
                🔄 检查更新
              </button>
            </div>

            <!-- 更新状态摘要 -->
            <div v-if="updateSummary" :class="['flex items-center gap-2 text-sm px-3 py-2 rounded-lg', updateSummaryClass]">
              <span>{{ updateSummary.icon }}</span>
              <span>{{ updateSummary.text }}</span>
              <button v-if="updateSummary.action" @click="openUpdateWindow" class="text-xs text-accent hover:underline ml-auto">{{ updateSummary.action }}</button>
            </div>

            <!-- 自动检查 -->
            <label class="flex items-center gap-2 text-sm cursor-pointer pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
              <input type="checkbox" v-model="s.autoCheckUpdate" @change="save" class="w-4 h-4" />
              <span>启动时自动检查更新</span>
            </label>

            <!-- 静默下载 -->
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" v-model="s.silentDownload" @change="save" class="w-4 h-4" />
              <span>发现新版本后静默下载</span>
              <span class="text-xs text-slate-400">（下载完成后弹出安装提示）</span>
            </label>

            <div class="text-xs text-slate-400">
              更新通过 GitHub Releases 分发。
              <a href="#" @click.prevent="openReleases" class="text-accent hover:underline">查看所有版本</a>
            </div>
          </div>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useSettingsStore, THEME_PRESETS } from '../stores/settings.js'

const store = useSettingsStore()
const s = store.settings  // Pinia返回的是reactive对象，不是ref，直接用s.theme而非s.value.theme
const cacheMb = ref(null)
const dataDirInfo = ref({ current: '', default: '' })
const proxyMsg = ref('')
const backupSaving = ref(false)
const backupList = ref([])

// ---- 版本更新状态 ----
const appVersion = ref('…')
const buildMode = ref('')
const updaterState = ref({ state: 'idle', updateInfo: null, error: '' })
let updaterUnsub = []

// 更新状态摘要（计算属性）
const updateSummary = computed(() => {
  const st = updaterState.value
  if (st.state === 'available' && st.updateInfo) {
    return { icon: '✨', text: `发现新版本 v${st.updateInfo.version}`, action: '查看详情', class: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' }
  }
  if (st.state === 'downloading') {
    return { icon: '📥', text: '正在下载更新…', action: '查看进度', class: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' }
  }
  if (st.state === 'downloaded') {
    return { icon: '✅', text: '更新已就绪，可以安装', action: '立即安装', class: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300' }
  }
  if (st.state === 'not-available') {
    return { icon: '✅', text: '当前已是最新版本', class: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300' }
  }
  if (st.state === 'error') {
    return { icon: '⚠️', text: st.error || '检查更新失败', action: '重试', class: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' }
  }
  return null
})
const updateSummaryClass = computed(() => updateSummary.value?.class || '')

const shortcuts = [
  { key: 'Ctrl+K', desc: '聚焦搜索框' },
  { key: 'Ctrl+Shift+K', desc: '快捷搜索面板' },
  { key: '↑↓←→', desc: '在书签卡片间导航' },
  { key: 'Enter', desc: '打开选中书签预览' },
  { key: 'Shift+Enter', desc: '外部浏览器打开' },
  { key: 'Space', desc: '切换选中' },
  { key: 'Ctrl+A', desc: '全选' },
  { key: 'Ctrl+D', desc: '取消选择' },
  { key: 'Escape', desc: '关闭弹窗/面板' }
]
const lockPasswordInput = ref('')
const lockPasswordConfirm = ref('')
const lockSaving = ref(false)
const lockMsg = ref('')
const lockMsgType = ref('')

const previewTheme = ref('')

const themes = THEME_PRESETS.map((t) => ({
  ...t,
  accentColor: t.key === 'custom' ? (s.customAccentColor || t.accent?.[500] || '#6366f1') : (t.accent?.[500] || '#3563ff'),
  bgGradient: t.gradientLight || '',
  gradient: t.swatch ? `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]}, ${t.swatch[2]})` : '',
  colors: t.swatch || ['#e2e8f0', '#cbd5e1', '#94a3b8']
}))

const browserOptions = ref([
  { key: 'system', icon: '🌐', label: '系统默认' },
  { key: 'chrome', icon: '🔵', label: 'Chrome' },
  { key: 'edge', icon: '🟢', label: 'Edge' },
  { key: 'firefox', icon: '🦊', label: 'Firefox' }
])

// 自动备份
async function saveBackupSettings() {
  await store.save({ backup: { ...s.backup } })
  if (s.backup.enabled) {
    await window.api.invoke('backup:start', s.backup.intervalMinutes || 60)
    window.$toast('自动备份已启动', 'success')
  } else {
    await window.api.invoke('backup:stop')
  }
}

async function manualBackup() {
  backupSaving.value = true
  const r = await window.api.invoke('backup:create')
  backupSaving.value = false
  if (r && r.ok) {
    window.$toast('备份成功: ' + r.filename, 'success')
    await loadBackupList()
  } else {
    window.$toast('备份失败: ' + (r?.error || ''), 'error')
  }
}

async function stopBackup() {
  await window.api.invoke('backup:stop')
  s.backup.enabled = false
  await store.save({ backup: { ...s.backup } })
  window.$toast('已停止自动备份', 'info')
}

async function loadBackupList() {
  const list = await window.api.invoke('backup:list')
  backupList.value = Array.isArray(list) ? list : []
}

onMounted(async () => {
  await refreshCache()
  dataDirInfo.value = await window.api.invoke('dataDir:get')
  await loadBackupList()
  // 获取当前版本信息
  try {
    const vInfo = await window.api.invoke('updater:version')
    appVersion.value = vInfo.version || '1.0.0'
    if (vInfo.isPortable) buildMode.value = 'Portable'
    else if (!vInfo.isPackaged) buildMode.value = 'Dev'
    else if (vInfo.canAutoUpdate) buildMode.value = 'Installed'
  } catch { appVersion.value = '1.0.0' }

  // 监听更新状态变化（来自独立更新窗口的广播）
  updaterUnsub.push(window.api.on('updater:state-changed', (payload) => {
    updaterState.value = payload
  }))

  // 自动检查更新（后台静默检查，不弹窗口）
  if (s.autoCheckUpdate) {
    setTimeout(async () => {
      try {
        const st = await window.api.invoke('updater:check', true)
        updaterState.value = st
        // 如果发现更新且未开启静默下载，弹出更新窗口
        if (st.state === 'available' && !s.silentDownload) {
          window.api.invoke('updater:openWindow', false)
        }
        // 如果静默下载完成，弹出窗口提示安装
        if (st.state === 'downloaded') {
          window.api.invoke('updater:openWindow', false)
        }
      } catch {}
    }, 3000)
  }
})

onUnmounted(() => {
  updaterUnsub.forEach(fn => { try { fn() } catch {} })
})

async function refreshCache() {
  const r = await window.api.invoke('preview:cacheSize')
  cacheMb.value = r.mb
}

async function save() { await store.save(s) }

function enterThemePreview(key) {
  previewTheme.value = key
  const preset = THEME_PRESETS.find(t => t.key === key)
  if (!preset || !preset.accent) return
  const root = document.documentElement
  if (key === 'custom' && s.customAccentColor) {
    root.style.setProperty('--accent-500', s.customAccentColor)
    root.style.setProperty('--accent-400', s.customAccentColor)
    root.style.setProperty('--accent-600', s.customAccentColor)
    root.style.setProperty('--accent-50', s.customAccentColor + '14')
  } else {
    root.style.setProperty('--accent-500', preset.accent[500])
    root.style.setProperty('--accent-400', preset.accent[400])
    root.style.setProperty('--accent-600', preset.accent[600])
    root.style.setProperty('--accent-50', preset.accent[50])
  }
}

function leaveThemePreview() {
  previewTheme.value = ''
  store.applyTheme()
}

async function setTheme(key) {
  const previous = s.theme
  window.$toast(`正在切换主题…`, 'info')
  s.theme = key
  await store.save({ theme: key })
  // 验证主题是否生效
  await new Promise(r => setTimeout(r, 100))
  const cls = document.documentElement.className
  const effective = key === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : key
  const hasDark = cls.includes('dark')
  const hasCustom = cls.includes('theme-' + effective)
  if (key === 'dark' && hasDark) window.$toast(`✅ 已切换为深色主题`, 'success')
  else if (key === 'light') window.$toast(`✅ 已切换为浅色主题`, 'success')
  else if (hasCustom || effective === 'dark' || effective === 'light') window.$toast(`✅ 已切换为「${THEME_PRESETS.find(t=>t.key===key)?.name||key}」主题`, 'success')
  else window.$toast(`⚠️ 主题切换可能未生效`, 'warn')
}
async function setBrowser(key) {
  // system 和 custom 直接允许
  if (key === 'system') {
    s.defaultBrowser.preset = 'system'
    s.defaultBrowser.path = ''
    await store.save({ defaultBrowser: { ...s.defaultBrowser } })
    window.$toast('✅ 已切换为系统默认浏览器', 'success')
    return
  }
  if (key === 'custom') {
    s.defaultBrowser.preset = 'custom'
    await store.save({ defaultBrowser: { ...s.defaultBrowser } })
    window.$toast('请填写自定义浏览器路径', 'info')
    return
  }
  // 检测浏览器是否安装
  window.$toast('正在检测浏览器…', 'info')
  try {
    const browsers = await window.api.invoke('browser:detect')
    if (!browsers || !browsers[key] || !browsers[key].installed) {
      window.$toast(`❌ 本机未检测到 ${key} 浏览器`, 'warn')
      return  // 不切换，保持原浏览器
    }
    s.defaultBrowser.preset = key
    s.defaultBrowser.path = ''
    await store.save({ defaultBrowser: { ...s.defaultBrowser } })
    window.$toast(`✅ 已切换为 ${key}`, 'success')
  } catch (e) {
    window.$toast('⚠️ 检测失败，已阻止切换', 'warn')
  }
}

async function enforceLimitNow() { await window.api.invoke('preview:enforceLimit'); await refreshCache() }

async function importMmdb(kind) {
  const r = await window.api.invoke('geoip:importMmdb', kind)
  if (r.imported) { window.$toast('已导入数据库', 'success') }
}

async function autoDetectProxy() {
  proxyMsg.value = '检测中…'
  const r = await window.api.invoke('proxy:detect')
  if (r && r.found) {
    s.proxy.enabled = true
    s.proxy.host = r.host
    s.proxy.port = r.port
    proxyMsg.value = `✅ 已配置: ${r.host}:${r.port} (${r.source})`
    await store.save()
  } else {
    proxyMsg.value = '未检测到系统代理'
  }
}

function openLink() { window.api.invoke('browser:open', 'https://www.maxmind.com/en/geolite2/signup') }

function onCustomColorChange() {
  if (!s.customAccentColor) return
  store.applyTheme()
  save()
}

function resetCustomColor() {
  s.customAccentColor = '#6366f1'
  store.applyTheme()
  save()
}

async function changeDataDir() {
  const pick = await window.api.invoke('dataDir:pick')
  if (pick.canceled) return
  const r = await window.api.invoke('dataDir:set', pick.path)
  if (r && r.ok) {
    dataDirInfo.value = await window.api.invoke('dataDir:get')
    window.$toast('数据目录已更改', 'success')
  } else {
    window.$toast('更改失败: ' + (r?.error || '未知错误'), 'error')
  }
}

async function resetDataDir() {
  if (!confirm('恢复默认数据目录？现有数据不会自动迁移。')) return
  const r = await window.api.invoke('dataDir:reset')
  if (r && r.ok) {
    dataDirInfo.value = await window.api.invoke('dataDir:get')
    window.$toast('已恢复默认数据目录', 'success')
  }
}

// ---- 工作区 ----
async function addWorkspace() {
  const name = prompt('输入工作区名称：')
  if (!name || !name.trim()) return
  const pick = await window.api.invoke('dataDir:pick')
  if (pick.canceled) return
  if (!s.workspaces) s.workspaces = []
  // 检查是否已存在同路径
  if (s.workspaces.some(w => w.dir === pick.path)) {
    window.$toast('该目录已存在于工作区列表中', 'warn')
    return
  }
  s.workspaces.push({ name: name.trim(), dir: pick.path })
  await store.save({ workspaces: [...s.workspaces] })
  window.$toast(`工作区「${name.trim()}」已添加`, 'success')
}

async function switchWorkspace(dir) {
  if (!confirm('切换工作区需要重启应用。\n切换后数据目录将变更为：\n' + dir + '\n\n继续？')) return
  const r = await window.api.invoke('dataDir:set', dir)
  if (r && r.ok) {
    s.currentWorkspace = dir
    await store.save({ currentWorkspace: dir })
    window.$toast('数据目录已切换，请重启应用', 'success')
  } else {
    window.$toast('切换失败: ' + (r?.error || '未知错误'), 'error')
  }
}

async function deleteWorkspace(idx) {
  if (!s.workspaces || !s.workspaces[idx]) return
  const ws = s.workspaces[idx]
  if (s.currentWorkspace === ws.dir) {
    window.$toast('不能删除当前工作区', 'warn')
    return
  }
  if (!confirm(`确定删除工作区「${ws.name}」？\n（不会删除目录中的数据文件）`)) return
  s.workspaces.splice(idx, 1)
  await store.save({ workspaces: [...s.workspaces] })
  window.$toast('工作区已删除', 'info')
}

// ---- 应用锁定 ----
async function setLockPassword() {
  const pw = lockPasswordInput.value
  const confirm = lockPasswordConfirm.value
  lockMsg.value = ''
  if (!pw) {
    lockMsg.value = '请输入密码'
    lockMsgType.value = 'error'
    return
  }
  if (pw.length < 4) {
    lockMsg.value = '密码至少 4 个字符'
    lockMsgType.value = 'error'
    return
  }
  if (pw !== confirm) {
    lockMsg.value = '两次输入的密码不一致'
    lockMsgType.value = 'error'
    return
  }
  lockSaving.value = true
  try {
    // 使用 Web Crypto API 派生并存储（前端计算，通过 IPC 保存）
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pw), 'PBKDF2', false, ['deriveBits'])
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    )
    const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('')
    s.lockPassword = saltHex + ':' + hashHex
    s.lockEnabled = true
    await store.save({ lockPassword: s.lockPassword, lockEnabled: true })
    lockPasswordInput.value = ''
    lockPasswordConfirm.value = ''
    lockMsg.value = '密码已设置，下次启动时生效'
    lockMsgType.value = 'success'
    window.$toast('密码已设置', 'success')
  } catch (e) {
    lockMsg.value = '设置失败: ' + (e.message || e)
    lockMsgType.value = 'error'
  }
  lockSaving.value = false
}

async function clearLockPassword() {
  if (!confirm('确定禁用应用锁定？')) return
  s.lockPassword = ''
  s.lockEnabled = false
  lockPasswordInput.value = ''
  lockPasswordConfirm.value = ''
  lockMsg.value = ''
  await store.save({ lockPassword: '', lockEnabled: false })
  window.$toast('应用锁定已禁用', 'info')
}

// ---- 智能文件夹 ----
async function deleteSmartFolder(idx) {
  if (!s.smartFolders || !s.smartFolders[idx]) return
  const name = s.smartFolders[idx].name
  if (!confirm(`确定删除智能文件夹「${name}」？`)) return
  s.smartFolders.splice(idx, 1)
  await store.save({ smartFolders: [...s.smartFolders] })
  window.$toast('智能文件夹已删除', 'info')
}

// ---- 版本更新 ----
async function openUpdateWindow() {
  await window.api.invoke('updater:openWindow', true)
}

async function openReleases() {
  await window.api.invoke('updater:openReleases')
}
</script>
