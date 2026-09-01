<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
           @click.self="close">
        <div class="w-full max-w-lg glass rounded-2xl shadow-glass p-5 animate-slide-up max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">{{ form.id ? '编辑书签' : '新建书签' }}</h3>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <!-- URL -->
            <div class="relative">
              <label class="text-xs text-slate-500 flex items-center gap-2">
                <span>URL *</span>
                <span v-if="fetching" class="text-accent animate-pulse text-[11px]">⏳ 抓取中…</span>
                <span v-if="fetchOk" class="text-green-500 text-[11px]">✅ 已获取</span>
              </label>
              <input v-model="form.url" @blur="onUrlBlur" @keydown.enter.prevent="onUrlBlur" @input="onUrlInput"
                     class="input mt-1 font-mono text-sm" placeholder="https://example.com" />
              <!-- URL 自动补全 -->
              <div v-if="urlSuggestions.length > 0" class="absolute left-0 right-0 mt-0.5 bg-white dark:bg-slate-800 rounded-xl shadow-glass border border-slate-200 dark:border-slate-700 py-1 z-50 max-h-40 overflow-y-auto">
                <button v-for="s in urlSuggestions" :key="s" @mousedown.prevent="applyUrlSuggestion(s)"
                        class="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-slate-100 dark:hover:bg-slate-700 truncate">
                  {{ s }}
                </button>
              </div>
            </div>

            <!-- 标题 -->
            <div>
              <label class="text-xs text-slate-500">标题</label>
              <input v-model="form.title" class="input mt-1" placeholder="留空则自动抓取" />
            </div>

            <!-- 描述 -->
            <div>
              <label class="text-xs text-slate-500">描述</label>
              <textarea v-model="form.description" rows="2" class="input mt-1"
                        placeholder="粘贴URL后自动抓取，也可手动修改"></textarea>
            </div>

            <!-- 分类 + 标签 -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-slate-500">分类</label>
                <select v-model="form.categoryId" class="input mt-1">
                  <option :value="null">📁 未分类</option>
                  <option v-for="c in cats.sorted" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-slate-500">标签</label>
                <!-- 标签可视化输入 -->
                <div class="input mt-1 flex flex-wrap items-center gap-1 min-h-[36px] cursor-text"
                     @click="tagInputRef && tagInputRef.focus()">
                  <span v-for="(t, i) in form.tags" :key="i"
                        class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-50 text-accent dark:bg-accent-50 dark:text-accent">
                    #{{ t }}
                    <button @click.stop="removeTag(i)" class="ml-0.5 text-accent hover:text-red-500 leading-none">×</button>
                  </span>
                  <input ref="tagInputRef" v-model="tagInput" @keydown.enter.prevent="addTag"
                         @keydown.backspace="onTagBackspace"
                         @keydown.,.prevent="addTag"
                         class="flex-1 min-w-[60px] bg-transparent outline-none text-sm py-0.5"
                         placeholder="输入后回车" />
                </div>
                <!-- tag 建议 -->
                <div v-if="tagSuggestions.length || categoryTags.length" class="flex gap-1 mt-1 flex-wrap items-center">
                  <button v-if="categoryTags.length"
                          @click="addAllCategoryTags"
                          class="text-[11px] px-2 py-0.5 rounded-md bg-[var(--accent-50)] text-[var(--accent-600)] hover:bg-[var(--accent-100)] font-medium transition">
                    📌 添加全部分类标签
                  </button>
                  <span v-if="categoryTags.length && tagSuggestions.length" class="text-slate-300 text-xs">|</span>
                  <button v-for="s in tagSuggestions" :key="s.tag"
                          @click="addSuggestedTag(s.tag)"
                          :class="['text-[11px] px-2 py-0.5 rounded-md transition',
                            s.source === 'cat' ? 'bg-[var(--accent-50)] text-[var(--accent-600)] hover:bg-[var(--accent-100)]' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600']">
                    {{ s.source === 'cat' ? '📌' : '+' }}{{ s.tag }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 备注 -->
            <div>
              <label class="text-xs text-slate-500">备注</label>
              <textarea v-model="form.notes" rows="2" class="input mt-1" placeholder="可选"></textarea>
            </div>
          </div>

          <div class="flex items-center justify-between mt-5 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <button v-if="form.id" @click="onDelete" class="btn-danger">删除</button>
            <div v-else></div>
            <div class="flex gap-2">
              <button @click="close" class="btn-ghost">取消</button>
              <button @click="onSave" class="btn-primary" :disabled="!form.url.trim()">
                {{ form.id ? '保存' : '添加' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useCategoriesStore } from '../stores/categories.js'
import { useBookmarksStore } from '../stores/bookmarks.js'

const props = defineProps({ modelValue: Boolean, bookmark: Object })
const emit = defineEmits(['update:modelValue', 'save', 'delete'])

const cats = useCategoriesStore()
const bmStore = useBookmarksStore()

const form = ref({})
const tagInput = ref('')
const tagInputRef = ref(null)
const fetching = ref(false)
const fetchOk = ref(false)

// URL 自动补全
const urlSuggestions = ref([])

function onUrlInput() {
  const url = (form.value.url || '').trim()
  if (!url || url.length < 3) {
    urlSuggestions.value = []
    return
  }
  // 从现有书签中提取域名，模糊匹配
  const domainMap = {}
  for (const b of bmStore.bookmarks) {
    try {
      const hostname = new URL(b.url).hostname
      domainMap[hostname] = (b.addedAt || 0)
    } catch { /* skip */ }
  }
  // 按最近添加时间排序，取前10个匹配的域名
  const lowerUrl = url.toLowerCase()
  const matches = Object.entries(domainMap)
    .filter(([domain]) => domain.includes(lowerUrl))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain]) => 'https://' + domain)
  urlSuggestions.value = matches
}

