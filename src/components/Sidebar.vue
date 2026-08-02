<template>
  <div class="shrink-0 flex select-none relative">
  <aside class="glass border-r border-white/30 dark:border-slate-700/50 flex flex-col select-none" :style="{ width: sidebarWidth + 'px' }">
    <!-- 拖拽手柄 -->
    <div class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 transition-colors z-10"
         @mousedown.prevent="startDrag"></div>
    <!-- Logo -->
    <div class="px-4 py-3.5 flex items-center gap-2.5 border-b border-slate-200/30 dark:border-slate-700/50">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent flex items-center justify-center text-white text-base" style="--tw-gradient-from: var(--accent-400); --tw-gradient-to: var(--accent-600)">★</div>
      <div class="leading-tight">
        <div class="font-semibold text-sm">书签管理器</div>
        <div class="text-[10px] text-slate-400">{{ bm.stats.total }} 个书签</div>
      </div>
    </div>

    <!-- 顶部固定导航 -->
    <nav class="px-2 py-1.5 space-y-0.5">
      <button @click="bm.activeCategory = 'all'"
              :class="['w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition',
                       bm.activeCategory === 'all' ? 'bg-accent text-white' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50']">
        <span class="text-base">📑</span><span class="flex-1 text-left">所有书签</span>
        <span class="text-[11px] opacity-70">{{ bm.stats.total }}</span>
      </button>
      <button @click="$emit('newFolder')" 
              class="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-700/50 transition">
        <span>＋</span><span>新建文件夹</span>
      </button>
    </nav>

    <!-- 分类树 -->
    <div class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-between">
      <span>分类</span>
      <button @click="$emit('manageCategories')" class="hover:text-accent text-xs" title="管理分类">⚙</button>
    </div>
    <nav class="px-2 space-y-0.5 flex-1 overflow-y-auto pb-2">
      <template v-for="node in cats.tree" :key="node.id">
        <TreeNode :node="node" :depth="0" />
      </template>

      <!-- 智能文件夹 -->
      <div v-if="smartFolders.length > 0" class="mt-3">
        <div class="px-2.5 pb-1 text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-between">
          <span>智能文件夹</span>
          <button @click="$emit('newSmartFolder')" class="hover:text-accent text-xs" title="新建智能文件夹">+</button>
        </div>
        <button v-for="sf in smartFolders" :key="sf.id"
                @click="onSmartFolderClick(sf)"
                :class="['w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition',
                         bm.activeCategory === 'smart:' + sf.id ? 'bg-accent text-white' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50']">
          <span class="text-sm">🔍</span>
          <span class="flex-1 text-left truncate text-[13px]">{{ sf.name }}</span>
          <span class="text-[10px] opacity-60">{{ getSmartFolderCount(sf.id) }}</span>
        </button>
      </div>
    </nav>

    <!-- 底部导航 -->
    <div class="p-2 border-t border-slate-200/30 dark:border-slate-700/50 space-y-0.5">
      <button @click="$emit('openSnapshots')" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
        <span>📦</span><span>快照恢复</span>
      </button>
      <button @click="$emit('openCredentials')" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
        <span>🔐</span><span>账号密码</span>
      </button>
      <button @click="$emit('openCookies')" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
        <span>🍪</span><span>Cookie 管理</span>
      </button>
      <button @click="$emit('openPlugins')" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
        <span>🧩</span><span>插件管理</span>
      </button>
      <button @click="bm.showArchived ? $emit('closeArchive') : $emit('openArchive')"
              :class="['w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition',
                       bm.showArchived ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50']">
        <span>📦</span><span>归档</span>
        <span v-if="bm.archivedCount > 0" class="ml-auto text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{{ bm.archivedCount }}</span>
      </button>
      <button @click="bm.showRecycled ? $emit('closeRecycle') : $emit('openRecycle')"
              :class="['w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition',
                       bm.showRecycled ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50']">
        <span>🗑️</span><span>回收站</span>
        <span v-if="bm.recycledCount > 0" class="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{{ bm.recycledCount }}</span>
      </button>
      <router-link to="/settings" custom v-slot="{ navigate }">
        <button @click="navigate" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
          <span>⚙️</span><span>设置</span>
        </button>
      </router-link>
      <router-link to="/stats" custom v-slot="{ navigate }">
        <button @click="navigate" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/50">
          <span>📊</span><span>统计</span>
        </button>
      </router-link>
    </div>

    <!-- 重命名弹窗 -->
    <teleport to="body">
      <div v-if="renameDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="renameDialog.visible = false">
        <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
          <h3 class="text-sm font-semibold mb-3">重命名文件夹</h3>
          <input v-model="renameDialog.name" @keydown.enter="doRename" class="input text-sm" />
          <div class="flex justify-end gap-2 mt-3">
            <button @click="renameDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="doRename" class="btn-accent text-xs">确定</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- 文件夹右键菜单 -->
    <teleport to="body">
      <div v-if="contextMenu.visible" class="fixed z-[350] w-40 glass rounded-xl shadow-glass py-1 animate-pop"
           :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <button @click="exportCategory(contextMenu.node); closeContextMenu()" class="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700">📤 导出文件夹</button>
        <button @click="startRename(contextMenu.node)" class="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700">✏️ 重命名</button>
        <button @click="duplicateCategory(contextMenu.node); closeContextMenu()" class="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700">📋 复制文件夹</button>
        <div class="border-t border-slate-200/50 dark:border-slate-700/50 my-0.5"></div>
        <button @click="deleteCategory(contextMenu.node); closeContextMenu()" class="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">🗑️ 删除</button>
      </div>
    </teleport>
  </aside>
  </div>
