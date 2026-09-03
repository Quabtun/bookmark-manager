<template>
  <section class="flex flex-col h-full min-w-0 bg-[var(--surface-subtle)] border border-[var(--stroke-subtle)] rounded-2xl overflow-hidden">
    <!-- 顶部：标题 + 当前选中文件夹 + 工具按钮 -->
    <header class="px-3 py-2 flex items-center gap-2 border-b border-[var(--stroke-subtle)] backdrop-blur-xl"
            :class="side === 'left' ? 'bg-amber-50/60 dark:bg-amber-900/15' : 'bg-sky-50/60 dark:bg-sky-900/15'">
      <span class="text-base">{{ side === 'left' ? '📥' : '🗂️' }}</span>
      <div class="leading-tight flex-1 min-w-0">
        <div class="text-[13px] font-semibold truncate">
          {{ side === 'left' ? '待分类区' : '分类区' }}
        </div>
        <div class="text-[10px] text-slate-400 truncate">
          {{ headerSubtitle }}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button v-if="side === 'left' && selectedKey && selectedKey !== 'all' && selectedKey !== 'unclassified'"
                @click="selectKey('unclassified')"
                class="text-[10px] px-2 py-0.5 rounded-md hover:bg-slate-200/70 dark:hover:bg-slate-700/60">
          返回未分类
        </button>
        <button @click="$emit('new-folder')"
                class="text-[10px] px-2 py-0.5 rounded-md bg-accent text-white hover:bg-accent-600">
          ＋ 新建文件夹
        </button>
      </div>
    </header>

    <!-- 主体：左侧树 + 右侧书签列表 -->
    <div class="flex-1 grid min-h-0" :style="gridStyle">
      <!-- 分类树 -->
      <div class="overflow-y-auto px-1.5 py-2 border-r border-[var(--stroke-subtle)] min-h-0"
           :class="side === 'left' ? 'bg-white/30 dark:bg-slate-900/30' : ''">
        <div class="px-2 pb-1 text-[10px] uppercase tracking-wide text-slate-400 flex items-center justify-between">
          <span>{{ side === 'left' ? '筛选' : '分类' }}</span>
          <button v-if="side === 'right'" @click="expandAll" class="text-[10px] hover:text-accent normal-case tracking-normal">
            全部展开
          </button>
        </div>
        <CategoryTree
          :nodes="treeNodes"
          :expanded-ids="side === 'left' ? viewState.organizer.leftExpandedIds : viewState.organizer.rightExpandedIds"
          :selected-id="selectedKey"
          :on-drop-bookmark="handleDropBookmark"
          :on-drop-category="side === 'right' ? handleDropCategory : null"
          :on-select="selectKey"
          :on-toggle-expand="toggleExpand"
          :on-context-menu="openContextMenu"
          :empty-text="side === 'left' ? '没有可显示的分组' : '暂无分类'"
        />
      </div>

      <!-- 书签列表 -->
      <div class="overflow-y-auto px-3 py-2 min-w-0 min-h-0"
           :class="side === 'left' ? 'bg-white/30 dark:bg-slate-900/30' : ''"
           @dragover.prevent="onListDragOver"
           @drop.prevent="onListDrop"
           @dragleave="onListDragLeave"
           @contextmenu.prevent="openSurfaceMenu">
        <div v-if="emptyHint" class="h-full flex items-center justify-center text-xs text-slate-400">
          {{ emptyHint }}
        </div>
        <div v-else class="space-y-2">
          <div v-for="(group, gIdx) in groupedList" :key="group.key">
            <div v-if="group.label" class="sticky top-0 z-[1] px-2 py-1 text-[11px] font-semibold text-slate-500 bg-[var(--surface-subtle)]/95 backdrop-blur rounded-md mb-1">
              {{ group.label }} <span class="opacity-60">({{ group.items.length }})</span>
            </div>
            <BookmarkCard
              v-for="bm in group.items"
              :key="bm.id"
              :bm="bm"
              @reorder="onCardReorder"
            />
            <div v-if="!group.items.length" class="px-2 py-2 text-[11px] text-slate-400 italic">
              该文件夹暂无书签
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      :open="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenuItems"
      @close="closeContextMenu"
      @select="onMenuSelect"
    />

    <!-- 重命名弹窗 -->
    <teleport to="body">
      <div v-if="renameDialog.visible"
           class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
           @click.self="renameDialog.visible = false">
        <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
          <h3 class="text-sm font-semibold mb-3">重命名文件夹</h3>
          <input v-model="renameDialog.name" @keydown.enter="commitRename"
                 class="input text-sm" />
          <div class="flex justify-end gap-2 mt-3">
            <button @click="renameDialog.visible = false" class="btn-ghost text-xs">取消</button>
            <button @click="commitRename" class="btn-accent text-xs">确定</button>
          </div>
        </div>
      </div>
    </teleport>
  </section>
