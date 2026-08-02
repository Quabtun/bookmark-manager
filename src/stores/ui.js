import { defineStore } from 'pinia'
import { ref } from 'vue'

// favicon 和预览图缓存（data url），避免重复 IPC 读取
export const useUiStore = defineStore('ui', () => {
  const faviconCache = ref(new Map())  // fileName -> dataUrl
  const previewCache = ref(new Map())  // url -> { preview, imageDataUrl }
  const batchProgress = ref({ active: false, kind: '', done: 0, total: 0 })

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
    if (preview && preview.image) {
      imageDataUrl = await window.api.invoke('preview:image', url)
    }
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

  return {
    faviconCache, previewCache, batchProgress,
    getFavicon, clearFavicon,
    getPreview, refreshPreview, clearPreview
  }
})
