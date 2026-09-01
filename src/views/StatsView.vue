<template>
  <div class="h-screen flex flex-col bg-theme">
    <!-- 顶栏 -->
    <div class="px-5 py-3 bg-[var(--surface-base)] border-b border-[var(--stroke-subtle)] flex items-center gap-3">
      <router-link to="/" custom v-slot="{ navigate }">
        <button @click="navigate" class="btn-ghost">← 返回</button>
      </router-link>
      <h2 class="text-lg font-semibold">📊 统计仪表盘</h2>
      <span class="text-xs text-slate-400 ml-auto">{{ totalBookmarks }} 个书签</span>
    </div>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-4xl mx-auto space-y-6">

        <!-- 1. 分类分布 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-4">📁 分类分布</h3>
          <div class="space-y-2.5" v-if="categoryStats.length > 0">
            <div v-for="cat in categoryStats" :key="cat.id" class="flex items-center gap-3">
              <span class="w-24 text-sm truncate text-right text-slate-600 dark:text-slate-300">{{ cat.icon }} {{ cat.name }}</span>
              <div class="flex-1 h-6 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500" :style="{ width: cat.percent + '%', background: cat.color || 'var(--accent-500)' }"></div>
              </div>
              <span class="w-20 text-xs text-slate-500 text-right">{{ cat.count }} ({{ cat.percent }}%)</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400 text-center py-4">暂无数据</div>
        </section>

        <!-- 2. 状态分布 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-4">🩺 状态分布</h3>
          <div class="flex flex-wrap justify-center gap-6" v-if="totalBookmarks > 0">
            <div v-for="st in statusStats" :key="st.key" class="flex flex-col items-center gap-1">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" :stroke="st.trackColor" stroke-width="8" />
                <circle cx="40" cy="40" r="32" fill="none" :stroke="st.color" stroke-width="8"
                        stroke-linecap="round"
                        :stroke-dasharray="st.dashArray"
                        stroke-dashoffset="25.13"
                        transform="rotate(-90 40 40)" />
              </svg>
              <span class="text-2xl font-bold" :style="{ color: st.color }">{{ st.count }}</span>
              <span class="text-xs text-slate-400">{{ st.label }}</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400 text-center py-4">暂无数据</div>
        </section>

        <!-- 3. 添加趋势 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-4">📈 添加趋势（最近 12 个月）</h3>
          <div v-if="monthlyTrend.length > 0" class="relative" style="height: 200px;">
            <svg :width="chartWidth" :height="200" class="w-full h-full" preserveAspectRatio="none" :viewBox="'0 0 ' + chartWidth + ' 200'">
              <!-- Y轴网格线 -->
              <line v-for="n in 5" :key="'grid-'+n" :x1="40" :y1="10 + (n-1)*45" :x2="chartWidth - 10" :y2="10 + (n-1)*45"
                    stroke="#e2e8f0" stroke-width="0.5" class="dark:stroke-slate-700" />
              <!-- Y轴标签 -->
              <text v-for="n in 5" :key="'label-'+n" :x="35" :y="14 + (n-1)*45" text-anchor="end" font-size="10" fill="#94a3b8">
                {{ Math.round(maxTrend - (n-1) * (maxTrend / 4)) }}
              </text>
              <!-- 折线 -->
              <polyline fill="none" stroke="var(--accent-500)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                        :points="trendPoints" />
              <!-- 填充区域 -->
              <polygon :points="trendAreaPoints" fill="var(--accent-500)" opacity="0.1" />
              <!-- 数据点 + X轴标签 -->
              <g v-for="(pt, i) in monthlyTrend" :key="'pt-'+i">
                <circle :cx="pt.x" :cy="pt.y" r="3.5" fill="var(--accent-500)" />
                <circle :cx="pt.x" :cy="pt.y" r="2" fill="white" class="dark:fill-slate-800" />
                <text :x="pt.x" :y="195" text-anchor="middle" font-size="10" fill="#94a3b8">{{ pt.label }}</text>
              </g>
            </svg>
          </div>
          <div v-else class="text-sm text-slate-400 text-center py-4">暂无数据</div>
        </section>

        <!-- 4. 使用频率 TOP 10 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-4">🔥 使用频率 TOP 10</h3>
          <div class="space-y-2" v-if="topFrequent.length > 0">
            <div v-for="(item, idx) in topFrequent" :key="item.id" class="flex items-center gap-3">
              <span class="w-5 text-xs text-slate-400 text-right font-mono">{{ idx + 1 }}</span>
              <span class="flex-1 text-sm truncate" :title="item.title">{{ item.title }}</span>
              <span class="text-xs text-slate-500 w-16 text-right">{{ item.openCount }} 次</span>
              <div class="w-32 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full" style="background: var(--accent-500)" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400 text-center py-4">暂无使用记录</div>
        </section>

        <!-- 5. 书签健康状态 -->
        <section class="glass rounded-2xl p-5">
          <h3 class="font-semibold mb-4">🩺 书签健康状态</h3>
          <div v-if="totalBookmarks > 0" class="space-y-3">
            <div v-for="st in healthBars" :key="st.key" class="flex items-center gap-3">
              <span class="w-20 text-sm text-right text-slate-600 dark:text-slate-300">{{ st.label }}</span>
              <div class="flex-1 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden relative">
                <div class="h-full rounded-lg transition-all duration-500 flex items-center pl-3"
                     :style="{ width: st.percent + '%', background: st.color, minWidth: st.count > 0 ? '28px' : '0' }">
                  <span v-if="st.percent > 8" class="text-white text-xs font-medium">{{ st.count }}</span>
                </div>
                <span v-if="st.percent <= 8 && st.count > 0" class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{{ st.count }}</span>
              </div>
              <span class="w-16 text-xs text-slate-500 text-right">{{ st.percent }}%</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400 text-center py-4">暂无数据</div>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useBookmarksStore } from '../stores/bookmarks.js'
