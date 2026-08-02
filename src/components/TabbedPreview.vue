<template>
  <!-- 多标签 WebPreview 底部 Tab 栏 -->
  <div v-if="tabs.length > 0"
       class="absolute bottom-0 left-0 right-0 z-50 flex items-center bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-700/50"
       style="height: 40px;">
    <!-- Tab 列表 -->
    <div class="flex-1 flex items-center overflow-x-auto gap-0.5 px-1" style="scrollbar-width: none;">
      <button v-for="tab in tabs" :key="tab.id"
              @click="$emit('select', tab.id)"
              :class="['flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs transition max-w-[180px]',
                       tab.id === activeTabId
                         ? 'bg-accent text-white shadow-sm'
                         : 'bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-600']">
        <span class="truncate flex-1 min-w-0">{{ tab.title || '加载中…' }}</span>
        <span @click.stop="$emit('close', tab.id)"
              class="w-4 h-4 rounded flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-red-500 hover:text-white transition text-[10px]">&times;</span>
      </button>
    </div>
    <!-- 右侧操作 -->
    <div class="flex items-center gap-1 pr-1">
      <button @click="$emit('closeAll')" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-xs opacity-50 hover:opacity-100 transition" title="关闭全部">✕</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  tabs: { type: Array, default: () => [] },
  activeTabId: String
})
defineEmits(['select', 'close', 'closeAll'])
</script>
