<template>
  <div class="px-5 py-3 flex items-center gap-3 border-b border-[var(--stroke-subtle)] bg-[var(--surface-base)] backdrop-blur-xl">
    <!-- 搜索 -->
    <div class="relative flex-1 max-w-md">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
      <input v-model="bm.searchQuery" placeholder="搜索书签、URL、标签… (Ctrl+K)"
             ref="searchInput"
             @focus="emit('onSearchFocus')" @blur="emit('onSearchBlur')" @input="emit('onSearchInput')"
             class="input pl-9" />
      <!-- 搜索建议下拉 -->
      <div v-if="showSearchSuggestions && searchHistory && searchHistory.length > 0"
           class="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-glass border border-slate-200 dark:border-slate-700 py-1 z-50 max-h-48 overflow-y-auto">
        <div v-for="q in searchHistory.filter(h => !bm.searchQuery || h.toLowerCase().includes(bm.searchQuery.toLowerCase()))" :key="q"
             @mousedown.prevent="emit('selectSearchSuggestion', q)"
             class="px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2">
          <span class="text-slate-400">🕐</span>
          <span>{{ q }}</span>
        </div>
      </div>
    </div>

    <!-- 高级筛选按钮 -->
    <div class="relative" ref="filterContainer">
    <button @click="filterOpen = !filterOpen"
            :class="['px-2.5 py-1.5 text-xs rounded-lg border transition', hasActiveFilter ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600']"
            title="高级筛选">
      &#9881; 筛选
    </button>
    <teleport to="body">
      <div v-if="filterOpen" class="fixed z-[300] w-72 glass rounded-xl shadow-glass p-4 animate-pop"
           :style="{ right: filterRight + 'px', top: filterTop + 'px' }">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium">高级筛选</span>
          <button @click="clearFilters" class="text-xs text-slate-400 hover:text-slate-600">清除</button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">添加时间 - 起</label>
            <input type="date" v-model="bm.dateFrom" class="input text-sm w-full" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">添加时间 - 止</label>
            <input type="date" v-model="bm.dateTo" class="input text-sm w-full" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">域名过滤（逗号分隔）</label>
            <input type="text" v-model="bm.domainFilter" class="input text-sm w-full" placeholder="例如: github.com, vuejs.org" />
          </div>
        </div>
      </div>
    </teleport>
    </div>

    <div class="flex-1"></div>

    <!-- 状态筛选 -->
    <select v-model="bm.statusFilter" class="input w-auto text-sm">
      <option value="all">全部状态</option>
      <option value="ok">✅ 正常</option>
      <option value="warn">⚠️ 异常</option>
      <option value="dead">💀 失效</option>
      <option value="redirect">🔁 跳转</option>
      <option value="unknown">❓ 未检查</option>
    </select>

    <!-- 阅读状态筛选 -->
    <select v-model="bm.readFilter" class="input w-auto text-sm">
      <option value="">阅读状态</option>
      <option value="unread">📖 未读</option>
      <option value="reading">📖 在读</option>
      <option value="done">✅ 已读</option>
    </select>

    <!-- 排序 -->
    <div class="flex items-center gap-0.5 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
      <button @click="bm.setSort('title')" :class="sortBtnClass('title')" title="按标题排序">Aa</button>
      <button @click="bm.setSort('frequency')" :class="sortBtnClass('frequency')" title="按常用排序">🔥</button>
      <button @click="bm.setSort('addedAt')" :class="sortBtnClass('addedAt')" title="按添加时间排序">📅</button>
      <button @click="bm.setSort('status')" :class="sortBtnClass('status')" title="按状态排序">🩺</button>
      <button @click="bm.setSort('url')" :class="sortBtnClass('url')" title="按 URL 排序">🔗</button>
    </div>

    <!-- 分组切换 -->
    <button @click="bm.groupByCategory = !bm.groupByCategory"
            :class="['px-2.5 py-1.5 text-xs rounded-lg border transition', bm.groupByCategory ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600']"
            title="按分类分组显示">
      📁
    </button>

    <!-- 标签筛选 -->
    <div class="relative" ref="tagFilterContainer">
      <button @click="tagFilterOpen = !tagFilterOpen"
              :class="['px-2.5 py-1.5 text-xs rounded-lg border transition', bm.tagFilter ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600']"
              title="按标签筛选">
        # {{ bm.tagFilter || '标签' }}
      </button>
      <teleport to="body">
        <div v-if="tagFilterOpen" class="fixed z-[300] w-52 glass rounded-xl shadow-glass py-1 animate-pop max-h-64 overflow-y-auto"
             :style="{ right: tagFilterRight + 'px', top: tagFilterTop + 'px' }">
          <button @click="bm.tagFilter = ''; tagFilterOpen = false"
                  :class="['w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700', !bm.tagFilter ? 'text-accent font-medium' : '']">
            全部标签
          </button>
          <button v-for="t in bm.allTags" :key="t.tag"
                  @click="bm.tagFilter = t.tag; tagFilterOpen = false"
                  :class="['w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700', bm.tagFilter === t.tag ? 'bg-accent/10 text-accent font-medium' : '']">
            <span>#{{ t.tag }}</span>
            <span class="text-slate-400">{{ t.count }}</span>
          </button>
        </div>
      </teleport>
    </div>

    <!-- 视图切换 -->
    <div class="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
      <button @click="$emit('update:ui_viewMode', 'grid')" :class="['px-3 py-1.5 text-sm', ui_viewMode==='grid' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-700']">⊞</button>
      <button @click="$emit('update:ui_viewMode', 'list')" :class="['px-3 py-1.5 text-sm', ui_viewMode==='list' ? 'bg-accent text-white' : 'bg-white dark:bg-slate-700']">☰</button>
    </div>

    <div class="w-px h-6 bg-slate-200 dark:bg-slate-600"></div>

    <!-- 操作按钮 -->
    <button @click="$emit('add')" class="btn-primary">＋ 新建</button>
    <button @click="$emit('validateAll')" class="btn-ghost" title="校验所有书签">🩺 校验</button>
    <button @click="$emit('loadAllPreviews')" class="btn-ghost" title="加载所有预览">🖼️ 预览</button>
    <button @click="$emit('autoClassify')" class="btn-ghost" title="自动分类所有书签">🤖 自动分类</button>
    <button @click="$emit('refreshAllFavicons')" class="btn-ghost" title="重新抓取所有图标">🔄 刷新图标</button>
    <button @click="$emit('removeDuplicates')" class="btn-ghost" title="移除重复URL的书签">🔁 去重</button>
    <button @click="$emit('clearAll')" class="btn-ghost text-red-400 hover:text-red-600" title="清除所有书签">🗑️ 清空</button>
    <button v-if="bm.selected.size > 0" @click="$emit('archiveSelected')" class="btn-ghost text-amber-500 hover:text-amber-600" :title="`归档选中 ${bm.selected.size} 项`">📦 归档选中</button>

    <!-- 专注模式 -->
    <button @click="bm.focusMode = !bm.focusMode"
            :class="['px-2.5 py-1.5 text-xs rounded-lg border transition', bm.focusMode ? 'bg-accent text-white border-accent' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600']"
            title="专注模式 (Ctrl+Shift+F)">
      🎯
    </button>

    <!-- 导入导出菜单（teleport到body避免被glass backdrop-blur遮挡） -->
    <div class="relative" ref="menuContainer">
      <button @click="toggleMenu" class="btn-ghost">⋯</button>
    </div>
    <teleport to="body">
      <div v-if="menuOpen" class="fixed z-[300] glass rounded-xl shadow-glass py-1 animate-pop"
           :style="{ right: menuRight + 'px', top: menuTop + 'px', width: '208px' }">
        <div class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">导入</div>
        <button @click="onMenuAction('importHtml')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">📄 从 HTML 文件导入</button>
        <button @click="onMenuAction('importCsv')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">📊 从 CSV 导入</button>
        <button @click="onMenuBrowser(b)" v-for="b in detectedBrowsers" :key="b.browser"
                class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
          {{ b.icon }} 从 {{ b.name }} 导入
        </button>
        <button @click="onMenuAction('importPocketCsv')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">🐶 从 Pocket 导入</button>
        <div class="border-t border-slate-200/50 dark:border-slate-700/50 my-1"></div>
        <div class="text-[10px] uppercase tracking-wide text-slate-400 px-3 py-1">导出</div>
        <button @click="onMenuAction('exportHtml')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">📤 导出 Chrome 书签</button>
        <button @click="onMenuAction('exportStyledHtml')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">🌐 导出为网页</button>
        <button @click="onMenuAction('exportMarkdown')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">📝 导出为 Markdown</button>
        <button @click="onMenuAction('exportJson')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">💾 导出 JSON 备份</button>
        <div class="border-t border-slate-200/50 dark:border-slate-700/50 my-1"></div>
        <button @click="onMenuAction('importJson')" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">♻️ 导入 JSON 备份</button>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'

