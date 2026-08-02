<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="w-full max-w-lg glass rounded-2xl shadow-glass p-5 animate-pop">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">分类快照</h3>
              <p class="text-xs text-slate-400">自动分类前会自动保存快照；可随时手动保存或恢复</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <!-- 手动保存 -->
          <div class="flex gap-2 mb-3">
            <input
              v-model="snapName"
              class="input text-sm flex-1"
              placeholder="快照名称（可选）"
            />
            <button @click="createManual" class="btn-primary shrink-0 text-sm">💾 保存当前</button>
          </div>

          <!-- 快照列表 -->
          <div class="space-y-2 max-h-80 overflow-y-auto">
            <div v-if="list.length === 0" class="text-center text-slate-400 py-8 text-sm">
              暂无快照
            </div>
            <div
              v-for="(s, idx) in list"
              :key="s.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
            >
              <span class="text-lg shrink-0">{{ s.kind === 'auto' ? '🤖' : '📦' }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ s.name }}</div>
                <div class="text-xs text-slate-400">
                  {{ formatTime(s.createdAt) }} &middot; {{ s.count }} 个书签
                </div>
              </div>
              <button @click="doRestore(s)" class="btn-ghost text-xs shrink-0">恢复</button>
              <button @click="doDelete(s)" class="text-red-400 hover:text-red-600 text-sm shrink-0">&times;</button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const bm = useBookmarksStore()

const list = ref([])
const snapName = ref('')
const loading = ref(false)

// 每次打开面板时刷新列表
watch(() => props.modelValue, async (visible) => {
  if (visible) {
    snapName.value = ''
    await loadList()
  }
})

//  also reload when component mounts (if already visible)
onMounted(async () => {
  if (props.modelValue) await loadList()
})

async function loadList() {
  loading.value = true
  try {
    const result = await window.api.invoke('snap:list')
    if (result && Array.isArray(result)) {
      list.value = result
    } else {
      console.warn('[SnapshotPanel] snap:list 返回异常:', result)
      list.value = []
    }
  } catch (e) {
    console.error('[SnapshotPanel] 加载快照列表失败:', e)
    window.$toast && window.$toast('加载快照失败: ' + (e.message || e), 'error')
    list.value = []
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

async function createManual() {
  if (!bm.bookmarks || bm.bookmarks.length === 0) {
    window.$toast && window.$toast('没有书签可保存', 'warn')
    return
  }
  try {
    const payload = JSON.parse(JSON.stringify(bm.bookmarks))
    const snap = await window.api.invoke('snap:create', payload, {
      name: snapName.value || null,
      kind: 'manual'
    })
    window.$toast && window.$toast('已保存快照（含全部 ' + (snap?.count || bm.bookmarks.length) + ' 个书签）', 'success')
    snapName.value = ''
    await loadList()
  } catch (e) {
    window.$toast && window.$toast('保存快照失败: ' + (e.message || e), 'error')
    console.error('[SnapshotPanel] 保存快照失败:', e)
  }
}

async function doRestore(s) {
  if (!confirm(
    `从快照「${s.name}」恢复分类？\n当前所有书签分类将被覆盖。\n\n继续？`
  )) return
  try {
    const r = await bm.restoreSnapshot(s.id)
    window.$toast && window.$toast(`已恢复 ${r} 个书签的分类`, 'success')
    await loadList()
    close()
  } catch (e) {
    window.$toast && window.$toast('恢复失败: ' + (e.message || e), 'error')
    console.error('[SnapshotPanel] 恢复快照失败:', e)
  }
}

async function doDelete(s) {
  if (!confirm(`删除快照「${s.name}」？\n此操作不可恢复！`)) return
  try {
    await window.api.invoke('snap:delete', s.id)
    window.$toast && window.$toast('已删除快照', 'info')
    await loadList()
  } catch (e) {
    window.$toast && window.$toast('删除失败: ' + (e.message || e), 'error')
    console.error('[SnapshotPanel] 删除快照失败:', e)
  }
}

function formatTime(t) {
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
