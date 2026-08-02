<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-2xl glass rounded-2xl shadow-glass p-5 animate-slide-up max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">🔐 账号密码</h3>
              <p class="text-xs text-slate-400">加密绑定当前 Windows 账户，文件被拷走无法解密</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <!-- 新增 -->
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/40 mb-3">
            <div class="grid grid-cols-12 gap-2">
              <div class="col-span-4 relative">
                <div class="flex items-center input text-sm gap-1 p-0 overflow-hidden" @click="showDomainSuggestions = true">
                  <input v-model="form.host" @focus="showDomainSuggestions = true" @input="domainSearch = form.host"
                         class="flex-1 bg-transparent outline-none px-3 py-2 text-sm" placeholder="搜索或输入域名…" />
                  <button v-if="form.host" @click.stop="form.host = ''; domainSearch = ''" class="px-2 text-slate-400 hover:text-red-400">×</button>
                </div>
                <div v-if="showDomainSuggestions && filteredDomains.length" 
                     class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 z-20 max-h-48 overflow-y-auto">
                  <div class="text-[10px] text-slate-400 px-3 py-1 sticky top-0 bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600">
                    {{ form.host ? '匹配域名' : '已有书签域名' }} ({{ filteredDomains.length }})
                  </div>
                  <button v-for="d in filteredDomains" :key="d"
                          @mousedown.prevent="selectDomain(d)"
                          @contextmenu.prevent="copyDomain(d, $event)"
                          class="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-between group">
                    <span class="font-mono text-xs truncate">{{ d }}</span>
                    <span class="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100">右键复制</span>
                  </button>
                </div>
              </div>
              <input v-model="form.username" class="input col-span-3 text-sm" placeholder="用户名" />
              <input v-model="form.password" :type="showNew ? 'text':'password'" class="input col-span-3 text-sm" placeholder="密码" />
              <button @click="showNew = !showNew" class="col-span-1 btn-ghost justify-center px-0 text-xs">{{ showNew ? '🙈' : '👁️' }}</button>
              <button @click="addOne" class="col-span-1 btn-accent justify-center px-0 text-xs">＋</button>
            </div>
          </div>

          <!-- 凭据列表 -->
          <div class="flex-1 overflow-y-auto space-y-3">
            <div v-if="Object.keys(list).length === 0" class="text-center text-slate-400 py-8 text-sm">暂无保存的凭证</div>
            <div v-for="(creds, host) in list" :key="host" class="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3">
              <div class="flex items-center gap-2 mb-2 select-none"
                   @contextmenu.prevent="copyDomain(host)">
                <span class="text-sm">🌐</span>
                <span class="text-sm font-semibold font-mono text-slate-700 dark:text-slate-200 truncate">{{ host }}</span>
                <span class="chip text-[10px] ml-auto">{{ creds.length }} 组</span>
              </div>
              <div v-for="c in creds" :key="c.id" class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/60 dark:bg-slate-700/60 mb-1">
                <span class="text-sm flex-1 truncate">{{ c.username || '(无用户名)' }}</span>
                <code class="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded select-all cursor-pointer" 
                      @click="reveal(c)">{{ revealed[c.id] || '••••••••' }}</code>
                <button @click="reveal(c)" class="text-xs hover:text-accent">{{ revealed[c.id] ? '🙈' : '👁️' }}</button>
                <button @click="del(host, c.id)" class="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const bm = useBookmarksStore()
const list = ref({})
const form = ref({ host: '', username: '', password: '' })
const showNew = ref(false)
const revealed = ref({})
const showDomainSuggestions = ref(false)
const domainSearch = ref('')

const allDomains = computed(() => {
  const domains = new Set()
  for (const b of bm.bookmarks) {
    try { domains.add(new URL(b.url).hostname) } catch { /* skip */ }
  }
  return [...domains].sort()
})

const filteredDomains = computed(() => {
  if (!domainSearch.value) return allDomains.value.slice(0, 30)
  const q = domainSearch.value.toLowerCase()
  return allDomains.value.filter(d => d.includes(q)).slice(0, 20)
})

function selectDomain(d) {
  form.value.host = d
  domainSearch.value = d
  showDomainSuggestions.value = false
}

function copyDomain(d, event) {
  navigator.clipboard.writeText(d).then(() => {
    window.$toast && window.$toast('已复制: ' + d, 'success')
  }).catch(() => {})
  showDomainSuggestions.value = false
}

watch(() => props.modelValue, async (v) => {
  if (v) { await loadList(); revealed.value = {}; showDomainSuggestions.value = false }
})

async function loadList() {
  list.value = await window.api.invoke('cred:list')
}
function close() { emit('update:modelValue', false) }

async function addOne() {
  if (!form.value.host || !form.value.password) return window.$toast('请填写域名和密码', 'warn')
  await window.api.invoke('cred:add', form.value.host.trim(), {
    username: form.value.username, password: form.value.password, note: ''
  })
  form.value = { host: '', username: '', password: '' }
  domainSearch.value = ''
  await loadList()
  window.$toast('已保存（加密）', 'success')
}

async function reveal(c) {
  if (revealed.value[c.id]) {
    const r = { ...revealed.value }; delete r[c.id]; revealed.value = r
    return
  }
  let host = ''
  for (const [h, creds] of Object.entries(list.value)) {
    if (creds.some((x) => x.id === c.id)) { host = h; break }
  }
  if (!host) return
  const pwd = await window.api.invoke('cred:reveal', host, c.id)
  revealed.value = { ...revealed.value, [c.id]: pwd }
}

async function del(host, id) {
  if (!confirm('删除此凭证？')) return
  await window.api.invoke('cred:delete', host, id)
  await loadList()
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.select-all { user-select: all; }
</style>