</template>

<script setup>
import { ref, computed, defineComponent, h, onMounted, onUnmounted } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'
import { useSettingsStore } from '../stores/settings.js'

const emit = defineEmits(['manageCategories', 'newFolder', 'openCredentials', 'openCookies', 'openSnapshots', 'openPlugins', 'newSmartFolder', 'openRecycle', 'closeRecycle', 'openArchive', 'closeArchive'])

const bm = useBookmarksStore()
const cats = useCategoriesStore()
const settingsStore = useSettingsStore()
const contextMenu = ref({ visible: false, x: 0, y: 0, node: null })
const renameDialog = ref({ visible: false, node: null, name: '' })

// 智能文件夹
const smartFolders = computed(() => settingsStore.settings.smartFolders || [])

function getSmartFolderCount(folderId) {
  return bm.smartFolderResults(folderId).length
}

function onSmartFolderClick(sf) {
  bm.activeCategory = 'smart:' + sf.id
  bm.searchQuery = sf.query || ''
  bm.statusFilter = sf.statusFilter || 'all'
  bm.tagFilter = sf.tagFilter || ''
  bm.domainFilter = sf.domainFilter || ''
  bm.dateFrom = sf.dateFrom || ''
  bm.dateTo = sf.dateTo || ''
}

// 侧边栏宽度拖拽
const SIDEBAR_WIDTH_KEY = 'sidebar-width'
const DEFAULT_WIDTH = 256 // 16rem = w-64
const sidebarWidth = ref(parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH)
let dragging = false
let dragStartX = 0
let dragStartWidth = 0

function startDrag(e) {
  dragging = true
  dragStartX = e.clientX
  dragStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDrag(e) {
  if (!dragging) return
  const delta = e.clientX - dragStartX
  sidebarWidth.value = Math.max(200, Math.min(400, dragStartWidth + delta))
}

function stopDrag() {
  if (!dragging) return
  dragging = false
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const _contextMenuHandler = () => closeContextMenu()

function showContextMenu(node, e) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node }
  setTimeout(() => document.addEventListener('click', _contextMenuHandler), 0)
}
function closeContextMenu() {
  contextMenu.value.visible = false
  document.removeEventListener('click', _contextMenuHandler)
}

function exportCategory(node) {
  closeContextMenu()
  window.api.invoke('io:exportCategory', node.id, cats.categories).then((r) => {
    if (r && r.exported) window.$toast(`已导出「${node.name}」(${r.count}个书签)`, 'success')
    else if (r && !r.canceled) window.$toast('导出失败: ' + (r.error || ''), 'warn')
  }).catch((e) => { window.$toast('导出失败: ' + (e.message || e), 'error') })
}

function startRename(node) {
  closeContextMenu()
  renameDialog.value = { visible: true, node, name: node.name }
}

async function doRename() {
  const { node, name } = renameDialog.value
  if (name && name.trim() && name.trim() !== node.name) {
    await cats.update(node.id, { name: name.trim() })
    window.$toast('已重命名', 'success')
  }
  renameDialog.value.visible = false
}

