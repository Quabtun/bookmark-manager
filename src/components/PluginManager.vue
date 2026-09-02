<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center" @click.self="$emit('update:modelValue', false)">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col animate-pop">
      <div class="px-5 py-3.5 flex items-center gap-3 border-b border-slate-200/50 dark:border-slate-700/50">
        <button @click="$emit('update:modelValue', false)" class="btn-ghost text-sm">← 返回</button>
        <h3 class="text-lg font-semibold">🧩 插件管理</h3>
        <span class="ml-auto text-xs text-slate-400">{{ plugins.length }} 个插件</span>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <!-- 插件列表 -->
        <div v-if="plugins.length > 0" class="space-y-3">
          <div v-for="p in plugins" :key="p.id"
               class="rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-accent/30 transition">
            <div class="flex items-start gap-3">
              <div class="text-2xl">{{ p.icon || '📦' }}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{{ p.name }}</span>
                  <span v-if="p.blocked" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">已禁用</span>
                  <span v-else class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">已启用</span>
                </div>
                <p v-if="p.blocked" class="text-xs text-amber-600 dark:text-amber-400 mt-1">{{ p.blockedReason }}</p>
                <div class="flex gap-2 mt-2">
                  <button v-if="!p.blocked && p.hasSettings" @click="openSettings(p.id)"
                          class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
                    ⚙️ 设置
                  </button>
                  <button v-if="!p.blocked && p.hasTab" @click="openTab(p.id)"
                          class="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition">
                    📑 打开面板
                  </button>
                </div>
              </div>
              <button @click="unloadPlugin(p.id)"
                      class="text-xs px-2 py-0.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                卸载
              </button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-12">
          <div class="text-4xl mb-3">🧩</div>
          <p class="text-slate-500 text-sm mb-4">暂无已安装插件</p>
          <div class="text-left max-w-sm mx-auto bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-xs space-y-2">
            <p class="font-medium text-slate-600 dark:text-slate-300">插件开发规范：</p>
            <p>1. 在数据目录的 <code class="bg-slate-200 dark:bg-slate-600 px-1 rounded">plugins/</code> 下创建文件夹</p>
            <p>2. 添加 <code class="bg-slate-200 dark:bg-slate-600 px-1 rounded">plugin.json</code> 清单文件</p>
            <p>3. 添加 <code class="bg-slate-200 dark:bg-slate-600 px-1 rounded">index.js</code> 入口文件</p>
            <p>4. 实现 <code class="bg-slate-200 dark:bg-slate-600 px-1 rounded">activate(api)</code> 生命周期</p>
            <p class="mt-2 font-medium text-slate-600 dark:text-slate-300">plugin.json 格式：</p>
            <pre class="bg-slate-200 dark:bg-slate-600 p-2 rounded mt-1 overflow-x-auto">{
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "main": "index.js",
  "icon": "🔌"
}</pre>
            <p class="mt-2 font-medium text-slate-600 dark:text-slate-300">api 对象可用方法：</p>
            <p><code>api.getBookmarks()</code> — 获取所有书签</p>
            <p><code>api.getCategories()</code> — 获取所有分类</p>
            <p><code>api.store.get(key) / .set(key, val)</code> — 私有存储</p>
            <p><code>api.send(channel, data)</code> — 发送消息到 UI</p>
            <p><code>api.log(...)</code> — 日志输出</p>
            <button @click="reloadPlugins" class="mt-3 w-full btn-accent text-sm">重新扫描插件</button>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="mt-4 flex gap-2 justify-center">
          <button @click="reloadPlugins" class="btn-ghost text-sm">🔄 重新加载全部</button>
          <button @click="openPluginsDir" class="btn-ghost text-sm">📁 打开插件目录</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const plugins = ref([])

async function loadPlugins() {
  const list = await window.api.invoke('plugin:list')
  plugins.value = Array.isArray(list) ? list : []
}

async function reloadPlugins() {
  await window.api.invoke('plugin:unloadAll')
  const r = await window.api.invoke('plugin:loadAll')
  await loadPlugins()
  window.$toast(`已重新加载 ${r.loaded} 个插件`, 'success')
}

async function unloadPlugin(id) {
  await window.api.invoke('plugin:unload', id)
  await loadPlugins()
  window.$toast('插件已卸载', 'info')
}

async function openSettings(id) {
  const r = await window.api.invoke('plugin:getSettings', id)
  if (r && r.html) {
    // 用新窗口显示设置
    window.$toast('插件设置: ' + r.html, 'info')
  }
}

async function openTab(id) {
  const r = await window.api.invoke('plugin:getTab', id)
  if (r && r.html) {
    window.$toast('插件面板: ' + r.html, 'info')
  }
}

async function openPluginsDir() {
  await window.api.invoke('app:openDataDir')
}

onMounted(loadPlugins)
</script>
