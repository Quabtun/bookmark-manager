<template>
  <div data-bookmark-card draggable="true"
        @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
       @dragstart="onDragStart" @dragend="onDragEnd"
       @mouseenter="onHover" @mouseleave="onLeave"
       @dblclick="onDblClick"
       @click="onClick"
       @contextmenu.prevent="onContext"
    :class="['group relative rounded-lg p-3 cursor-pointer transition-all duration-150 hover:shadow-card select-none',
             bmStore.isSelected(props.bm.id) ? 'ring-2 ring-accent bg-accent/5' : '',
             props.focused ? 'ring-2 ring-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : '',
             'win-surface hover:border-accent/40',
             bm.status === 'dead' ? 'opacity-60' : '']"
     style="padding-bottom: 2.5rem;">
    <!-- 置顶星标 -->
    <button draggable="false" @click.stop="bmStore.togglePin(props.bm.id)" class="absolute top-2.5 left-3 text-lg opacity-0 group-hover:opacity-100 transition-opacity z-10" :class="props.bm.pinned ? 'opacity-100' : ''" :title="props.bm.pinned ? '取消置顶' : '置顶'">
      {{ props.bm.pinned ? '⭐' : '☆' }}
    </button>
    <!-- 状态点 -->
    <span :class="['absolute top-3 right-3 w-2.5 h-2.5 rounded-full ring-2 ring-white/70 dark:ring-slate-800', statusColor]"
          :title="statusText"></span>

    <!-- 网页截图缩略图（有截图时显示为卡片顶部 banner） -->
    <div v-if="screenshotUrl" class="relative -mx-3 -mt-3 mb-3 h-32 overflow-hidden rounded-t-lg bg-slate-100 dark:bg-slate-800">
      <img :src="screenshotUrl" class="w-full h-full object-cover object-top" @error="onScreenshotError" loading="lazy" />
      <!-- 截图加载中遮罩 -->
      <div v-if="capturing" class="absolute inset-0 flex items-center justify-center bg-slate-200/60 dark:bg-slate-900/60">
        <span class="text-xs text-slate-500 animate-pulse">截图生成中…</span>
      </div>
    </div>

    <div class="flex items-start gap-3">
      <!-- 图标（无截图时作为主图标，有截图时缩小为辅助标识） -->
      <div :class="['rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm ring-1 ring-black/5',
                     screenshotUrl ? 'w-7 h-7' : 'w-10 h-10']">
        <img v-if="faviconUrl" :src="faviconUrl" :class="screenshotUrl ? 'w-4 h-4 object-contain' : 'w-6 h-6 object-contain'" @error="onImgError" />
        <span v-else :class="screenshotUrl ? 'text-xs font-semibold' : 'text-lg font-semibold'"
              :style="{ color: letterColor }">{{ letter }}</span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate" :title="bm.title">{{ bm.title || bm.url }}</div>
        <div class="text-xs text-slate-400 truncate" :title="bm.url">{{ host }}</div>
        <div v-if="bm.description" class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{{ bm.description }}</div>
      </div>

      <!-- 截图操作按钮 -->
      <button v-if="!screenshotUrl" @click.stop="captureShot" class="shrink-0 w-7 h-7 rounded-lg bg-white/60 dark:bg-slate-700/60 hover:bg-accent hover:text-white text-xs shadow-sm transition" title="生成网页截图">📷</button>
      <button v-else @click.stop="recaptureShot" class="shrink-0 w-7 h-7 rounded-lg bg-white/60 dark:bg-slate-700/60 hover:bg-accent hover:text-white text-xs shadow-sm transition" title="重新截图">🔄</button>
    </div>

    <!-- 底部标签 -->
    <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
      <span v-if="cat" class="chip" :style="{ background: cat.color + '22', color: cat.color }">
        {{ cat.icon }} {{ cat.name }}
      </span>
      <span v-if="bm.manualSet" class="chip" title="手动分类">✋ 手动</span>
      <span v-if="bm.tags && bm.tags.length" v-for="t in bm.tags.slice(0,2)" :key="t" class="chip">#{{ t }}</span>
      <span v-if="geoText" class="chip" :title="geoTextFull">📍 {{ geoText }}</span>
      <span v-if="readStatusLabel" class="chip" :class="readStatusChipClass">{{ readStatusLabel }}</span>
    </div>

    <!-- 快速备注 -->
    <div class="mt-2" @click.stop @mousedown.stop @dblclick.stop @mouseup.stop
         @contextmenu.stop @keydown.stop @keyup.stop @input.stop @focus.stop>
      <div v-if="editingNotes" class="relative">
        <textarea ref="notesTextarea"
                  v-model="tempNotes"
                  @keydown.exact="onNotesKeydown"
                  @keyup.exact.stop
                  @blur="saveNotes"
                  @input="autoresize"
                  @mousedown.stop
                  @click.stop
                  @dblclick.stop
                  @contextmenu.stop
                  class="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-accent overflow-hidden"
                  rows="1"
                  placeholder="输入备注… Shift+Enter 换行"></textarea>
      </div>
      <div v-else @click="startEditNotes"
           :title="bm.notes"
           class="cursor-pointer text-xs break-words whitespace-pre-wrap leading-snug max-h-16 overflow-hidden"
           :class="bm.notes ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'">
        {{ bm.notes ? bm.notes : '+ 备注' }}
      </div>
    </div>

    <!-- 悬浮操作 -->
    <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition z-30"
         @click.stop @dblclick.stop @mousedown.stop @mouseup.stop
         @contextmenu.stop @dragstart.stop @dragend.stop>
      <button draggable="false" @click.stop="toggleReadStatus" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-amber-500 hover:text-white text-xs shadow" :class="currentReadStatus === 'done' ? 'bg-green-100 dark:bg-green-900/40' : currentReadStatus === 'reading' ? 'bg-blue-100 dark:bg-blue-900/40' : ''" :title="readStatusTooltip">{{ readStatusIcon }}</button>
      <button draggable="false" @click.stop="$emit('edit', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-accent hover:text-white text-xs shadow" title="编辑">✏️</button>
      <button draggable="false" @click.stop="$emit('validate', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-accent hover:text-white text-xs shadow" title="重新校验">🩺</button>
      <button draggable="false" @click.stop="$emit('geo', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-accent hover:text-white text-xs shadow" title="服务器位置">📍</button>
      <!-- 回收站/归档视图下用恢复按钮替代归档/删除 -->
      <template v-if="bm.recycled">
        <button draggable="false" @click.stop="$emit('restore', bm)" class="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/40 hover:bg-green-500 hover:text-white text-xs shadow" title="还原（恢复到书签列表）">↩️</button>
        <button draggable="false" @click.stop="$emit('delete', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-red-500 hover:text-white text-xs shadow" title="永久删除">✕</button>
      </template>
      <template v-else-if="bm.archived">
        <button draggable="false" @click.stop="$emit('unarchive', bm)" class="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/40 hover:bg-green-500 hover:text-white text-xs shadow" title="还原（取消归档）">↩️</button>
        <button draggable="false" @click.stop="$emit('delete', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-red-500 hover:text-white text-xs shadow" title="永久删除">✕</button>
      </template>
      <template v-else>
        <button draggable="false" @click.stop="$emit('archive', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-amber-500 hover:text-white text-xs shadow" title="归档">📦</button>
        <button draggable="false" @click.stop="$emit('delete', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-red-500 hover:text-white text-xs shadow" title="删除">✕</button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useCategoriesStore } from '../stores/categories.js'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useUiStore } from '../stores/ui.js'

