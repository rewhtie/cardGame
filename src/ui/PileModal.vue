<script setup lang="ts">
import { computed } from 'vue'
import CardPanel from './CardPanel.vue'
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
    class="absolute inset-0 z-[55] bg-black/80 flex items-center justify-center p-8"
    @click.self="emit('close')"
  >
    <CardPanel
      :title="`${title}（${pile.length}）`"
      class="w-[1100px]"
      closable
      @close="emit('close')"
    >
      <div v-if="items.length" class="flex flex-wrap justify-center content-start gap-4">
        <CardView
          v-for="(card, i) in items"
          :key="`${i}-${card.id}`"
          :card="card"
          :playable="true"
        />
      </div>
      <div v-else class="py-10 text-center text-slate-400">空</div>
    </CardPanel>
  </div>
</template>
