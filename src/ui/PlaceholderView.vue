<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
defineProps<{ icon: string; label: string }>()
defineEmits<{ leave: [] }>()
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
  >
    <div class="text-6xl"><Emoji :e="icon" /></div>
    <div class="text-3xl font-bold">{{ label }}</div>
    <div class="text-slate-400">这个房间还没有实现，直接通过。</div>
    <button class="btn-primary" @click="$emit('leave')">离开</button>
  </div>
</template>