const props = defineProps({
  ui_viewMode: String,
  searchHistory: Array,
  showSearchSuggestions: Boolean
})
const emit = defineEmits(['add', 'validateAll', 'loadAllPreviews', 'autoClassify', 'refreshAllFavicons', 'removeDuplicates', 'clearAll', 'archiveSelected', 'update:ui_viewMode', 'importHtml', 'exportHtml', 'exportJson', 'exportStyledHtml', 'exportMarkdown', 'importJson', 'importCsv', 'importFromBrowser', 'importPocketCsv', 'selectSearchSuggestion', 'onSearchBlur', 'onSearchFocus', 'onSearchInput'])

const bm = useBookmarksStore()
const menuOpen = ref(false)
const tagFilterOpen = ref(false)
const filterOpen = ref(false)
const filterContainer = ref(null)
const filterTop = ref(0)
const filterRight = ref(0)
const searchInput = ref(null)
const menuContainer = ref(null)
const tagFilterContainer = ref(null)
const detectedBrowsers = ref([])
const menuTop = ref(0)
const menuRight = ref(0)
const tagFilterTop = ref(0)
const tagFilterRight = ref(0)

const hasActiveFilter = computed(() => bm.dateFrom || bm.dateTo || bm.domainFilter.trim())

function clearFilters() {
  bm.dateFrom = ''
  bm.dateTo = ''
  bm.domainFilter = ''
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    // 计算菜单固定定位
    if (menuContainer.value) {
      const rect = menuContainer.value.getBoundingClientRect()
      menuTop.value = rect.bottom + 4
      menuRight.value = window.innerWidth - rect.right
    }
    setTimeout(() => document.addEventListener('click', onClickOutside), 0)
    if (detectedBrowsers.value.length === 0) {
      try {
        window.api.invoke('io:detectBrowsers').then((r) => {
          if (Array.isArray(r)) detectedBrowsers.value = r
        }).catch(() => {})
      } catch { /* api not ready */ }
    }
  }
}

