<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { characters } from '@/data/characters'
import { relics } from '@/data/items'

defineEmits<{ choose: [id: string]; back: [] }>()
</script>

<template>
  <div
    class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 theme-bg text-slate-100"
  >
    <div class="text-4xl font-bold text-amber-300">选择职业</div>
    <div class="flex gap-6">
      <button
        v-for="c in characters"
        :key="c.id"
        class="w-64 rounded-lg bg-slate-800 border-2 border-amber-600 hover:border-amber-300 hover:-translate-y-2 transition flex flex-col items-center gap-3 p-5 text-slate-100 cursor-pointer"
        @click="$emit('choose', c.id)"
      >
        <span class="text-7xl"><Emoji :e="c.icon" /></span>
        <span class="text-xl font-bold">{{ c.name }}</span>
        <span class="text-sm text-slate-300 text-center">{{ c.desc }}</span>
        <span v-for="r in c.relics" :key="r" class="text-xs text-amber-200 text-center">
          <Emoji :e="relics[r]?.icon" /> {{ relics[r]?.name }}：{{ relics[r]?.text }}
        </span>
      </button>
    </div>
    <button
      class="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 border-0 cursor-pointer"
      @click="$emit('back')"
    >
      返回
    </button>
  </div>
</template>