const props = defineProps({ bm: Object, viewMode: String, focused: Boolean })
const emit = defineEmits(['edit', 'validate', 'geo', 'delete', 'open', 'hover', 'leave', 'context', 'reorder', 'dragOver', 'dragLeave', 'archive', 'quickNote'])

const cats = useCategoriesStore()
const bmStore = useBookmarksStore()
const ui = useUiStore()

const faviconUrl = ref(null)
const imgError = ref(false)
const screenshotUrl = ref(null)
const capturing = ref(false)

const cat = computed(() => cats.byId[props.bm.categoryId])
const host = computed(() => { try { return new URL(props.bm.url).hostname } catch { return props.bm.url } })
const letter = computed(() => (props.bm.title || host.value || '?').charAt(0).toUpperCase())
const letterColor = computed(() => cat.value?.color || '#64748b')

const statusColor = computed(() => ({
  ok: 'bg-green-500', redirect: 'bg-blue-400', warn: 'bg-amber-400',
  dead: 'bg-red-500', unknown: 'bg-slate-300'
}[props.bm.status || 'unknown']))
const statusText = computed(() => ({
  ok: '正常', redirect: '跳转', warn: '异常', dead: '失效', unknown: '未检查'
}[props.bm.status || 'unknown']))

const geoText = computed(() => {
  const g = props.bm.geo
  if (!g || g.error) return ''
  return [g.country, g.city].filter(Boolean).join(' ')
})
const geoTextFull = computed(() => {
  const g = props.bm.geo
  if (!g) return '点击查询服务器位置'
  if (g.error) return '查询失败：' + g.error
  return [g.country, g.region, g.city, g.isp && ('服务商: ' + g.isp), g.asn && ('ASN: ' + g.asn), '(' + (g.source === 'offline' ? '离线' : g.source === 'online' ? '在线兜底' : '未知') + ')'].filter(Boolean).join(' / ')
})

