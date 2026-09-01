<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-md glass rounded-2xl shadow-glass p-5 animate-slide-up max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">分类环境管理</h3>
              <p class="text-xs text-slate-400">每个环境有独立的分类方案和书签分类映射</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <!-- 环境列表 -->
          <div class="flex-1 overflow-y-auto space-y-2">
            <div v-for="env in environments" :key="env.id"
                 :class="['rounded-xl p-3 transition', env.id === currentEnvId ? 'bg-accent/10 border border-accent/30' : 'bg-slate-50 dark:bg-slate-700/40']">
              <div class="flex items-center gap-2">
                <span class="flex-1 min-w-0">
                  <span class="font-medium text-sm">{{ env.name }}</span>
                  <span v-if="env.id === currentEnvId" class="text-[10px] text-accent ml-1">当前</span>
                  <div class="text-[10px] text-slate-400 mt-0.5">
                    {{ env.categoryCount }} 个分类 · {{ env.bookmarkCount }} 个书签映射
                  </div>
                </span>
                <button v-if="env.id !== currentEnvId" @click="doSwitch(env)" class="text-xs text-accent hover:underline shrink-0">切换</button>
                <button v-else class="text-xs text-slate-400 cursor-default shrink-0">使用中</button>
                <button @click="startRename(env)" class="text-xs text-slate-400 hover:text-slate-600 shrink-0">✏️</button>
                <button v-if="env.id !== currentEnvId" @click="doDelete(env)" class="text-xs text-red-400 hover:text-red-600 shrink-0">🗑️</button>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2 mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
            <button @click="openCreateDialog" class="btn-ghost text-xs flex-1 justify-center">＋ 新建环境</button>
            <button @click="openMirrorDialog" class="btn-ghost text-xs flex-1 justify-center">📋 镜像当前</button>
          </div>

          <div class="text-[11px] text-slate-400 mt-3 leading-relaxed">
            💡 切换环境会保存当前分类方案并加载目标环境；镜像会复制当前环境的分类和书签映射到新环境。
          </div>

          <!-- 重命名弹窗 -->
          <teleport to="body">
            <div v-if="renameDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="renameDialog.visible = false">
              <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
                <h3 class="text-sm font-semibold mb-3">重命名环境</h3>
                <input v-model="renameDialog.name" @keydown.enter="doRename" class="input text-sm" placeholder="环境名称" />
                <div class="flex justify-end gap-2 mt-3">
                  <button @click="renameDialog.visible = false" class="btn-ghost text-xs">取消</button>
                  <button @click="doRename" class="btn-accent text-xs">确定</button>
                </div>
              </div>
            </div>
          </teleport>

          <!-- 新建环境弹窗 -->
          <teleport to="body">
            <div v-if="createDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="createDialog.visible = false">
              <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
                <h3 class="text-sm font-semibold mb-3">新建环境</h3>
                <input v-model="createDialog.name" @keydown.enter="doCreate" class="input text-sm mb-3" placeholder="环境名称" ref="createInput" />
                <label class="flex items-center gap-2 text-xs text-slate-500 cursor-pointer mb-3">
                  <input type="checkbox" v-model="createDialog.copyCurrent" class="rounded" />
                  复制当前环境的分类方案
                </label>
                <div class="flex justify-end gap-2">
                  <button @click="createDialog.visible = false" class="btn-ghost text-xs">取消</button>
                  <button @click="doCreate" class="btn-accent text-xs">创建</button>
                </div>
              </div>
            </div>
          </teleport>

          <!-- 镜像环境弹窗 -->
          <teleport to="body">
            <div v-if="mirrorDialog.visible" class="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="mirrorDialog.visible = false">
              <div class="w-72 glass rounded-2xl shadow-glass p-4 animate-pop">
                <h3 class="text-sm font-semibold mb-3">镜像当前环境</h3>
                <input v-model="mirrorDialog.name" @keydown.enter="doMirror" class="input text-sm mb-2" placeholder="新环境名称（留空使用默认）" />
                <p class="text-[11px] text-slate-400 mb-3">将复制当前环境的分类方案和书签映射</p>
                <div class="flex justify-end gap-2">
                  <button @click="mirrorDialog.visible = false" class="btn-ghost text-xs">取消</button>
                  <button @click="doMirror" class="btn-accent text-xs">创建镜像</button>
                </div>
              </div>
            </div>
          </teleport>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'switched'])

const environments = ref([])
const currentEnvId = ref(null)
const createInput = ref(null)

const renameDialog = ref({ visible: false, env: null, name: '' })
const createDialog = ref({ visible: false, name: '', copyCurrent: false })
const mirrorDialog = ref({ visible: false, name: '' })

watch(() => props.modelValue, async (v) => {
  if (v) await load()
})

async function load() {
  const r = await window.api.invoke('env:list')
  environments.value = r.environments || []
  currentEnvId.value = r.currentEnvId
}

function close() { emit('update:modelValue', false) }

// 新建环境
function openCreateDialog() {
  createDialog.value = { visible: true, name: '', copyCurrent: false }
  nextTick(() => createInput.value?.focus())
}

async function doCreate() {
  const name = createDialog.value.name.trim()
  if (!name) {
    window.$toast('请输入环境名称', 'error')
    return
  }
  const r = await window.api.invoke('env:create', name, createDialog.value.copyCurrent)
  if (r.ok) {
    window.$toast(`环境「${r.env.name}」已创建`, 'success')
    createDialog.value.visible = false
    await load()
  } else {
    window.$toast('创建失败: ' + (r.error || ''), 'error')
  }
}

// 切换环境
async function doSwitch(env) {
  if (!confirm(`切换到环境「${env.name}」？\n当前环境的分类和书签映射将被保存，切换后加载目标环境的数据。`)) return
  const r = await window.api.invoke('env:switch', env.id)
  if (r.ok) {
    window.$toast(`已切换到「${env.name}」`, 'success')
    emit('switched')
    await load()
  } else {
    window.$toast('切换失败: ' + (r.error || ''), 'error')
  }
}

// 镜像环境
function openMirrorDialog() {
  mirrorDialog.value = { visible: true, name: '' }
}

async function doMirror() {
  const name = mirrorDialog.value.name.trim() || null
  const r = await window.api.invoke('env:mirror', name)
  if (r.ok) {
    window.$toast(`已创建镜像环境「${r.env.name}」`, 'success')
    mirrorDialog.value.visible = false
    await load()
  } else {
    window.$toast('镜像失败: ' + (r.error || ''), 'error')
  }
}

// 删除环境
async function doDelete(env) {
  if (!confirm(`确定删除环境「${env.name}」？`)) return
  const r = await window.api.invoke('env:delete', env.id)
  if (r.ok) {
    window.$toast('已删除', 'info')
    await load()
  } else {
    window.$toast('删除失败: ' + (r.error || ''), 'error')
  }
}

// 重命名
function startRename(env) {
  renameDialog.value = { visible: true, env, name: env.name }
}

async function doRename() {
  const { env, name } = renameDialog.value
  if (name && name.trim() && name.trim() !== env.name) {
    const r = await window.api.invoke('env:rename', env.id, name.trim())
    if (r.ok) {
      window.$toast('已重命名', 'success')
      await load()
    }
  }
  renameDialog.value.visible = false
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
