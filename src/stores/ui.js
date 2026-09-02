import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const kinds = ['validate', 'preview']

export const useUiStore = defineStore('ui', () => {
  const faviconCache = ref(new Map())
  const previewCache = ref(new Map())
  const screenshotCache = ref(new Map())
  const batchProgress = ref({
    validate: { active: false, kind: 'validate', done: 0, total: 0 },
    preview: { active: false, kind: 'preview', done: 0, total: 0 }
  })
  const isBatchRunning = computed(() => kinds.some((kind) => batchProgress.value[kind].active))

  function startBatchProgress(kind, total) {
    if (!kinds.includes(kind)) return
    batchProgress.value[kind] = { active: true, kind, done: 0, total }
  }

  function updateBatchProgress(kind, progress) {
    if (!kinds.includes(kind) || !batchProgress.value[kind].active) return
    batchProgress.value[kind] = { active: true, kind, ...progress }
    if (progress.done >= progress.total) finishBatchProgress(kind)
  }

  function finishBatchProgress(kind) {
    if (!kinds.includes(kind) || !batchProgress.value[kind].active) return
    batchProgress.value[kind] = { ...batchProgress.value[kind], active: false }
  }

  function stopBatchProgress(kind) {
    if (!kinds.includes(kind)) return
    batchProgress.value[kind] = { ...batchProgress.value[kind], active: false }
  }

  async function getFavicon(fileName) {
    if (!fileName) return null
    if (faviconCache.value.has(fileName)) return faviconCache.value.get(fileName)
    const dataUrl = await window.api.invoke('favicon:path', fileName)
    faviconCache.value.set(fileName, dataUrl)
    return dataUrl
  }

  function clearFavicon(fileName) {
    if (fileName) faviconCache.value.delete(fileName)
    else faviconCache.value.clear()
  }

  async function getPreview(url) {
    if (previewCache.value.has(url)) return previewCache.value.get(url)
    const preview = await window.api.invoke('preview:get', url)
    let imageDataUrl = null
    if (preview && preview.image) imageDataUrl = await window.api.invoke('preview:image', url)
    const entry = { preview, imageDataUrl }
    previewCache.value.set(url, entry)
    return entry
  }

  async function refreshPreview(url) {
    previewCache.value.delete(url)
    return getPreview(url)
  }

  function clearPreview(url) {
    if (url) previewCache.value.delete(url)
    else previewCache.value.clear()
  }

  async function getScreenshot(url) {
    if (!url) return null
    if (screenshotCache.value.has(url)) return screenshotCache.value.get(url)
    const dataUrl = await window.api.invoke('screenshot:get', url)
    if (dataUrl) screenshotCache.value.set(url, dataUrl)
    return dataUrl
  }

  async function captureScreenshot(url) {
    const result = await window.api.invoke('screenshot:capture', url)
    if (result.ok) {
      screenshotCache.value.delete(url)
      const dataUrl = await window.api.invoke('screenshot:get', url)
      if (dataUrl) screenshotCache.value.set(url, dataUrl)
    }
    return result
  }

  function clearScreenshot(url) {
    if (url) screenshotCache.value.delete(url)
    else screenshotCache.value.clear()
  }

  return {
    faviconCache, previewCache, screenshotCache, batchProgress, isBatchRunning,
    startBatchProgress, updateBatchProgress, finishBatchProgress, stopBatchProgress,
    getFavicon, clearFavicon, getPreview, refreshPreview, clearPreview,
    getScreenshot, captureScreenshot, clearScreenshot
  }
})
