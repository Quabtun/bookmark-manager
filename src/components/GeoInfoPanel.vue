<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-md glass rounded-2xl shadow-glass p-5 animate-slide-up">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">域名 &amp; 服务器信息</h3>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          <div v-if="bookmark" class="space-y-3">
            <div class="text-sm text-slate-500 break-all">{{ bookmark.url }}</div>

            <!-- 标签切换 -->
            <div class="flex gap-1">
              <button @click="tab = 'geo'" :class="['px-3 py-1.5 rounded-lg text-xs font-medium transition', tab === 'geo' ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700']">&#x1F4CD; 位置</button>
              <button @click="tab = 'whois'" :class="['px-3 py-1.5 rounded-lg text-xs font-medium transition', tab === 'whois' ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700']">&#x1F4DC; WHOIS</button>
            </div>

            <!-- 位置标签页 -->
            <template v-if="tab === 'geo'">
              <div v-if="geoLoading" class="py-8 text-center text-slate-400">定位中…</div>
              <template v-else-if="geo &amp;&amp; !geo.error">
                <div class="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4 space-y-2">
                  <div class="flex justify-between"><span class="text-slate-400">IP 地址</span><span class="font-mono">{{ geo.ip }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-400">国家/地区</span><span>{{ geo.country || '-' }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-400">省/州</span><span>{{ geo.region || '-' }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-400">城市</span><span>{{ geo.city || '-' }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-400">服务商 (ISP)</span><span class="text-right">{{ geo.isp || '-' }}</span></div>
                  <div class="flex justify-between"><span class="text-slate-400">ASN</span><span>{{ geo.asn || '-' }}</span></div>
                </div>
                <div class="text-xs flex items-center gap-1.5">
                  <span class="chip">{{ geoSourceLabel }}</span>
                </div>
              </template>
              <div v-else class="py-6 text-center text-slate-400 text-sm">
                {{ geo?.error || '查询失败' }}
              </div>
              <button v-if="!geoLoading" @click="refreshGeo" class="btn-ghost w-full justify-center">&#x1F504; 重新查询位置</button>
            </template>

            <!-- WHOIS 标签页 -->
            <template v-if="tab === 'whois'">
              <div v-if="whoisLoading" class="py-8 text-center text-slate-400">WHOIS 查询中…</div>
              <template v-else-if="whois &amp;&amp; !whois.error">
                <div class="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4 space-y-2">
                  <div class="flex justify-between"><span class="text-slate-400">域名</span><span class="font-mono text-right">{{ whois.domain }}</span></div>
                  <div v-if="whois.registrar" class="flex justify-between"><span class="text-slate-400">注册商</span><span class="text-right">{{ whois.registrar }}</span></div>
                  <div v-if="whois.registrant" class="flex justify-between"><span class="text-slate-400">注册人/机构</span><span class="text-right">{{ whois.registrant }}</span></div>
                  <div v-if="whois.creationDate" class="flex justify-between"><span class="text-slate-400">注册时间</span><span>{{ formatDate(whois.creationDate) }}</span></div>
                  <div v-if="whois.expirationDate" class="flex justify-between"><span class="text-slate-400">到期时间</span><span :class="['text-right', isExpiringSoon(whois.expirationDate) ? 'text-amber-500 font-semibold' : '']">{{ formatDate(whois.expirationDate) }}</span></div>
                  <div v-if="whois.updatedDate" class="flex justify-between"><span class="text-slate-400">更新时间</span><span>{{ formatDate(whois.updatedDate) }}</span></div>
                  <div v-if="whois.status &amp;&amp; whois.status.length" class="flex justify-between"><span class="text-slate-400">状态</span><span class="text-right text-xs">{{ whois.status.join(', ') }}</span></div>
                  <div v-if="whois.nameServers &amp;&amp; whois.nameServers.length" class="flex justify-between"><span class="text-slate-400">DNS 服务器</span><span class="text-right font-mono text-xs">{{ whois.nameServers.join(', ') }}</span></div>
                  <div v-if="whois.dnssec" class="flex justify-between"><span class="text-slate-400">DNSSEC</span><span>{{ whois.dnssec }}</span></div>
                </div>
                <div class="text-xs flex items-center gap-1.5">
                  <span class="chip">{{ whoisSourceLabel }}</span>
                  <span v-if="whois.server" class="chip">服务器: {{ whois.server }}</span>
                </div>
                <div v-if="whois.raw" class="mt-2">
                  <button @click="showRaw = !showRaw" class="btn-ghost text-xs w-full justify-center">{{ showRaw ? '收起原始数据' : '查看原始 WHOIS 数据' }}</button>
                  <pre v-if="showRaw" class="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap break-all">{{ whois.raw }}</pre>
                </div>
              </template>
              <div v-else class="py-6 text-center text-slate-400 text-sm">
                {{ whois?.error || 'WHOIS 查询失败' }}
              </div>
              <button v-if="!whoisLoading" @click="refreshWhois" class="btn-ghost w-full justify-center">&#x1F504; 重新查询 WHOIS</button>
            </template>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'

const props = defineProps({ modelValue: Boolean, bookmark: Object })
const emit = defineEmits(['update:modelValue'])
const bm = useBookmarksStore()

const tab = ref('geo')
const showRaw = ref(false)

// Geo 状态
const geo = ref(null)
const geoLoading = ref(false)

// WHOIS 状态
const whois = ref(null)
const whoisLoading = ref(false)

watch(() => [props.modelValue, props.bookmark?.id], async ([vis]) => {
  if (vis && props.bookmark) {
    geo.value = props.bookmark.geo || null
    whois.value = props.bookmark.whois || null
    tab.value = 'geo'
    showRaw.value = false
    if (!geo.value) await refreshGeo()
  }
}, { immediate: true })

// 切换到 WHOIS 标签页时自动查询
watch(tab, async (v) => {
  if (v === 'whois' && !whois.value && props.bookmark && !whoisLoading.value) {
    await refreshWhois()
  }
})

const geoSourceLabel = computed(() => ({
  offline: '🔒 离线查询（不出网）',
  online: '🌐 在线兜底（ip-api）',
  none: '未查询'
}[geo.value?.source] || ''))

const whoisSourceLabel = computed(() => ({
  'tcp-whois': '🔌 TCP/43 直连查询',
  'tcp-whois-referral': '🔌 TCP/43 推荐服务器',
  'online-api': '🌐 在线 API 兜底',
  'online-raw': '🌐 在线原始数据'
}[whois.value?.source] || '未知来源'))

function close() { emit('update:modelValue', false) }

// ---- Geo 查询（带竞态保护）----
let _geoRequestId = 0
async function refreshGeo() {
  if (!props.bookmark) return
  geoLoading.value = true
  const requestId = ++_geoRequestId
  const bookmarkId = props.bookmark.id
  try {
    const r = await window.api.invoke('geo:lookup', props.bookmark.url)
    if (requestId !== _geoRequestId || bookmarkId !== props.bookmark?.id) return
    geo.value = r
    await bm.update(bookmarkId, { geo: r })
  } catch {}
  geoLoading.value = false
}

// ---- WHOIS 查询（带竞态保护）----
let _whoisRequestId = 0
async function refreshWhois() {
  if (!props.bookmark) return
  whoisLoading.value = true
  const requestId = ++_whoisRequestId
  const bookmarkId = props.bookmark.id
  try {
    const r = await window.api.invoke('whois:lookup', props.bookmark.url)
    if (requestId !== _whoisRequestId || bookmarkId !== props.bookmark?.id) return
    whois.value = r
    await bm.update(bookmarkId, { whois: r })
  } catch {}
  whoisLoading.value = false
}

// ---- 日期格式化 ----
function formatDate(str) {
  if (!str) return '-'
  const cleaned = str.trim()
  const d = new Date(cleaned)
  if (!isNaN(d)) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return cleaned
}

function isExpiringSoon(exp) {
  if (!exp) return false
  try {
    const d = new Date(exp.trim())
    if (isNaN(d)) return false
    const days = (d - new Date()) / (1000 * 60 * 60 * 24)
    return days < 90
  } catch { return false }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.chip { @apply px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 text-xs; }
</style>
