<script setup lang="ts">
defineProps<{ victory: boolean; seed: string }>()
defineEmits<{ menu: []; retry: [] }>()
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
  >
    <div class="text-6xl font-bold" :class="victory ? 'text-amber-400' : 'text-red-400'">
      {{ victory ? '通关！' : '游戏结束' }}
    </div>
    <div class="text-slate-400">
      种子 <span class="font-mono tracking-widest select-text">{{ seed }}</span>
    </div>
    <div class="flex gap-4">
      <button class="btn-primary" @click="$emit('retry')">同种子重来</button>
      <button class="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600" @click="$emit('menu')">
        返回主菜单
      </button>
    </div>
  </div>
</template>
