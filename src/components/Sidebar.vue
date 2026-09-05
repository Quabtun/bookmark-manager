<template>
  <aside :class="['shrink-0 h-full flex flex-col bg-white/80 dark:bg-slate-900/80 border-r border-slate-200/70 dark:border-slate-700/60 transition-[width] duration-200',
                   collapsed ? 'w-7' : 'w-60']">

    <!-- 收纳按键（始终可见；展开态贴右上，折叠态居中于窄条中段） -->
    <button @click="$emit('update:collapsed', !collapsed)"
            :class="['flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-700/60 transition shrink-0',
                     collapsed ? 'h-full' : 'self-end mr-1 mt-1 w-6 h-6 rounded-md text-[11px]']"
            :title="collapsed ? '展开侧边栏' : '向左收纳侧边栏'">
      <span :class="collapsed ? 'rotate-0' : 'rotate-180'" class="leading-none">▶</span>
    </button>

    <!-- 功能入口列表（6 项纵向排列；折叠后隐藏） -->
    <div v-show="!collapsed" class="px-1.5 py-2 space-y-0.5">
      <button @click="$emit('open-credentials')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="账号密码">
        <span>🔑</span><span class="flex-1">凭证</span>
      </button>
      <button @click="$emit('open-cookies')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="Cookie">
        <span>🍪</span><span class="flex-1">Cookie</span>
      </button>
      <button @click="$emit('open-plugins')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="插件">
        <span>🧩</span><span class="flex-1">插件</span>
      </button>
      <button @click="$emit('open-snapshots')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="快照">
        <span>📸</span><span class="flex-1">快照</span>
      </button>
      <button @click="$emit('open-recycle')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="回收站">
        <span>🗑️</span><span class="flex-1">回收站</span>
      </button>
      <button @click="$emit('open-archive')"
              class="w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
              title="归档">
        <span>📦</span><span class="flex-1">归档</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
// Sidebar 只承载 6 个功能入口 + 整窗收纳开关；保留 emit 列表（HomeView 还在监听）。
defineProps({
  collapsed: { type: Boolean, default: false }
})

defineEmits([
  'update:collapsed',
  'new-folder',
  'open-snapshots',
  'open-credentials',
  'open-cookies',
  'open-plugins',
  'open-recycle',
  'open-archive'
])
</script>
