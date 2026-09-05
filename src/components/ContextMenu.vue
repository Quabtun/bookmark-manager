<template>
  <teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="fixed z-[600] min-w-[210px] max-w-[320px] p-1.5 win-surface shadow-glass animate-pop"
      :style="menuStyle"
      role="menu"
      @contextmenu.prevent
      @keydown="onKeydown"
    >
      <template v-for="(item, index) in items" :key="item.id || index">
        <div v-if="item.type === 'separator'" class="menu-separator" role="separator" />
        <div v-else-if="item.type === 'heading'" class="menu-heading">{{ item.label }}</div>
        <button
          v-else
          :ref="el => setItemRef(el, index)"
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          :class="['menu-item', item.danger ? 'menu-item-danger' : '']"
          :data-active="index === activeIndex"
          @mouseenter="activeIndex = index"
          @click="activate(item)"
        >
          <span class="w-5 text-center text-sm shrink-0">{{ item.icon || '' }}</span>
          <span class="flex-1 truncate">{{ item.label }}</span>
          <kbd v-if="item.shortcut" class="text-[10px] text-[var(--text-tertiary)] font-normal">{{ item.shortcut }}</kbd>
        </button>
      </template>
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const props = defineProps({ open: Boolean, x: { type: Number, default: 0 }, y: { type: Number, default: 0 }, items: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'select'])
const menuRef = ref(null)
const itemRefs = ref([])
const activeIndex = ref(-1)
const menuStyle = ref({ left: '0px', top: '0px' })

const actionable = computed(() => props.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.type && !item.disabled))
function setItemRef(el, index) {
  if (el) itemRefs.value[index] = el
}
function close() { emit('close') }
function activate(item) {
  if (!item.disabled) {
    emit('select', item)
    close()
  }
}
function focusCurrent() { itemRefs.value[activeIndex.value]?.focus() }
function move(direction) {
  const options = actionable.value
  if (!options.length) return
  const current = options.findIndex(({ index }) => index === activeIndex.value)
  const next = options[(current + direction + options.length) % options.length]
  activeIndex.value = next.index
  nextTick(focusCurrent)
}
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return }
  if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const active = actionable.value.find(({ index }) => index === activeIndex.value)
    if (active) activate(active.item)
  }
}
function onDocumentMousedown(event) { if (menuRef.value && !menuRef.value.contains(event.target)) close() }
function position() {
  nextTick(() => {
    const rect = menuRef.value?.getBoundingClientRect()
    if (!rect) return
    const margin = 8
    menuStyle.value = {
      left: `${Math.max(margin, Math.min(props.x, window.innerWidth - rect.width - margin))}px`,
      top: `${Math.max(margin, Math.min(props.y, window.innerHeight - rect.height - margin))}px`
    }
    activeIndex.value = actionable.value[0]?.index ?? -1
    nextTick(focusCurrent)
  })
}
function handleResize() {
  if (props.open) position()
}
watch(() => props.open, (open) => {
  if (open) {
    position()
    // 延迟注册避免打开菜单的 click 立即触发关闭
    setTimeout(() => document.addEventListener('mousedown', onDocumentMousedown), 0)
    window.addEventListener('resize', handleResize)
  } else {
    document.removeEventListener('mousedown', onDocumentMousedown)
    window.removeEventListener('resize', handleResize)
  }
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
  window.removeEventListener('resize', handleResize)
})
</script>
