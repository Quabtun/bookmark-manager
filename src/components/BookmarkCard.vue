<template>
  <div draggable="true"
        @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
       @dragstart="onDragStart" @dragend="onDragEnd"
       @mouseenter="onHover" @mouseleave="onLeave"
       @dblclick="onDblClick"
       @click.self="onClick"
       @contextmenu.prevent="onContext"
    :class="['group relative rounded-2xl p-3.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card',
             bmStore.isSelected(props.bm.id) ? 'ring-2 ring-accent bg-accent/5' : '',
             props.focused ? 'ring-2 ring-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : '',
             'glass border border-white/40 dark:border-slate-700/50 hover:border-brand-300',
             bm.status === 'dead' ? 'opacity-60' : '']">
    <!-- 置顶星标 -->
    <button @click.stop="bmStore.togglePin(props.bm.id)" class="absolute top-2.5 left-3 text-lg opacity-0 group-hover:opacity-100 transition-opacity z-10" :class="props.bm.pinned ? 'opacity-100' : ''" :title="props.bm.pinned ? '取消置顶' : '置顶'">
      {{ props.bm.pinned ? '⭐' : '☆' }}
    </button>
    <!-- 状态点 -->
    <span :class="['absolute top-3 right-3 w-2.5 h-2.5 rounded-full ring-2 ring-white/70 dark:ring-slate-800', statusColor]"
          :title="statusText"></span>

    <div class="flex items-start gap-3">
      <!-- 图标 -->
      <div class="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm ring-1 ring-black/5">
        <img v-if="faviconUrl" :src="faviconUrl" class="w-6 h-6 object-contain" @error="onImgError" />
        <span v-else class="text-lg font-semibold"
              :style="{ color: letterColor }">{{ letter }}</span>
      </div>

      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate" :title="bm.title">{{ bm.title || bm.url }}</div>
        <div class="text-xs text-slate-400 truncate" :title="bm.url">{{ host }}</div>
        <div v-if="bm.description" class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{{ bm.description }}</div>
      </div>
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
    <div class="mt-2" @click.stop>
      <div v-if="editingNotes" class="relative">
        <textarea ref="notesTextarea"
                  v-model="tempNotes"
                  @keydown="onNotesKeydown"
                  @blur="saveNotes"
                  class="w-full text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                  rows="2"
                  placeholder="输入备注…"></textarea>
      </div>
      <div v-else @click="startEditNotes" class="cursor-pointer text-xs truncate transition"
           :class="bm.notes ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'">
        {{ bm.notes ? bm.notes : '+ 备注' }}
      </div>
    </div>

    <!-- 悬浮操作 -->
    <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
      <button @click.stop="toggleReadStatus" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-amber-500 hover:text-white text-xs shadow" :class="currentReadStatus === 'done' ? 'bg-green-100 dark:bg-green-900/40' : currentReadStatus === 'reading' ? 'bg-blue-100 dark:bg-blue-900/40' : ''" :title="readStatusTooltip">{{ readStatusIcon }}</button>
      <button @click.stop="$emit('edit', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-brand-500 hover:text-white text-xs shadow" title="编辑">✏️</button>
      <button @click.stop="$emit('validate', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-brand-500 hover:text-white text-xs shadow" title="重新校验">🩺</button>
      <button @click.stop="$emit('geo', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-brand-500 hover:text-white text-xs shadow" title="服务器位置">📍</button>
      <button @click.stop="$emit('archive', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-amber-500 hover:text-white text-xs shadow" title="归档">📦</button>
      <button @click.stop="$emit('delete', bm)" class="w-7 h-7 rounded-lg bg-white/80 dark:bg-slate-700/80 hover:bg-red-500 hover:text-white text-xs shadow" title="删除">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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

let hoverTimer = null
function onHover() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => emit('hover', props.bm), 500)
}
function onLeave() {
  clearTimeout(hoverTimer)
  emit('leave', props.bm)
}

function onDblClick(e) {
  // 双击始终用外部浏览器打开
  e.preventDefault()
  bmStore.recordOpen(props.bm.id)
  window.api.invoke('browser:open', props.bm.url)
}

function onClick(e) {
  // Ctrl+单击 → 多选切换
  if (e && (e.ctrlKey || e.metaKey)) {
    bmStore.toggleSelect(props.bm.id)
    return
  }
  // 有选中项时，单击不清除选中（允许继续查看）
  if (bmStore.selected.size > 0) {
    bmStore.toggleSelect(props.bm.id)
    return
  }
  // 单击打开 WebPreview
  emit('open', props.bm)
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
  setTimeout(() => {
    notesTextarea.value?.focus()
  }, 50)
}

function onNotesKeydown(e) {
  if (e.key === 'Escape') {
    editingNotes.value = false
    e.preventDefault()
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    saveNotes()
    e.preventDefault()
  }
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
onMounted(() => window.addEventListener('favicon-updated', onFaviconUpdated))
onUnmounted(() => window.removeEventListener('favicon-updated', onFaviconUpdated))
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
