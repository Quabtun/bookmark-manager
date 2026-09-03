import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// 主题预设：单一数据源，含强调色、背景渐变、玻璃色调、色板预览
export const THEME_PRESETS = [
  {
    key: 'light', name: '浅色', icon: '☀️',
    accent: { 50: '#eef4ff', 400: '#598bff', 500: '#3563ff', 600: '#1e42f5' },
    gradientLight: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 30%, #eef4ff 100%)',
    gradientDark: 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #0f172a 100%)',
    swatch: ['#e2e8f0', '#ffffff', '#eef4ff'],
    glassLight: 'rgba(255,255,255,0.72)', glassDark: 'rgba(15,23,42,0.62)'
  },
  {
    key: 'dark', name: '深色', icon: '🌙',
    accent: { 50: '#eef4ff', 400: '#598bff', 500: '#3563ff', 600: '#1e42f5' },
    gradientLight: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 30%, #eef4ff 100%)',
    gradientDark: 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #0f172a 100%)',
    swatch: ['#0f172a', '#1e293b', '#334155'],
    glassLight: 'rgba(255,255,255,0.72)', glassDark: 'rgba(15,23,42,0.62)'
  },
  {
    key: 'soft', name: '柔和', icon: '🌸',
    accent: { 50: '#fffbeb', 400: '#f59e0b', 500: '#d97706', 600: '#b45309' },
    gradientLight: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 30%, #fef2f2 100%)',
    gradientDark: 'linear-gradient(135deg, #451a03 0%, #7c2d12 30%, #4c0519 100%)',
    swatch: ['#fef3c7', '#ffedd5', '#fce7f3'],
    glassLight: 'rgba(255,251,235,0.72)', glassDark: 'rgba(69,26,3,0.55)'
  },
  {
    key: 'midnight', name: '午夜蓝', icon: '🌌',
    accent: { 50: '#eff6ff', 400: '#3b82f6', 500: '#2563eb', 600: '#1d4ed8' },
    gradientLight: 'linear-gradient(135deg, #f1f5f9 0%, #eff6ff 30%, #e0e7ff 100%)',
    gradientDark: 'linear-gradient(135deg, #020617 0%, #1e1b4b 30%, #1e1b4b 100%)',
    swatch: ['#e0e7ff', '#bfdbfe', '#c7d2fe'],
    glassLight: 'rgba(241,245,249,0.72)', glassDark: 'rgba(2,6,23,0.6)'
  },
  {
    key: 'forest', name: '森林绿', icon: '🌿',
    accent: { 50: '#ecfdf5', 400: '#10b981', 500: '#059669', 600: '#047857' },
    gradientLight: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 30%, #ccfbf1 100%)',
    gradientDark: 'linear-gradient(135deg, #022c22 0%, #064e3b 30%, #022c22 100%)',
    swatch: ['#d1fae5', '#a7f3d0', '#99f6e4'],
    glassLight: 'rgba(236,253,245,0.72)', glassDark: 'rgba(2,44,34,0.6)'
  },
  {
    key: 'lavender', name: '薰衣草', icon: '💜',
    accent: { 50: '#faf5ff', 400: '#8b5cf6', 500: '#7c3aed', 600: '#6d28d9' },
    gradientLight: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 30%, #fdf2f8 100%)',
    gradientDark: 'linear-gradient(135deg, #2e1065 0%, #4c1d95 30%, #1e1b4b 100%)',
    swatch: ['#ede9fe', '#e0e7ff', '#fce7f3'],
    glassLight: 'rgba(250,245,255,0.72)', glassDark: 'rgba(46,16,101,0.6)'
  },
  {
    key: 'eyecare', name: '护眼', icon: '🍃',
    accent: { 50: '#eef6e8', 400: '#7fae6e', 500: '#5b8c5a', 600: '#477046' },
    gradientLight: 'linear-gradient(135deg, #f0f4e8 0%, #e8efd9 30%, #f5f0e6 100%)',
    gradientDark: 'linear-gradient(135deg, #1a2417 0%, #2d3a23 30%, #1a2417 100%)',
    swatch: ['#f0f4e8', '#c7edcc', '#5b8c5a'],
    glassLight: 'rgba(240,244,232,0.72)', glassDark: 'rgba(26,36,23,0.6)'
  },
  {
    key: 'ocean', name: '海洋', icon: '🌊',
    accent: { 50: '#ecfeff', 400: '#22d3ee', 500: '#0891b2', 600: '#0e7490' },
    gradientLight: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 30%, #a5f3fc 100%)',
    gradientDark: 'linear-gradient(135deg, #083344 0%, #164e63 30%, #083344 100%)',
    swatch: ['#ecfeff', '#67e8f9', '#0891b2'],
    glassLight: 'rgba(236,254,255,0.72)', glassDark: 'rgba(8,51,68,0.6)'
  },
  {
    key: 'sunset', name: '日落', icon: '🌅',
    accent: { 50: '#fff7ed', 400: '#fb923c', 500: '#ea580c', 600: '#c2410c' },
    gradientLight: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 30%, #fecaca 100%)',
    gradientDark: 'linear-gradient(135deg, #431407 0%, #7c2d12 30%, #4c0519 100%)',
    swatch: ['#ffedd5', '#fed7aa', '#f97316'],
    glassLight: 'rgba(255,247,237,0.72)', glassDark: 'rgba(67,20,7,0.6)'
  },
  {
    key: 'sakura', name: '樱花', icon: '🌷',
    accent: { 50: '#fdf2f8', 400: '#f472b6', 500: '#ec4899', 600: '#db2777' },
    gradientLight: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 30%, #fbcfe8 100%)',
    gradientDark: 'linear-gradient(135deg, #500724 0%, #831843 30%, #500724 100%)',
    swatch: ['#fce7f3', '#fbcfe8', '#ec4899'],
    glassLight: 'rgba(253,242,248,0.72)', glassDark: 'rgba(80,7,36,0.6)'
  },
  {
    key: 'ink', name: '墨韵', icon: '🖋️',
    accent: { 50: '#fefce8', 400: '#facc15', 500: '#ca8a04', 600: '#a16207' },
    gradientLight: 'linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 30%, #d6d3d1 100%)',
    gradientDark: 'linear-gradient(135deg, #1c1917 0%, #292524 30%, #1c1917 100%)',
    swatch: ['#e7e5e4', '#a8a29e', '#1c1917'],
    glassLight: 'rgba(245,245,244,0.72)', glassDark: 'rgba(28,25,23,0.62)'
  },
  {
    key: 'aurora', name: '极光', icon: '🌠',
    accent: { 50: '#f0fdfa', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488' },
    gradientLight: 'linear-gradient(135deg, #f0fdfa 0%, #e0e7ff 30%, #f5f3ff 100%)',
    gradientDark: 'linear-gradient(135deg, #022c22 0%, #1e1b4b 30%, #042f2e 100%)',
    swatch: ['#f0fdfa', '#a7f3d0', '#818cf8'],
    glassLight: 'rgba(240,253,250,0.72)', glassDark: 'rgba(2,44,34,0.6)'
  },
  { key: 'system', name: '跟随系统', icon: '💻',
    accent: { 50: '#eef4ff', 400: '#598bff', 500: '#3563ff', 600: '#1e42f5' },
    swatch: ['#e2e8f0', '#64748b', '#0f172a'] },
  { key: 'custom', name: '自定义', icon: '🎨',
    accent: { 50: '#eef2ff', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5' },
    swatch: ['#e0e7ff', '#a5b4fc', '#6366f1'] }
]

// 跟随系统深色偏好的主题（light/dark/system/custom 之外均跟随系统）
const THEMES_FOLLOW_SYSTEM = THEME_PRESETS
  .map(t => t.key)
  .filter(k => !['light', 'dark', 'system', 'custom'].includes(k))

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({
    theme: 'system',
    defaultBrowser: { preset: 'system', path: '' },
    previewCacheLimitMB: 200,
    geoip: { cityMmdbPath: '', asnMmdbPath: '', allowOnlineFallback: true },
    autoValidate: { onStartup: false, intervalDays: 7 },
    proxy: { enabled: false, host: '', port: '', type: 'http', username: '', password: '' },
    backup: { enabled: false, intervalMinutes: 60 },
    customAccentColor: '',
    autoCheckUpdate: true,
    silentDownload: false,
    dataDir: '',
    workspaces: [],
    currentWorkspace: '',
    lockEnabled: false,
    lockPassword: '',
    smartFolders: [],
    organizer: {
      leftPaneWidth: 0.42,
      leftSelectedKey: 'unclassified',
      leftExpandedIds: [],
      rightSelectedKey: '',
      rightExpandedIds: [],
      lastActiveSide: 'right'
    }
  })
  const loaded = ref(false)

  async function load() {
    settings.value = await window.api.invoke('settings:get')
    loaded.value = true
    applyTheme()
    return settings.value
  }

  async function save(patch) {
    if (patch) settings.value = { ...settings.value, ...patch }
    const result = await window.api.invoke('settings:save', JSON.parse(JSON.stringify(settings.value)))
    if (result && result.error) {
      console.error('[settings] save failed:', result.error)
      return
    }
    applyTheme()
  }

  // 自动保存：监听任何设置变化，防抖 200ms 后写入磁盘
  let saveTimer = null
  watch(settings, () => {
    if (!loaded.value) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const result = await window.api.invoke('settings:save', JSON.parse(JSON.stringify(settings.value)))
      if (result && result.error) console.error('[settings] auto-save failed:', result.error)
      else applyTheme()
    }, 200)
  }, { deep: true })

  function applyTheme() {
    const root = document.documentElement
    const theme = settings.value.theme || 'system'

    // 清除所有主题 class
    root.classList.remove('dark')
    THEME_PRESETS.forEach(t => root.classList.remove('theme-' + t.key))

    let effective = theme
    if (theme === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    const preset = THEME_PRESETS.find(t => t.key === effective) || THEME_PRESETS[0]
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDarkMode = effective === 'dark' ||
      (THEMES_FOLLOW_SYSTEM.includes(effective) && systemDark)

    if (isDarkMode) root.classList.add('dark')
    if (THEMES_FOLLOW_SYSTEM.includes(effective)) root.classList.add('theme-' + effective)

    // 强调色
    const customColor = settings.value.customAccentColor
    if (effective === 'custom' && customColor) {
      root.style.setProperty('--accent-500', customColor)
      root.style.setProperty('--accent-400', lightenColor(customColor, 20))
      root.style.setProperty('--accent-600', darkenColor(customColor, 20))
      root.style.setProperty('--accent-50', customColor + '14')
    } else if (preset.accent) {
      root.style.setProperty('--accent-500', preset.accent[500])
      root.style.setProperty('--accent-400', preset.accent[400])
      root.style.setProperty('--accent-600', preset.accent[600])
      root.style.setProperty('--accent-50', preset.accent[50])
    }

    // 背景渐变
    const grad = isDarkMode
      ? (preset.gradientDark || preset.gradientLight)
      : (preset.gradientLight || preset.gradientDark)
    root.style.setProperty('--bg-gradient', grad)
    document.body.style.background = grad
    document.body.style.backgroundAttachment = 'fixed'

    // 主题感知玻璃色调
    const glassBg = isDarkMode
      ? (preset.glassDark || preset.glassLight || 'rgba(15,23,42,0.62)')
      : (preset.glassLight || preset.glassDark || 'rgba(255,255,255,0.72)')
    root.style.setProperty('--glass-bg', glassBg)
    root.style.setProperty('--glass-border', isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)')
  }

  // 颜色工具函数
  function hexToRgb(hex) {
    hex = hex.replace('#', '')
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
  }

  function lightenColor(hex, percent) {
    const [r, g, b] = hexToRgb(hex)
    const amt = Math.round(2.55 * percent)
    return rgbToHex(r + amt, g + amt, b + amt)
  }

  function darkenColor(hex, percent) {
    const [r, g, b] = hexToRgb(hex)
    const amt = Math.round(2.55 * percent)
    return rgbToHex(r - amt, g - amt, b - amt)
  }

  return { settings, loaded, load, save, applyTheme }
})
