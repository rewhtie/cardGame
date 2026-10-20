<script setup lang="ts">
import { computed } from 'vue'
import { isUpgraded, resolveCards, upgradedId } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import AnvilIcon from './AnvilIcon.vue'
import CardPanel from './CardPanel.vue'
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
    class="absolute inset-0 z-[55] flex items-center justify-center p-8 theme-bg text-slate-100"
  >
    <CardPanel hint="左键选择一张牌升级，右键查看升级前后的对比。" closable @close="$emit('back')">
      <template #title><AnvilIcon class="w-9 h-9" />锻造</template>
      <div class="flex flex-wrap justify-center gap-4">
        <UpgradableCard
          v-for="item in items"
          :key="item.index"
          :card="item.card"
          :upgraded="item.upgraded"
          @click="$emit('pick', item.index)"
        />
      </div>
    </CardPanel>
  </div>
</template>