function onClickOutside(e) {
  if (menuContainer.value && !menuContainer.value.contains(e.target)) {
    menuOpen.value = false
    document.removeEventListener('click', onClickOutside)
  }
}

function onMenuAction(name) {
  menuOpen.value = false
  document.removeEventListener('click', onClickOutside)
  emit(name)
}

function onMenuBrowser(b) {
  menuOpen.value = false
  document.removeEventListener('click', onClickOutside)
  emit('importFromBrowser', b)
}

function sortBtnClass(field) {
  const active = bm.sortBy === field
  const base = 'px-2.5 py-1.5 text-xs transition'
  return active ? base + ' bg-accent text-white' : base + ' bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600'
}

// Ctrl+K 聚焦搜索
function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value && searchInput.value.focus()
  }
}

function closeTagFilter(e) {
  if (tagFilterContainer.value && !tagFilterContainer.value.contains(e.target)) {
    tagFilterOpen.value = false
    document.removeEventListener('click', closeTagFilter)
  }
}

// 标签筛选位置
watch(tagFilterOpen, (v) => {
  if (v) {
    nextTick(() => {
      if (tagFilterContainer.value) {
        const rect = tagFilterContainer.value.getBoundingClientRect()
        tagFilterTop.value = rect.bottom + 4
        tagFilterRight.value = window.innerWidth - rect.right
      }
      setTimeout(() => document.addEventListener('click', closeTagFilter), 0)
    })
  }
})

// 高级筛选位置
watch(filterOpen, (v) => {
  if (v) {
    nextTick(() => {
      if (filterContainer.value) {
        const rect = filterContainer.value.getBoundingClientRect()
        filterTop.value = rect.bottom + 4
        filterRight.value = window.innerWidth - rect.right
      }
      setTimeout(() => document.addEventListener('click', closeFilter), 0)
    })
  }
})

function closeFilter(e) {
  if (filterContainer.value && !filterContainer.value.contains(e.target)) {
    filterOpen.value = false
    document.removeEventListener('click', closeFilter)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('click', closeTagFilter)
  document.removeEventListener('click', closeFilter)
})
</script>
