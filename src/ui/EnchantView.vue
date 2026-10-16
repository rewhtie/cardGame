<script setup lang="ts">
import { computed } from 'vue'
import { isEnchanted, resolveCards } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import CardView from './CardView.vue'

const props = defineProps<{ deck: string[]; cards: Readonly<Record<string, CardDef>> }>()
defineEmits<{ pick: [deckIndex: number] }>()

const items = computed(() => {
  const defs = resolveCards(props.cards, props.deck)
  return props.deck.flatMap((id, index) => {
    const card = defs[id]
    return card && !isEnchanted(id) ? [{ card, index }] : []
  })
})
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
  >
    <div class="text-3xl font-bold">📖 训练指南</div>
    <div class="text-slate-400">选择一张牌附魔：每场战斗中每打出一次，卡面数值 +1</div>
    <div class="flex flex-wrap justify-center gap-3 max-w-[1000px]">
      <CardView
        v-for="item in items"
        :key="item.index"
        :card="item.card"
        :playable="true"
        @click="$emit('pick', item.index)"
      />
    </div>
  </div>
</template>
