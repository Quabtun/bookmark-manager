<template>
  <div
    class="w-1.5 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-accent/30 transition-colors relative z-10"
    @mousedown.prevent="startDrag"
  >
    <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-slate-300/40 dark:bg-slate-600/40"></div>
  </div>
</template>

<script setup>
const props = defineProps({
  /** 0..1，左侧分栏占容器的比例 */
  modelValue: { type: Number, default: 0.42 }
})
const emit = defineEmits(['update:modelValue', 'drag-start', 'drag-end'])

let dragging = false
let startX = 0
let startRatio = 0
let container = null

function startDrag(e) {
  dragging = true
  startX = e.clientX
  startRatio = props.modelValue
  container = e.currentTarget?.parentElement
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  emit('drag-start')
}

function onDrag(e) {
  if (!dragging) return
  const rect = container?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  const deltaRatio = (e.clientX - startX) / rect.width
  const next = Math.max(0.2, Math.min(0.7, startRatio + deltaRatio))
  emit('update:modelValue', next)
}

function stopDrag() {
  if (!dragging) return
  dragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  emit('drag-end')
}
</script>