function applyUrlSuggestion(suggestion) {
  // 保留用户已输入的路径部分
  const url = form.value.url || ''
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url)
    const suggestionParsed = new URL(suggestion)
    form.value.url = suggestionParsed.origin + parsed.pathname + parsed.search
  } catch {
    form.value.url = suggestion
  }
  urlSuggestions.value = []
}

// 现有的所有标签（用于建议）
const allTags = computed(() => {
  const set = new Set()
  for (const b of bmStore.bookmarks) {
    for (const t of (b.tags || [])) set.add(t)
  }
  return [...set].sort()
})

// 当前分类的预设标签
const categoryTags = computed(() => {
  const cat = cats.categories.find((c) => c.id === form.value.categoryId)
  return (cat && cat.tags) ? cat.tags.filter((t) => !form.value.tags.includes(t)) : []
})

const tagSuggestions = computed(() => {
  const result = []
  // 1. 当前分类的预设标签（始终显示，只要还没添加）
  for (const t of categoryTags.value) {
    if (!tagInput.value || t.toLowerCase().includes(tagInput.value.toLowerCase())) {
      result.push({ tag: t, source: 'cat' })
    }
  }
  // 2. 匹配输入的历史标签
  if (tagInput.value) {
    const q = tagInput.value.toLowerCase()
    for (const t of allTags.value) {
      if (!form.value.tags.includes(t) && t.toLowerCase().includes(q) && !result.some((r) => r.tag === t)) {
        result.push({ tag: t, source: 'history' })
      }
    }
  }
  return result.slice(0, 10)
})

watch(() => props.modelValue, (v) => {
  if (v) {
    form.value = {
      id: props.bookmark?.id || null,
      url: props.bookmark?.url || '',
      title: props.bookmark?.title || '',
      description: props.bookmark?.description || '',
      categoryId: props.bookmark?.categoryId ?? null,
      notes: props.bookmark?.notes || '',
      tags: [...(props.bookmark?.tags || [])]
    }
    tagInput.value = ''
    fetching.value = false
    fetchOk.value = false
  }
}, { immediate: true })

function close() { emit('update:modelValue', false) }

// ---------- URL 自动抓取 ----------
let fetchTimer = null
async function onUrlBlur() {
  clearTimeout(fetchTimer)
  const url = (form.value.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) return
  // 如果已经有标题和描述，跳过（用户可能手动填了）
  if (form.value.title && form.value.description && !form.value.id) return
  fetching.value = true
  fetchOk.value = false
  try {
    const preview = await window.api.invoke('preview:generate', url)
    if (preview && !preview.error) {
      if (!form.value.title) form.value.title = preview.title || ''
      if (!form.value.description) form.value.description = preview.description || ''
      fetchOk.value = true
    }
  } catch (e) { /* 抓取失败不影响使用 */ }
  fetching.value = false
}

// ---------- 标签操作 ----------
function addTag() {
  const t = tagInput.value.replace(/^#/, '').trim()
  if (!t) return
  if (form.value.tags.includes(t)) { tagInput.value = ''; return }
  form.value.tags.push(t)
  tagInput.value = ''
}
function removeTag(i) { form.value.tags.splice(i, 1) }
function onTagBackspace() {
  if (!tagInput.value && form.value.tags.length) {
    form.value.tags.pop()
  }
}
function addSuggestedTag(t) {
  if (!form.value.tags.includes(t)) form.value.tags.push(t)
  tagInput.value = ''
}

function addAllCategoryTags() {
  for (const t of categoryTags.value) {
    if (!form.value.tags.includes(t)) form.value.tags.push(t)
  }
}

// ---------- 保存 / 删除 ----------
function onSave() {
  const data = {
    ...form.value,
    tags: [...form.value.tags],
    _isManual: true
  }
  emit('save', data)
  close()
}
function onDelete() {
  if (confirm('确定删除这个书签吗？')) {
    emit('delete', form.value.id)
    close()
  }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
