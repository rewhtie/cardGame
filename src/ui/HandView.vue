<script setup lang="ts">
import { computed } from 'vue'
import CardView from './CardView.vue'
import type { CardDef } from '@/engine/types'

const props = defineProps<{
  hand: string[]
  cards: Readonly<Record<string, CardDef>>
  energy: number
  /** 正在被拖拽的手牌下标，用于淡化原位置的卡牌 */
  draggingIndex?: number | null
  /** 玩家状态：用于把卡面数值换算成最终值 */
  playerStatuses?: Record<string, number>
  /** 拖拽中指向的敌人状态：只作用于被拖拽的那张牌 */
  targetStatuses?: Record<string, number>
}>()
const emit = defineEmits<{ press: [handIndex: number, event: PointerEvent] }>()

const items = computed(() =>
  props.hand.flatMap((id, index) => {
    const card = props.cards[id]
    return card ? [{ card, index, playable: card.cost === 'X' || card.cost <= props.energy }] : []
  }),
)
</script>

<template>
  <!-- 占满两侧面板之间的空间；放不下时各牌槽等比收窄，卡面叠放，悬浮的牌置顶显示全貌 -->
  <div class="flex-1 min-w-0 flex justify-center gap-3 min-h-56">
    <div
      v-for="item in items"
      :key="`${item.index}-${item.card.id}`"
      class="relative z-0 basis-36 shrink min-w-0 last:shrink-0 hover:z-10"
    >
      <CardView
        :card="item.card"
        :playable="item.playable"
        :statuses="playerStatuses"
        :target-statuses="draggingIndex === item.index ? targetStatuses : undefined"
        :class="draggingIndex === item.index ? 'opacity-30' : ''"
        @pointerdown.prevent="(e: PointerEvent) => emit('press', item.index, e)"
      />
    </div>
  </div>
</template>
