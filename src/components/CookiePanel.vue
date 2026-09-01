<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-3xl glass rounded-2xl shadow-glass p-5 animate-slide-up max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">🍪 Cookie 管理</h3>
              <p class="text-xs text-slate-400">通过登录窗口捕获，加密绑定 Windows 账户保存</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <!-- 捕获 -->
          <div class="flex gap-2 mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/40">
            <input v-model="loginUrl" class="input text-sm flex-1" placeholder="https://example.com （登录后点捕获）" />
            <button @click="openLogin" class="btn-ghost">🪟 打开登录窗口</button>
            <button @click="capture" class="btn-primary">🍪 捕获 Cookie</button>
          </div>

          <!-- 列表 -->
          <div class="flex-1 overflow-y-auto space-y-3">
            <div v-if="Object.keys(list).length === 0" class="text-center text-slate-400 py-8 text-sm">暂无保存的 Cookie</div>
            <div v-for="(cookies, host) in list" :key="host">
              <div class="flex items-center justify-between mb-1.5 px-1">
                <span class="text-xs font-semibold text-slate-500">{{ host }} <span class="text-slate-400">({{ cookies.length }})</span></span>
                <button @click="clearHost(host)" class="text-xs text-red-400 hover:text-red-600">清空此域名</button>
              </div>
              <div class="rounded-lg overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                <table class="w-full text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-700/50 text-slate-500">
                    <tr>
                      <th class="text-left px-2 py-1.5">名称</th>
                      <th class="text-left px-2 py-1.5">值</th>
                      <th class="text-left px-2 py-1.5">路径</th>
                      <th class="text-left px-2 py-1.5">属性</th>
                      <th class="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in cookies" :key="c.name" class="border-t border-slate-100 dark:border-slate-700/50">
                      <td class="px-2 py-1.5 font-mono">{{ c.name }}</td>
                      <td class="px-2 py-1.5 font-mono max-w-[200px] truncate">
                        {{ revealed[host + '|' + c.name] || '••••••••' }}
                      </td>
                      <td class="px-2 py-1.5">{{ c.path }}</td>
                      <td class="px-2 py-1.5">
                        <span v-if="c.secure" class="chip mr-0.5">🔒</span>
                        <span v-if="c.httpOnly" class="chip mr-0.5">H</span>
                        <span v-if="c.session" class="chip">会话</span>
                      </td>
                      <td class="px-2 py-1.5 text-right">
                        <button @click="revealVal(host, c.name)" class="text-xs hover:text-accent mr-1">{{ revealed[host+'|'+c.name] ? '🙈':'👁️' }}</button>
                        <button @click="del(host, c.name)" class="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])

const list = ref({})
const loginUrl = ref('')
const revealed = ref({})

watch(() => props.modelValue, async (v) => {
  if (v) { await loadList(); revealed.value = {} }
})

async function loadList() {
  list.value = await window.api.invoke('cookie:list')
}
function close() { emit('update:modelValue', false) }

async function openLogin() {
  if (!loginUrl.value) return window.$toast('请输入网址', 'warn')
  await window.api.invoke('cookie:openLogin', loginUrl.value)
  window.$toast('已打开登录窗口，登录后点「捕获 Cookie」', 'info')
}

async function capture() {
  if (!loginUrl.value) return window.$toast('请输入网址', 'warn')
  const r = await window.api.invoke('cookie:capture', loginUrl.value)
  if (r.error) return window.$toast('捕获失败：' + r.error, 'error')
  window.$toast(`已捕获 ${r.count} 个 Cookie（${r.host}）`, 'success')
  await loadList()
}

async function revealVal(host, name) {
  const key = host + '|' + name
  if (revealed.value[key]) {
    const c = { ...revealed.value }; delete c[key]; revealed.value = c
    return
  }
  const v = await window.api.invoke('cookie:reveal', host, name)
  revealed.value = { ...revealed.value, [key]: v }
}

async function del(host, name) {
  await window.api.invoke('cookie:delete', host, name)
  await loadList()
}
async function clearHost(host) {
  if (!confirm('清空 ' + host + ' 的所有 Cookie？')) return
  await window.api.invoke('cookie:clear', host)
  await loadList()
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