async function loadFavicon() {
  imgError.value = false
  if (props.bm.favicon) {
    faviconUrl.value = await ui.getFavicon(props.bm.favicon)
  } else {
    faviconUrl.value = null
  }
}
watch(() => props.bm.favicon, loadFavicon, { immediate: true })

// 加载网页截图
async function loadScreenshot() {
  if (props.bm.screenshot) {
    screenshotUrl.value = await ui.getScreenshot(props.bm.url)
  } else {
    screenshotUrl.value = null
  }
}
watch(() => props.bm.screenshot, loadScreenshot, { immediate: true })

// 手动触发截图
async function captureShot() {
  capturing.value = true
  try {
    const result = await ui.captureScreenshot(props.bm.url)
    if (result.ok) {
      bmStore.update(props.bm.id, { screenshot: result.file }).catch(() => {})
      await loadScreenshot()
    }
  } catch { /* ignore */ }
  capturing.value = false
}

// 重新截图（先清除缓存再重新捕获）
async function recaptureShot() {
  ui.clearScreenshot(props.bm.url)
  await captureShot()
}

function onScreenshotError() {
  screenshotUrl.value = null
}

// 自动检测服务器位置（不直接修改 props，通过 store 更新）
async function autoGeoLookup() {
  if (props.bm.geo) return
  try {
    const r = await window.api.invoke('geo:lookup', props.bm.url)
    if (r && !r.error) bmStore.update(props.bm.id, { geo: r }).catch(() => {})
  } catch { /* 静默失败 */ }
}
autoGeoLookup()
function onImgError() { imgError.value = true; faviconUrl.value = null }

function onDragStart(e) {
  window.__dragBookmarkId = props.bm.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/bookmark-id', props.bm.id)
  e.dataTransfer.setData('text/plain', `bookmark:${props.bm.id}:${props.bm.categoryId || ''}`)
}

function onDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  // 通知父组件高亮放置位置
  emit('dragOver', props.bm.id, 'before')
}

function onDragLeave() {
  emit('dragLeave', props.bm.id)
}

function onDrop(e) {
  e.preventDefault()
  const draggedId = window.__dragBookmarkId
  window.__dragBookmarkId = null
  if (draggedId && draggedId !== props.bm.id) {
    emit('reorder', { dragId: draggedId, dropId: props.bm.id, position: 'before' })
  }
  emit('dragLeave', props.bm.id)
}
function onDragEnd() { window.__dragBookmarkId = null }

function onHover() {
  // 延迟由 HomeView.onHover 控制（300ms），这里直接转发避免双重计时
  emit('hover', props.bm)
}
function onLeave() {
  emit('leave', props.bm)
}

function onDblClick(e) {
  // 双击：内部 WebPreview 预览（自动打开/激活右侧预览栏）
  // Ctrl/Cmd+双击：跳外部默认浏览器
  e.preventDefault()
  if (e && (e.ctrlKey || e.metaKey)) {
    bmStore.recordOpen(props.bm.id)
    window.api.invoke('browser:open', props.bm.url)
    return
  }
  bmStore.recordOpen(props.bm.id)
  emit('open', props.bm)
}