import { useCategoriesStore } from '../stores/categories.js'

const bm = useBookmarksStore()
const cats = useCategoriesStore()

const totalBookmarks = computed(() => bm.bookmarks.length)

// 1. 分类分布
const categoryStats = computed(() => {
  const all = bm.bookmarks
  if (all.length === 0) return []
  const map = {}
  for (const b of all) {
    const catId = b.categoryId || 'unclassified'
    map[catId] = (map[catId] || 0) + 1
  }
  const result = Object.entries(map)
    .map(([id, count]) => {
      const cat = cats.byId[id]
      return {
        id, count,
        name: cat ? cat.name : '未分类',
        icon: cat ? cat.icon : '📁',
        color: cat ? cat.color : '#64748b',
        percent: ((count / all.length) * 100).toFixed(1)
      }
    })
    .sort((a, b) => b.count - a.count)
  return result
})

// 2. 状态分布
const STATUS_COLORS = {
  ok: { color: '#22c55e', label: '正常', trackColor: '#22c55e33' },
  dead: { color: '#ef4444', label: '失效', trackColor: '#ef444433' },
  warn: { color: '#f59e0b', label: '异常', trackColor: '#f59e0b33' },
  redirect: { color: '#3b82f6', label: '跳转', trackColor: '#3b82f633' },
  unknown: { color: '#94a3b8', label: '未知', trackColor: '#94a3b833' }
}

const statusStats = computed(() => {
  const all = bm.bookmarks
  const total = all.length || 1
  const counts = { ok: 0, dead: 0, warn: 0, redirect: 0, unknown: 0 }
  for (const b of all) {
    const s = b.status || 'unknown'
    counts[s] = (counts[s] || 0) + 1
  }
  return Object.entries(counts).map(([key, count]) => {
    const info = STATUS_COLORS[key] || STATUS_COLORS.unknown
    const ratio = count / total
    const circumference = 2 * Math.PI * 32 // ~201.06
    const dashLen = ratio * circumference
    return {
      key, count, ...info,
      dashArray: `${dashLen} ${circumference}`
    }
  })
})

// 3. 添加趋势（最近 12 个月）
const monthlyTrend = computed(() => {
  const all = bm.bookmarks
  if (all.length === 0) return []

  const now = new Date()
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    months.push({ y, m, label: (m + 1) + '月' })
  }

  const counts = new Array(12).fill(0)
  for (const b of all) {
    const t = b.addedAt || b.createdAt || 0
    if (!t) continue
    const d = new Date(t)
    for (let i = 0; i < 12; i++) {
      if (d.getFullYear() === months[i].y && d.getMonth() === months[i].m) {
        counts[i]++
        break
      }
    }
  }

  const maxVal = Math.max(...counts, 1)
  const chartW = 600
  const padLeft = 45
  const padRight = 15
  const padTop = 15
  const padBottom = 25
  const plotW = chartW - padLeft - padRight
  const plotH = 200 - padTop - padBottom

  return months.map((m, i) => ({
    label: m.label,
    count: counts[i],
    x: padLeft + (i / 11) * plotW,
    y: padTop + plotH - (counts[i] / maxVal) * plotH
  }))
})

const maxTrend = computed(() => {
  if (monthlyTrend.value.length === 0) return 0
  return Math.max(...monthlyTrend.value.map(m => m.count), 1)
})

const chartWidth = 600

const trendPoints = computed(() => {
  return monthlyTrend.value.map(p => `${p.x},${p.y}`).join(' ')
})

const trendAreaPoints = computed(() => {
  const pts = monthlyTrend.value
  if (pts.length === 0) return ''
  const first = pts[0]
  const last = pts[pts.length - 1]
  const bottom = 200 - 25 // padBottom
  return `${first.x},${bottom} ` + pts.map(p => `${p.x},${p.y}`).join(' ') + ` ${last.x},${bottom}`
})

// 书签健康状态条形图
const HEALTH_COLORS = {
  ok: '#22c55e',
  dead: '#ef4444',
  warn: '#f59e0b',
  redirect: '#3b82f6',
  unknown: '#94a3b8'
}
const HEALTH_LABELS = {
  ok: '正常',
  dead: '失效',
  warn: '异常',
  redirect: '跳转',
  unknown: '未知'
}
const healthBars = computed(() => {
  const all = bm.bookmarks
  const total = all.length || 1
  const counts = { ok: 0, dead: 0, warn: 0, redirect: 0, unknown: 0 }
  for (const b of all) {
    const s = b.status || 'unknown'
    counts[s] = (counts[s] || 0) + 1
  }
  return Object.entries(counts).map(([key, count]) => ({
    key,
    count,
    label: HEALTH_LABELS[key] || key,
    color: HEALTH_COLORS[key] || '#94a3b8',
    percent: ((count / total) * 100).toFixed(1)
  }))
})

// 4. 使用频率 TOP 10
const topFrequent = computed(() => {
  const all = bm.bookmarks
    .filter(b => (b.openCount || 0) > 0)
    .sort((a, b) => (b.openCount || 0) - (a.openCount || 0))
    .slice(0, 10)

  const maxOpen = all.length > 0 ? (all[0].openCount || 1) : 1
  return all.map(b => ({
    id: b.id,
    title: b.title || b.url,
    openCount: b.openCount || 0,
    percent: ((b.openCount || 0) / maxOpen * 100).toFixed(1)
  }))
})
</script>