</template>

<script setup>
import { computed, ref, h, defineComponent } from 'vue'
import CategoryTree from './CategoryTree.vue'
import BookmarkCard from './BookmarkCard.vue'
import ContextMenu from './ContextMenu.vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'
import { useViewStateStore } from '../stores/viewState.js'

const props = defineProps({
  side: { type: String, default: 'right' } // 'left' | 'right'
})
const emit = defineEmits(['new-folder', 'surface-menu', 'manage-categories'])

const bm = useBookmarksStore()
const cats = useCategoriesStore()
const viewState = useViewStateStore()

const selectedKey = computed(() => {
  return props.side === 'left'
    ? viewState.organizer.leftSelectedKey
    : viewState.organizer.rightSelectedKey
})

function selectKey(key) {
  if (props.side === 'left') viewState.selectLeft(key)
  else viewState.selectRight(key)
}
function toggleExpand(id) {
  if (props.side === 'left') viewState.toggleLeftExpanded(id)
  else viewState.toggleRightExpanded(id)
}

// 左侧的「筛选根」节点（虚拟），右侧直接是 cats.tree
const leftRootNodes = computed(() => [
  { id: 'all', name: '所有书签', icon: '📑', children: [] },
  { id: 'unclassified', name: '未分类', icon: '📥', children: [] }
])
const treeNodes = computed(() => {
  if (props.side === 'left') return leftRootNodes.value
  return cats.tree
})

// 书签聚合
const filteredBookmarks = computed(() => {
  const key = selectedKey.value
  const all = bm.bookmarks.filter((b) => !b.recycled && !b.archived)
  if (props.side === 'left') {
    if (key === 'all') return all
    if (key === 'unclassified' || !key) return all.filter((b) => !b.categoryId)
    // 子分类聚合
    const ids = cats.descendantIds(key)
    return all.filter((b) => ids.has(b.categoryId))
  } else {
    if (!key) return []
    const ids = cats.descendantIds(key)
    return all.filter((b) => ids.has(b.categoryId))
  }
})

const groupedList = computed(() => {
  if (props.side === 'right') {
    const list = filteredBookmarks.value
    return [{ key: 'root', label: '', items: list }]
  }
  // 左侧：未分类/所有/分类视图
  const key = selectedKey.value
  if (key === 'unclassified' || !key || key === 'all') {
    return [{ key: 'root', label: '', items: filteredBookmarks.value }]
  }
  // 选中某个分类时按子分类分组显示
  const ids = cats.descendantIds(key)
  const subs = cats.categories.filter((c) => c.parentId === key && ids.has(c.id))
  const list = filteredBookmarks.value
  const direct = list.filter((b) => b.categoryId === key)
  const groups = []
  if (direct.length > 0) {
    groups.push({ key: key, label: '📁 直接归属', items: direct })
  }
  for (const sub of subs) {
    const items = list.filter((b) => b.categoryId === sub.id)
    if (items.length > 0) {
      groups.push({ key: sub.id, label: `${sub.icon || '📁'} ${sub.name}`, items })
    }
  }
  // 其他（含子分类下更深层的聚合）
  const accounted = new Set(direct.concat(...subs.map((s) => list.filter((b) => b.categoryId === s.id))).map((b) => b.id))
  const others = list.filter((b) => !accounted.has(b.id))
  if (others.length > 0) {
    groups.push({ key: 'descendants', label: '🌿 子分类聚合', items: others })
  }
  if (groups.length === 0) {
    groups.push({ key: 'root', label: '', items: [] })
  }
  return groups
})

