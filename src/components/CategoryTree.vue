<template>
  <div class="text-sm select-none">
    <TreeNode
      v-for="node in nodes"
      :key="node.id"
      :node="node"
      :depth="0"
    />
    <div v-if="!nodes || nodes.length === 0" class="px-2 py-2 text-[11px] text-slate-400 italic">
      {{ emptyText || '暂无分类' }}
    </div>
  </div>
</template>

<script setup>
import { defineComponent, h, ref, computed } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'

const props = defineProps({
  /** 要渲染的分类树节点（可以来自 cats.tree，也可以是虚拟的根列表） */
  nodes: { type: Array, required: true },
  /** 当前展开的分类 id 集合 */
  expandedIds: { type: Array, default: () => [] },
  /** 当前选中的分类 id/key */
  selectedId: { type: String, default: '' },
  /** 拖入书签时调用的回调 (bookmarkId, categoryId) */
  onDropBookmark: { type: Function, default: null },
  /** 拖入文件夹时调用的回调 (categoryId, newParentId) */
  onDropCategory: { type: Function, default: null },
  /** 是否允许把书签拖入此树 */
  acceptBookmarks: { type: Boolean, default: true },
  /** 选中节点 */
  onSelect: { type: Function, default: null },
  /** 展开/折叠切换 */
  onToggleExpand: { type: Function, default: null },
  /** 右键菜单回调 (node, event) */
  onContextMenu: { type: Function, default: null },
  /** 文案 */
  emptyText: { type: String, default: '' }
})

const bm = useBookmarksStore()
const cats = useCategoriesStore()

const expandedSet = computed(() => new Set(props.expandedIds))
const selectedSet = computed(() => new Set([props.selectedId].filter(Boolean)))

const TreeNode = defineComponent({
  name: 'CategoryTreeNode',
  props: { node: Object, depth: Number },
  setup(p) {
    const dragOver = ref(false)
    const hasChildren = computed(() => p.node.children && p.node.children.length > 0)
    const isExpanded = computed(() => expandedSet.value.has(p.node.id))
    const isSelected = computed(() => selectedSet.value.has(p.node.id))
    const count = computed(() => {
      // 统计自身 + 子树书签数
      const ids = cats.descendantIds(p.node.id)
      let n = 0
      for (const b of bm.bookmarks) {
        if (ids.has(b.categoryId)) n++
      }
      return n
    })

    function onDrop(e) {
      dragOver.value = false
      // 优先匹配书签
      const bmId = e.dataTransfer?.getData('text/bookmark-id') || window.__dragBookmarkId
      window.__dragBookmarkId = null
      if (bmId) {
        if (!props.acceptBookmarks) return
        if (typeof props.onDropBookmark === 'function') {
          props.onDropBookmark(bmId, p.node.id)
        } else {
          // 默认行为：移动到该分类
          bm.moveToCategory(bmId, p.node.id, { manual: true })
          if (window.$toast) window.$toast(`已移至「${p.node.name}」`, 'success')
        }
        return
      }
      const catId = e.dataTransfer?.getData('text/category-id')
      if (catId && catId !== p.node.id) {
        // 防循环：目标若是自身后代，则禁止
        if (cats.isAncestor(catId, p.node.id)) {
          if (window.$toast) window.$toast('不能将文件夹移入其子文件夹', 'warn')
          return
        }
        if (typeof props.onDropCategory === 'function') {
          props.onDropCategory(catId, p.node.id)
        } else {
          cats.update(catId, { parentId: p.node.id })
        }
      }
    }

    function onDragStart(e) {
      if (!p.node.id) return
      e.dataTransfer.setData('text/category-id', p.node.id)
      e.dataTransfer.effectAllowed = 'move'
    }

    function onClickSelect() {
      if (typeof props.onSelect === 'function') props.onSelect(p.node.id)
    }
    function onToggle(e) {
      e.stopPropagation()
      if (typeof props.onToggleExpand === 'function') props.onToggleExpand(p.node.id)
    }
    function onContext(e) {
      if (typeof props.onContextMenu === 'function') props.onContextMenu(p.node, e)
    }

    return () =>
      h('div', null, [
        // 当前节点
        h(
          'div',
          {
            draggable: 'true',
            class: [
              'flex items-center gap-0.5 px-1 py-1 rounded-lg text-sm transition group cursor-pointer',
              isSelected.value
                ? 'bg-accent text-white'
                : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/50',
              dragOver.value ? 'ring-2 ring-accent' : ''
            ],
            style: { paddingLeft: p.depth * 14 + 4 + 'px' },
            onClick: onClickSelect,
            onDragstart: onDragStart,
            onDragover: (e) => {
              if (!props.acceptBookmarks && !e.dataTransfer?.types?.includes('text/category-id')) return
              e.preventDefault()
              dragOver.value = true
              e.dataTransfer.dropEffect = 'move'
            },
            onDragleave: () => { dragOver.value = false },
            onDrop,
            onContextmenu: (e) => { e.preventDefault(); onContext(e) }
          },
          [
            hasChildren.value
              ? h(
                  'span',
                  {
                    class:
                      'w-3.5 text-center text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 flex-shrink-0',
                    onClick: onToggle
                  },
                  isExpanded.value ? '▾' : '▸'
                )
              : h('span', { class: 'w-3.5 flex-shrink-0' }),
            h('span', { class: 'text-sm flex-shrink-0' }, p.node.icon || '📁'),
            h('span', { class: 'flex-1 truncate text-[13px]' }, p.node.name),
            count.value > 0
              ? h('span', { class: 'text-[10px] opacity-60' }, count.value)
              : null
          ]
        ),
        // 子节点
        isExpanded.value && hasChildren.value
          ? h(
              'div',
              { class: 'overflow-hidden' },
              p.node.children.map((child) =>
                h(TreeNode, { node: child, depth: p.depth + 1, key: child.id })
              )
            )
          : null
      ])
  }
})
</script>
