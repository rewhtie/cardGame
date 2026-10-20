<script setup lang="ts">
import { computed } from 'vue'
import CardView from './CardView.vue'
import type { CardDef } from '@/engine/types'

/** 牌被塞进牌组 / 弃牌堆的演出：从场中央弹出，停一下，再飞向牌堆按钮；不挡点击 */
const props = defineProps<{
  card: CardDef
  /** deck：飞向右上角的牌组按钮；discard：飞向右下角的弃牌堆 */
  to: 'deck' | 'discard'
  delay: number
  /** 本批第几张 / 共几张：像手牌一样横向并排居中，放不下时互相叠放 */
  index: number
  total: number
}>()

const CARD_W = 144 // 9rem
const GAP = 12
const SPREAD_MAX = 1000
const dx = computed(() => {
  const step = props.total > 1 ? Math.min(CARD_W + GAP, (SPREAD_MAX - CARD_W) / (props.total - 1)) : 0
  return (props.index - (props.total - 1) / 2) * step
})
</script>

<template>
  <div class="card-add" :class="to" :style="{ animationDelay: `${delay}ms`, '--dx': `${dx}px` }">
    <CardView :card="card" :playable="false" class="pointer-events-none" />
  </div>
</template>

<style scoped>
.card-add {
  position: absolute;
  z-index: 65;
  left: calc(50% + var(--dx));
  top: 50%;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.4);
  animation-duration: 1.4s;
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
  filter: drop-shadow(0 0 24px rgba(168, 85, 247, 0.85));
}
.card-add.deck {
  animation-name: add-to-deck;
}
.card-add.discard {
  animation-name: add-to-discard;
}
/* 0-25% 弹出，25-60% 停留，之后飞走缩小 */
@keyframes add-to-deck {
  0% {
    opacity: 0;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(0.4);
  }
  25% {
    opacity: 1;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(1.1);
  }
  60% {
    opacity: 1;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    left: calc(100% - 8rem);
    top: 1.5rem;
    transform: translate(-50%, -50%) scale(0.12);
  }
}
@keyframes add-to-discard {
  0% {
    opacity: 0;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(0.4);
  }
  25% {
    opacity: 1;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(1.1);
  }
  60% {
    opacity: 1;
    left: calc(50% + var(--dx));
    top: 50%;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    left: calc(100% - 9rem);
    top: calc(100% - 5rem);
    transform: translate(-50%, -50%) scale(0.12);
  }
}
</style>