const emptyHint = computed(() => {
  if (props.side === 'right' && !selectedKey.value) return '请在右侧分类树中选择文件夹以查看书签'
  if (filteredBookmarks.value.length === 0) return '暂无书签'
  return ''
})

const headerSubtitle = computed(() => {
  const key = selectedKey.value
  if (props.side === 'left') {
    if (key === 'all') return `共 ${bm.bookmarks.filter((b) => !b.recycled && !b.archived).length} 条`
    if (!key || key === 'unclassified') {
      const n = bm.bookmarks.filter((b) => !b.recycled && !b.archived && !b.categoryId).length
      return `未分类 ${n} 条`
    }
    const c = cats.byId[key]
    return c ? `${c.name} · 共 ${filteredBookmarks.value.length} 条` : '共 0 条'
  } else {
    if (!key) return '请选择右侧文件夹'
    const c = cats.byId[key]
    return c ? `${c.name} · 共 ${filteredBookmarks.value.length} 条` : '共 0 条'
  }
})

// ---- 拖拽处理 ----
function handleDropBookmark(bookmarkId, categoryId) {
  if (props.side === 'right' && categoryId) {
    bm.moveToCategory(bookmarkId, categoryId, { manual: true })
    const c = cats.byId[categoryId]
    if (window.$toast && c) window.$toast(`已移至「${c.name}」`, 'success')
  } else if (props.side === 'left') {
    // 左侧选择是虚拟根「所有书签/未分类」时不允许；选中具体分类则移动到该分类
    if (categoryId && categoryId !== 'all' && categoryId !== 'unclassified') {
      bm.moveToCategory(bookmarkId, categoryId, { manual: true })
      const c = cats.byId[categoryId]
      if (window.$toast && c) window.$toast(`已移至「${c.name}」`, 'success')
    } else {
      // 拖入左侧「未分类/所有」视为撤销分类
      bm.moveToCategory(bookmarkId, null, { manual: true })
      if (window.$toast) window.$toast('已移回未分类', 'success')
    }
  }
}
function handleDropCategory(categoryId, newParentId) {
  if (!categoryId || !newParentId || categoryId === newParentId) return
  if (cats.isAncestor(categoryId, newParentId)) {
    if (window.$toast) window.$toast('不能将文件夹移入其子文件夹', 'warn')
    return
  }
  cats.update(categoryId, { parentId: newParentId })
}

const listDragOver = ref(false)
function onListDragOver(e) {
  const types = e.dataTransfer?.types || []
  if (types.includes('text/bookmark-id') || types.includes('text/category-id')) {
    e.dataTransfer.dropEffect = 'move'
    listDragOver.value = true
  }
}
function onListDragLeave() {
  listDragOver.value = false
}
function onListDrop(e) {
  listDragOver.value = false
  const bmId = e.dataTransfer?.getData('text/bookmark-id') || window.__dragBookmarkId
  window.__dragBookmarkId = null
  if (bmId) {
    if (props.side === 'right' && selectedKey.value) {
      bm.moveToCategory(bmId, selectedKey.value, { manual: true })
      const c = cats.byId[selectedKey.value]
      if (window.$toast && c) window.$toast(`已移至「${c.name}」`, 'success')
    } else if (props.side === 'left') {
      // 拖入左侧空白区 = 移回未分类
      bm.moveToCategory(bmId, null, { manual: true })
      if (window.$toast) window.$toast('已移回未分类', 'success')
    }
    return
  }
  const catId = e.dataTransfer?.getData('text/category-id')
  if (catId && props.side === 'right' && selectedKey.value) {
    handleDropCategory(catId, selectedKey.value)
  }
}

