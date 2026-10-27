<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { relics } from '@/data/items'

defineProps<{ choices: string[] }>()
defineEmits<{ choose: [id: string] }>()
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-8 theme-bg text-slate-100"
  >
    <div class="text-4xl font-bold text-sky-300"><Emoji e="🏺" /> 先古遗物</div>
    <div class="text-slate-400">三选一，开启这一局的旅程</div>
    <div class="flex gap-6">
      <button
        v-for="id in choices"
        :key="id"
        class="w-56 h-64 rounded-lg bg-slate-800 border-2 border-sky-400 hover:border-amber-400 hover:-translate-y-2 transition flex flex-col items-center justify-center gap-4 p-4"
        @click="$emit('choose', id)"
      >
        <span class="text-6xl"><Emoji :e="relics[id]?.icon" /></span>
        <span class="text-xl font-bold text-sky-200">{{ relics[id]?.name }}</span>
        <span class="text-sm text-slate-100 text-center leading-relaxed">{{ relics[id]?.text }}</span>
        <span v-if="relics[id]?.lore" class="text-xs italic text-slate-300 text-center leading-relaxed">{{ relics[id]?.lore }}</span>
      </button>
    </div>
  </div>
</template>
