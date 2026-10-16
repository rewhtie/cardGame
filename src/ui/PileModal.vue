<script setup lang="ts">
import { computed } from 'vue'
import CardView from './CardView.vue'
import type { CardDef } from '@/engine/types'

const props = defineProps<{
  title: string
  pile: string[]
  cards: Readonly<Record<string, CardDef>>
  /** 抽牌堆需隐藏顺序 */
  sorted?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const items = computed(() => {
  const defs = props.pile.flatMap((id) => {
    const card = props.cards[id]
    return card ? [card] : []
  })
  return props.sorted ? [...defs].sort((a, b) => a.id.localeCompare(b.id)) : defs
})
</script>

<template>
  <div
    class="absolute inset-0 z-20 bg-black/80 flex flex-col items-center gap-4 p-8"
    @click.self="emit('close')"
  >
    <div class="text-2xl font-bold">{{ title }}（{{ pile.length }}）</div>
    <div
      v-if="items.length"
      class="flex-1 w-full overflow-y-auto flex flex-wrap justify-start content-start gap-3 px-8 pt-8 pb-6"
      @click.self="emit('close')"
    >
      <CardView v-for="(card, i) in items" :key="`${i}-${card.id}`" :card="card" :playable="true" />
    </div>
    <div v-else class="flex-1 text-slate-400">空</div>
    <button class="btn-primary" @click="emit('close')">关闭</button>
  </div>
</template>