// ---- 卡片排序（重排序在本分栏当前列表内） ----
function onCardReorder({ dragId, dropId }) {
  const list = filteredBookmarks.value
  const dragIdx = list.findIndex((b) => b.id === dragId)
  const dropIdx = list.findIndex((b) => b.id === dropId)
  if (dragIdx === -1 || dropIdx === -1) return
  const ids = list.map((b) => b.id)
  const next = [...ids]
  next.splice(dragIdx, 1)
  next.splice(dropIdx, 0, ids[dragIdx])
  const orders = next.map((id, i) => ({ id, order: i }))
  bm.reorder(orders)
}

// ---- 上下文菜单 ----
const contextMenu = ref({ visible: false, x: 0, y: 0, node: null })
const renameDialog = ref({ visible: false, node: null, name: '' })

const contextMenuItems = computed(() => {
  const node = contextMenu.value.node
  if (!node) return []
  const items = []
  items.push({ type: 'heading', label: node.name })
  items.push({ id: 'select', label: '查看该文件夹', icon: '□', action: () => { selectKey(node.id); closeContextMenu() } })
  if (props.side === 'right') {
    items.push({ id: 'new-child', label: '新建子文件夹', icon: '+', action: () => { cats.add({ name: '新文件夹', parentId: node.id }); closeContextMenu(); if (window.$toast) window.$toast('已新建子文件夹', 'success') } })
  } else {
    items.push({ id: 'new-sibling', label: '同级新建文件夹', icon: '+', action: () => { cats.add({ name: '新文件夹', parentId: node.parentId || null }); closeContextMenu(); if (window.$toast) window.$toast('已新建同级文件夹', 'success') } })
  }
  items.push({ type: 'separator' })
  items.push({ id: 'rename', label: '重命名', icon: '✎', action: () => { renameDialog.value = { visible: true, node, name: node.name }; closeContextMenu() } })
    items.push({ id: 'duplicate', label: '复制文件夹', icon: '⧉', action: async () => { await cats.add({ name: node.name + ' (副本)', icon: node.icon, color: node.color, parentId: node.parentId, tags: [...(node.tags || [])] }); closeContextMenu(); if (window.$toast) window.$toast('已复制', 'success') } })
  items.push({ type: 'separator' })
  items.push({ id: 'manage', label: '打开分类管理', icon: '⚙', action: () => { closeContextMenu(); emit('manage-categories') } })
  items.push({ type: 'separator' })
  items.push({ id: 'delete', label: '删除文件夹', icon: '×', danger: true, action: () => confirmDelete(node) })
  return items
})

function openContextMenu(node, e) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, node }
  // 默认右键也选中该节点
  selectKey(node.id)
}
function closeContextMenu() { contextMenu.value.visible = false }
function onMenuSelect(item) {
  if (typeof item.action === 'function') item.action()
}
function openSurfaceMenu(e) {
  if (e.target?.closest('[data-bookmark-card]')) return
  emit('surface-menu', e)
}

async function confirmDelete(node) {
  closeContextMenu()
  if (!window.confirm(`删除文件夹「${node.name}」？\n该文件夹下的书签将变为「未分类」。`)) return
  await cats.remove(node.id)
  for (const b of bm.bookmarks) {
    if (b.categoryId === node.id || b.manualCategoryId === node.id) {
      bm.update(b.id, { categoryId: null, manualCategoryId: null, manualSet: false }).catch(() => {})
    }
  }
  if (selectedKey.value === node.id) selectKey('')
  if (window.$toast) window.$toast('已删除', 'info')
}

function commitRename() {
  const { node, name } = renameDialog.value
  if (name && name.trim() && node && name.trim() !== node.name) {
    cats.update(node.id, { name: name.trim() })
    if (window.$toast) window.$toast('已重命名', 'success')
  }
  renameDialog.value.visible = false
}

// ---- 全部展开 ----
function expandAll() {
  const ids = []
  function walk(nodes) {
    for (const n of nodes) {
      ids.push(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(cats.tree)
  viewState.setExpandedIds('right', ids)
}
</script>