function onClick(e) {
  // Ctrl/Cmd+单击 → 多选切换（原有行为）
  if (e && (e.ctrlKey || e.metaKey)) {
    bmStore.toggleSelect(props.bm.id)
    return
  }
  // Shift+单击 → 范围选择（从最近点击的锚点到当前）
  if (e && e.shiftKey) {
    const all = bmStore.bookmarks.filter((b) => !b.recycled && !b.archived).map((b) => b.id)
    const last = bmStore.__lastClickedId || props.bm.id
    const a = all.indexOf(last)
    const b = all.indexOf(props.bm.id)
    if (a !== -1 && b !== -1) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const next = new Set(bmStore.selected)
      for (let i = lo; i <= hi; i++) next.add(all[i])
      bmStore.selected = next
    }
    bmStore.__lastClickedId = props.bm.id
    return
  }
  // 普通单击 → 不再切换选中，避免误触
  // （保留 Ctrl/Cmd 切换与 Shift 范围选择）
}
function onContext(e) {
  emit('context', props.bm, e)
}

// 阅读状态
const READ_STATUS_CYCLE = ['unread', 'reading', 'done']
const currentReadStatus = computed(() => props.bm.readStatus || 'unread')
const readStatusIcon = computed(() => {
  const s = currentReadStatus.value
  if (s === 'done') return '✅'
  if (s === 'reading') return '📖'
  return '📖'
})
const readStatusTooltip = computed(() => {
  const s = currentReadStatus.value
  if (s === 'done') return '已读（点击切换为未读）'
  if (s === 'reading') return '在读（点击切换为已读）'
  return '想读（点击切换为在读）'
})
const readStatusLabel = computed(() => {
  const s = currentReadStatus.value
  if (s === 'done') return '已读'
  if (s === 'reading') return '在读'
  return ''
})
const readStatusChipClass = computed(() => {
  const s = currentReadStatus.value
  if (s === 'done') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
  if (s === 'reading') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
  return ''
})

function toggleReadStatus() {
  const idx = READ_STATUS_CYCLE.indexOf(currentReadStatus.value)
  const next = READ_STATUS_CYCLE[(idx + 1) % READ_STATUS_CYCLE.length]
  bmStore.setReadStatus(props.bm.id, next)
}

// 快速备注
const editingNotes = ref(false)
const tempNotes = ref('')
const notesTextarea = ref(null)

function startEditNotes() {
  editingNotes.value = true
  tempNotes.value = props.bm.notes || ''
  nextTick(() => {
    autoresize()
    notesTextarea.value?.focus()
    // 将光标移到末尾
    if (notesTextarea.value) {
      const ta = notesTextarea.value
      ta.selectionStart = ta.selectionEnd = ta.value.length
    }
  })
}

function onNotesKeydown(e) {
  if (e.key === 'Escape') {
    editingNotes.value = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    saveNotes()
    e.preventDefault()
    e.stopPropagation()
  }
}

function autoresize() {
  const ta = notesTextarea.value
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
}

function saveNotes() {
  if (!editingNotes.value) return
  editingNotes.value = false
  const newNotes = tempNotes.value.trim()
  if (newNotes !== (props.bm.notes || '')) {
    emit('quickNote', { id: props.bm.id, notes: newNotes })
  }
}

// 监听 favicon 更新事件（组件卸载时清理，避免泄漏）
function onFaviconUpdated(e) {
  if (e.detail.id === props.bm.id) {
    bmStore.update(props.bm.id, { favicon: e.detail.favicon }).catch(() => {})
    ui.clearFavicon(e.detail.favicon)
    loadFavicon()
  }
}
onMounted(() => {
  window.addEventListener('favicon-updated', onFaviconUpdated)
  window.addEventListener('screenshot-updated', onScreenshotUpdated)
})
onUnmounted(() => {
  window.removeEventListener('favicon-updated', onFaviconUpdated)
  window.removeEventListener('screenshot-updated', onScreenshotUpdated)
})

// 监听截图更新事件
function onScreenshotUpdated(e) {
  if (e.detail.id === props.bm.id) {
    bmStore.update(props.bm.id, { screenshot: e.detail.screenshot }).catch(() => {})
    ui.clearScreenshot(props.bm.url)
    loadScreenshot()
  }
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
