import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings.js'

/**
 * 视图状态：分栏（待分类/分类区）相关
 *  - 实际值以 settings.organizer 为主，viewState 负责在两个分栏的视图内
 *    双向同步 (v-model) 与启动时一次性从 settings 中恢复。
 *  - 由于 settings 已开启 deep watch 自动落盘，本 store 内的改动会同步到
 *    settings.value.organizer，从而持久化到 settings.json。
 */
export const useViewStateStore = defineStore('viewState', () => {
  const settingsStore = useSettingsStore()

  // 默认状态（首次启动使用）
  const defaults = {
    leftPaneWidth: 0.42,
    leftSelectedKey: 'unclassified',  // 'all' | 'unclassified' | categoryId
    leftExpandedIds: [],
    leftTreeCollapsed: false,        // 左窗分类树折叠状态（独立保存）
    leftPaneCollapsed: false,        // 整个 OrganizerPane 左窗被折叠成窄条
    rightSelectedKey: '',              // 分类 id；空表示未选中
    rightExpandedIds: [],
    rightTreeCollapsed: false,        // 右窗分类树折叠状态（独立保存）
    rightPaneCollapsed: false,       // 整个 OrganizerPane 右窗被折叠成窄条
    lastActiveSide: 'right',
    sidebarExpandedIds: [],            // Sidebar.vue 自带的分类树展开状态
    sidebarCollapsed: false            // 最左 Sidebar 折叠成窄条
  }

  const organizer = ref({ ...defaults })
  const loaded = ref(false)
  // 分类环境管理弹窗（不在 organizer 中，存储在 store 实例级别）
  const envManagerOpen = ref(false)

  function load() {
    const incoming = settingsStore.settings?.organizer
    if (incoming && typeof incoming === 'object') {
      organizer.value = { ...defaults, ...incoming }
      // 兼容字段缺失
      organizer.value.leftExpandedIds = Array.isArray(incoming.leftExpandedIds) ? [...incoming.leftExpandedIds] : []
      organizer.value.rightExpandedIds = Array.isArray(incoming.rightExpandedIds) ? [...incoming.rightExpandedIds] : []
      // 兼容新增折叠字段
      if (typeof incoming.leftTreeCollapsed !== 'boolean') organizer.value.leftTreeCollapsed = defaults.leftTreeCollapsed
      if (typeof incoming.rightTreeCollapsed !== 'boolean') organizer.value.rightTreeCollapsed = defaults.rightTreeCollapsed
      // 兼容新增整窗折叠字段
      if (typeof incoming.leftPaneCollapsed !== 'boolean') organizer.value.leftPaneCollapsed = defaults.leftPaneCollapsed
      if (typeof incoming.rightPaneCollapsed !== 'boolean') organizer.value.rightPaneCollapsed = defaults.rightPaneCollapsed
      if (typeof incoming.sidebarCollapsed !== 'boolean') organizer.value.sidebarCollapsed = defaults.sidebarCollapsed
    } else {
      organizer.value = { ...defaults }
    }
    loaded.value = true
  }

  // 把内存中的 organizer 写回 settings，由 settings watch 自动落盘
  function syncToSettings() {
    settingsStore.settings.organizer = { ...organizer.value }
  }

  function setLeftPaneWidth(ratio) {
    const v = Math.max(0.2, Math.min(0.7, Number(ratio) || defaults.leftPaneWidth))
    organizer.value.leftPaneWidth = v
    syncToSettings()
  }

  function selectLeft(key) {
    organizer.value.leftSelectedKey = key || 'all'
    organizer.value.lastActiveSide = 'left'
    syncToSettings()
  }

  function selectRight(key) {
    organizer.value.rightSelectedKey = key || ''
    organizer.value.lastActiveSide = 'right'
    syncToSettings()
  }

  function toggleLeftExpanded(id) {
    if (!id) return
    const set = new Set(organizer.value.leftExpandedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    organizer.value.leftExpandedIds = [...set]
    syncToSettings()
  }

  function toggleRightExpanded(id) {
    if (!id) return
    const set = new Set(organizer.value.rightExpandedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    organizer.value.rightExpandedIds = [...set]
    syncToSettings()
  }

  function setLastActiveSide(side) {
    if (side !== 'left' && side !== 'right') return
    organizer.value.lastActiveSide = side
    syncToSettings()
  }

  function setExpandedIds(side, ids) {
    if (side === 'left') organizer.value.leftExpandedIds = [...ids]
    else if (side === 'right') organizer.value.rightExpandedIds = [...ids]
    syncToSettings()
  }

  function toggleLeftTreeCollapsed() {
    organizer.value.leftTreeCollapsed = !organizer.value.leftTreeCollapsed
    syncToSettings()
  }

  function toggleRightTreeCollapsed() {
    organizer.value.rightTreeCollapsed = !organizer.value.rightTreeCollapsed
    syncToSettings()
  }

  function toggleLeftPaneCollapsed() {
    organizer.value.leftPaneCollapsed = !organizer.value.leftPaneCollapsed
    syncToSettings()
  }

  function toggleRightPaneCollapsed() {
    organizer.value.rightPaneCollapsed = !organizer.value.rightPaneCollapsed
    syncToSettings()
  }

  function toggleSidebarCollapsed() {
    organizer.value.sidebarCollapsed = !organizer.value.sidebarCollapsed
    syncToSettings()
  }

  return {
    organizer,
    loaded,
    load,
    setLeftPaneWidth,
    selectLeft,
    selectRight,
    toggleLeftExpanded,
    toggleRightExpanded,
    setLastActiveSide,
    setExpandedIds,
    syncToSettings,
    toggleLeftTreeCollapsed,
    toggleRightTreeCollapsed,
    toggleLeftPaneCollapsed,
    toggleRightPaneCollapsed,
    toggleSidebarCollapsed,
    envManagerOpen,
    sidebarExpandedIds: computed(() => organizer.value.sidebarExpandedIds || [])
  }
})
