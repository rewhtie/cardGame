<script setup lang="ts">
import { computed } from 'vue'
import CardPanel from './CardPanel.vue'
import UpgradableCard from './UpgradableCard.vue'
import { isForgeable, resolveCards, upgradedId } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'

const props = defineProps<{
  title: string
  pile: string[]
  cards: Readonly<Record<string, CardDef>>
  /** 战斗中按实例 id 记的进化计数 */
  evolveCounts?: Record<string, number>
  /** 抽牌堆需隐藏顺序 */
  sorted?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const items = computed(() => {
  const defs = props.pile.flatMap((id) => {
    const card = props.cards[id]
    if (!card) return []
    // 右键预览升级后的牌面；已升级 / 诅咒 / 状态牌没有升级版
    const up = upgradedId(id)
    const upgraded = isForgeable(props.cards, id) ? resolveCards(props.cards, [up])[up] : undefined
    return [{ card, upgraded }]
  })
  return props.sorted ? [...defs].sort((a, b) => a.card.id.localeCompare(b.card.id)) : defs
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
        <UpgradableCard
          v-for="(it, i) in items"
          :key="`${i}-${it.card.id}`"
          :card="it.card"
          :upgraded="it.upgraded"
          :progress="evolveCounts?.[it.card.id]"
        />
      </div>
      <div v-else class="py-10 text-center text-slate-400">空</div>
    </CardPanel>
  </div>
</template>
