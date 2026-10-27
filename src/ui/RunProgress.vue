<script setup lang="ts">
defineProps<{
  progress: { stage: number; floor: number }
}>()
</script>

<template>
  <div class="flex items-center gap-3 shrink-0 text-sm whitespace-nowrap">
    <span :class="progress.stage > 1 ? 'text-amber-200' : 'text-sky-200'">
      {{ progress.stage === 1 ? '第一阶段' : '第二阶段' }}
    </span>
    <span class="text-slate-100 tabular-nums">第 {{ progress.floor }} 层</span>
  </div>
</template>
