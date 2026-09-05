import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router.js'
import './style.css'

// 浏览器环境兜底：mock window.api，避免 pinia store 初始化时因 undefined 报错
if (typeof window !== 'undefined' && !window.api) {
  const noop = () => () => {}
  window.api = {
    invoke: async (channel) => {
      // 给常见的 list 查询返回空数组，避免 store 计算属性 .filter 报错
      if (channel === 'bm:list') return []
      if (channel === 'cat:list') return []
      if (channel === 'settings:get') return { theme: 'light', previewCacheLimitMB: 200, organizer: null }
      return {}
    },
    on: noop
  }
}

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 全局错误收集器：把 Vue 渲染错误直接显示到页面上，方便排查空白
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue error]', info, err)
  const root = document.getElementById('app')
  if (root) {
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#fee;border:2px solid #c00;color:#600;font:12px/1.5 monospace;padding:8px 12px;max-height:50vh;overflow:auto;'
    box.innerHTML = `<b>Vue error @ ${info}</b><br>` + (err && (err.stack || err.message || String(err))).toString().replace(/</g, '&lt;')
    root.appendChild(box)
  }
}
window.addEventListener('error', (e) => {
  console.error('[window error]', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
})

app.mount('#app')
