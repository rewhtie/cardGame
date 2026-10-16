<script setup lang="ts">
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-8 theme-bg text-slate-100"
  >
    <div class="text-6xl font-bold text-amber-400">CardFire</div>
    <button class="btn-primary text-xl px-10" @click="emit('start')">开始游戏</button>
  </div>
</template>
