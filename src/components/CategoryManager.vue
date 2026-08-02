<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-lg glass rounded-2xl shadow-glass p-5 animate-slide-up max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">分类管理</h3>
              <p class="text-xs text-slate-400">预设标签会在新建书签时作为快捷选项出现</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div class="flex-1 overflow-y-auto space-y-2">
            <div v-for="(c, i) in localList" :key="c.id"
                 class="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3">
              <!-- 第一行：图标/名称/颜色 -->
              <div class="flex items-center gap-2 mb-1.5">
                <span class="drag-handle text-slate-300 cursor-grab">⠿</span>
                <input v-model="c.icon" class="w-8 text-center text-base bg-white dark:bg-slate-700 rounded-lg outline-none py-1" maxlength="2" />
                <input v-model="c.name" class="flex-1 input py-1 text-sm" placeholder="分类名称" />
                <input v-model="c.color" type="color" class="w-7 h-7 rounded cursor-pointer bg-transparent border-0" />
                <button @click="remove(i)" class="text-red-400 hover:text-red-600 text-sm px-1" title="删除">✕</button>
              </div>

              <!-- 第二行：标签编辑 -->
              <div class="flex flex-wrap items-center gap-1 pl-6">
                <span v-for="(t, ti) in (c.tags || [])" :key="ti"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium chip-accent">
                  {{ t }}
                  <button @click="removeTag(i, ti)" class="ml-0.5 hover:text-red-500 leading-none">×</button>
                </span>
                <input :ref="el => tagInputs[i] = el"
                       v-model="tagInputs[i]"
                       @keydown.enter.prevent="addTag(i)"
                       @keydown.,.prevent="addTag(i)"
                       class="w-16 bg-transparent outline-none text-[11px] py-0.5 text-slate-400"
                       placeholder="+标签" />
              </div>
            </div>
          </div>

          <button @click="addNew" class="btn-ghost mt-3 w-full justify-center">＋ 新增分类</button>

          <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <button @click="close" class="btn-ghost">取消</button>
            <button @click="saveAll" class="btn-accent">保存</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useCategoriesStore } from '../stores/categories.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const cats = useCategoriesStore()

const localList = ref([])
const tagInputs = ref([])

watch(() => props.modelValue, (v) => {
  if (v) {
    localList.value = JSON.parse(JSON.stringify(cats.sorted.map(c => ({
      ...c,
      tags: c.tags || []
    }))))
    tagInputs.value = localList.value.map(() => '')
  }
})

function close() { emit('update:modelValue', false) }

function addNew() {
  localList.value.push({
    id: 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    name: '新分类', icon: '📁', color: '#64748b', order: localList.value.length, tags: []
  })
  tagInputs.value.push('')
}

function remove(i) {
  if (confirm('删除此分类？该分类下的书签将变为「未分类」。')) {
    localList.value.splice(i, 1)
    tagInputs.value.splice(i, 1)
  }
}

function addTag(i) {
  const val = (tagInputs.value[i] || '').trim()
  if (!val) return
  if (!localList.value[i].tags) localList.value[i].tags = []
  if (!localList.value[i].tags.includes(val)) {
    localList.value[i].tags.push(val)
  }
  tagInputs.value[i] = ''
}

function removeTag(i, ti) {
  localList.value[i].tags.splice(ti, 1)
}

async function saveAll() {
  localList.value.forEach((c, i) => { c.order = i })
  await cats.save(localList.value)
  window.$toast('分类与标签已保存', 'success')
  close()
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
