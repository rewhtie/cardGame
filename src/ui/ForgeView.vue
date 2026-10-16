<script setup lang="ts">
import { computed } from 'vue'
import { isUpgraded, resolveCards, upgradedId } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import AnvilIcon from './AnvilIcon.vue'
import UpgradableCard from './UpgradableCard.vue'

const props = defineProps<{ deck: string[]; cards: Readonly<Record<string, CardDef>> }>()
defineEmits<{ pick: [deckIndex: number]; back: [] }>()

const defs = computed(() =>
  resolveCards(props.cards, [...props.deck, ...props.deck.map(upgradedId)]),
)

const items = computed(() =>
  props.deck.flatMap((id, index) => {
    const card = defs.value[id]
    const upgraded = defs.value[upgradedId(id)]
    return card && upgraded && !isUpgraded(id) ? [{ card, upgraded, index }] : []
  }),
)
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
  >
    <div class="flex items-center gap-3 text-3xl font-bold">
      <AnvilIcon class="w-10 h-10" />锻造
    </div>
    <div class="text-slate-400">左键选择一张牌升级，右键查看升级前后的对比。</div>
    <div class="flex flex-wrap justify-center gap-3 max-w-[1000px]">
      <UpgradableCard
        v-for="item in items"
        :key="item.index"
        :card="item.card"
        :upgraded="item.upgraded"
        @click="$emit('pick', item.index)"
      />
    </div>
    <button class="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600" @click="$emit('back')">
      返回
    </button>
  </div>
</template>
