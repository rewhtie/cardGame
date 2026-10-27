<script setup lang="ts">
import { computed } from 'vue'
import CardView from './CardView.vue'
import type { CardDef } from '@/engine/types'

/** 牌被塞进牌组 / 牌堆的演出：从场中央弹出，停一下，再飞向牌堆按钮；不挡点击 */
const props = defineProps<{
  card: CardDef
  /** deck 为永久牌组，draw / discard 为本场战斗牌堆 */
  to: 'deck' | 'draw' | 'discard'
  destination?: { x: number; y: number }
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
const style = computed(() => ({
  animationDelay: `${props.delay}ms`,
  '--dx': `${dx.value}px`,
  ...(props.destination && {
    '--end-left': `${props.destination.x}px`,
    '--end-top': `${props.destination.y}px`,
  }),
}))
</script>

<template>
  <div class="card-add" :class="to" :style="style">
    <CardView :card="card" :playable="true" class="pointer-events-none" />
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
  animation: add-to-pile 1.4s ease-in-out both;
  filter: drop-shadow(0 0 24px rgba(168, 85, 247, 0.85));
}
.card-add.deck {
  --end-left: calc(100% - 8rem);
  --end-top: 1.5rem;
}
.card-add.draw {
  --end-left: 3rem;
  --end-top: calc(100% - 5rem);
}
.card-add.discard {
  --end-left: calc(100% - 9rem);
  --end-top: calc(100% - 5rem);
}
/* 0-25% 弹出，25-60% 停留，之后飞走缩小 */
@keyframes add-to-pile {
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
    left: var(--end-left);
    top: var(--end-top);
    transform: translate(-50%, -50%) scale(0.12);
  }
}
</style>
