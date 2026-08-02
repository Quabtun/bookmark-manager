<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="close">
        <div class="w-full max-w-md glass rounded-2xl shadow-glass p-5 animate-slide-up">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">{{ title }}</h3>
            <button @click="close" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <!-- 图标 + 结果 -->
          <div class="flex flex-col items-center py-4 gap-3">
            <div class="text-5xl">{{ icon }}</div>
            <p class="text-sm text-center text-slate-600 dark:text-slate-300">{{ message }}</p>
            <div v-if="details" class="text-xs text-slate-400 text-center space-y-1">
              <div v-for="(d, i) in details" :key="i">{{ d }}</div>
            </div>
          </div>

          <div class="flex justify-center">
            <button @click="close" class="btn-accent px-6">确定</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  title: String,
  icon: String,
  message: String,
  details: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])
const visible = ref(false)

watch(() => props.modelValue, (v) => { visible.value = v })

function close() { emit('update:modelValue', false) }
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