async function deleteCategory(node) {
  closeContextMenu()
  if (!window.confirm(`删除文件夹「${node.name}」？\n该文件夹下的书签将变为「未分类」。`)) return
  await cats.remove(node.id)
  // 将该分类下书签重置为未分类（categoryId 设为 null，不再强制归入 cat-other）
  for (const b of bm.bookmarks) {
    if (b.categoryId === node.id || b.manualCategoryId === node.id) {
      bm.update(b.id, { categoryId: null, manualCategoryId: null, manualSet: false }).catch(() => {})
    }
  }
  window.$toast('已删除', 'info')
}

async function duplicateCategory(node) {
  closeContextMenu()
  await cats.add({ name: node.name + ' (副本)', icon: node.icon, color: node.color, parentId: node.parentId, tags: [...(node.tags || [])] })
  window.$toast('已复制', 'success')
}

// 递归树节点组件
const TreeNode = defineComponent({
  name: 'TreeNode',
  props: { node: Object, depth: Number },
  setup(props) {
    const expanded = ref(true)
    const dragOver = ref(false)
    const hasChildren = computed(() => props.node.children && props.node.children.length > 0)
    const count = computed(() => bm.countByCategory[props.node.id] || 0)
    
    function onDrop(e) {
      dragOver.value = false
      const bmId = e.dataTransfer?.getData('text/bookmark-id') || window.__dragBookmarkId
      window.__dragBookmarkId = null
      if (bmId) {
        bm.moveToCategory(bmId, props.node.id, { manual: true })
        window.$toast && window.$toast(`已移至「${props.node.name}」`, 'success')
        return
      }
      // 拖入的是文件夹
      const catId = e.dataTransfer?.getData('text/category-id')
      if (catId && catId !== props.node.id) {
        // 防止循环引用：检查目标节点是否是被拖动节点的后代
        function isDescendant(targetId, ancestorId) {
          if (targetId === ancestorId) return true
          const node = cats.byId[targetId]
          return node && node.parentId ? isDescendant(node.parentId, ancestorId) : false
        }
        if (isDescendant(props.node.id, catId)) {
          window.$toast && window.$toast('不能将文件夹移入其子文件夹', 'warn')
          return
        }
        cats.update(catId, { parentId: props.node.id })
      }
    }

    function onDragStart(e) {
      e.dataTransfer.setData('text/category-id', props.node.id)
      e.dataTransfer.effectAllowed = 'move'
    }

    return () => [
      // 当前节点
      h('div', {
        draggable: 'true',
        class: ['flex items-center gap-0.5 px-1 py-1 rounded-lg text-sm transition group cursor-pointer',
                bm.activeCategory === props.node.id ? 'bg-accent text-white' : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50',
                dragOver.value ? 'ring-2 ring-accent' : ''],
        style: { paddingLeft: (props.depth * 14 + 4) + 'px' },
        onClick: () => bm.activeCategory = props.node.id,
        onDragstart: onDragStart,
        onDragover: (e) => { e.preventDefault(); dragOver.value = true },
        onDragleave: () => { dragOver.value = false },
        onDrop,
        onContextmenu: (e) => { e.preventDefault(); showContextMenu(props.node, e) }
      }, [
        hasChildren.value 
          ? h('span', {
              class: 'w-3.5 text-center text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 flex-shrink-0',
              onClick: (e) => { e.stopPropagation(); expanded.value = !expanded.value }
            }, expanded.value ? '▾' : '▸')
          : h('span', { class: 'w-3.5 flex-shrink-0' }),
        
        h('span', { class: 'text-sm flex-shrink-0' }, props.node.icon || '📁'),
        h('span', { class: 'flex-1 truncate text-[13px]' }, props.node.name),
        count.value > 0 ? h('span', { class: 'text-[10px] opacity-60' }, count.value) : null,
        // 导出按钮（悬停显示）
        count.value > 0 ? h('span', {
          class: 'opacity-0 group-hover:opacity-100 text-[10px] px-1 hover:bg-white/20 rounded flex-shrink-0',
          onClick: (e) => { e.stopPropagation(); exportCategory(props.node) },
          title: '导出此文件夹'
        }, '📤') : null
      ]),
      
      // 子节点（展开时显示，带折叠动画）
      expanded.value && hasChildren.value
        ? h('div', { class: 'overflow-hidden', style: { transition: 'max-height 0.2s ease' } },
            props.node.children.map(child => h(TreeNode, { node: child, depth: props.depth + 1, key: child.id }))
          )
        : null
    ]
  }
})

onUnmounted(() => {
  if (dragging) {
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
  }
})
</script>
