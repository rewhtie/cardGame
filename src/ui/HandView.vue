<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CardView from './CardView.vue'
import { progressOf } from '@/engine/enchant'
import { previewDamage } from '@/engine/preview'
import { displayCost } from '@/engine/swordSaint'
import type { BattleState, CardDef } from '@/engine/types'

const props = defineProps<{
  hand: string[]
  cards: Readonly<Record<string, CardDef>>
  /** 战斗状态：费用显示（剑意 / 剑流免费）与进化计数 */
  state: BattleState
  energy: number
  /** 正在被拖拽的手牌下标，用于淡化原位置的卡牌 */
  draggingIndex?: number | null
  /** 选牌模式下可选的手牌下标：高亮 */
  pickIndexes?: number[]
  /** 玩家状态：用于把卡面数值换算成最终值 */
  playerStatuses?: Record<string, number>
  /** 拖拽中指向的敌人状态：只作用于被拖拽的那张牌 */
  targetStatuses?: Record<string, number>
  /** 拖拽中指向的敌人下标 */
  targetIndex?: number
}>()
const emit = defineEmits<{ press: [handIndex: number, event: PointerEvent] }>()

// 新进入手牌的牌（抽牌 / 复制 / 发现 / 回收）统一播放入场动画。
// 手牌 key 含下标，打出一张牌会让后面的牌换 key，所以不用 Transition，
// 而是对比前后手牌（按牌 id 的多重集合）找出新增的牌，再对对应牌槽做 WAAPI 动画。
const rootEl = ref<HTMLElement | null>(null)
watch(
  () => [...props.hand],
  async (now, before) => {
    const pool = new Map<string, number>()
    for (const id of before ?? []) pool.set(id, (pool.get(id) ?? 0) + 1)
    const fresh: number[] = []
    // 从后往前匹配：同 id 的重复牌里，新增的总是排在末尾
    for (let i = now.length - 1; i >= 0; i--) {
      const left = pool.get(now[i]!) ?? 0
      if (left > 0) pool.set(now[i]!, left - 1)
      else fresh.unshift(i)
    }
    if (!fresh.length) return
    await nextTick()
    fresh.forEach((index, k) => {
      const el = rootEl.value?.querySelector<HTMLElement>(`[data-hand-slot="${index}"]`)
      el?.animate(
        [
          { opacity: 0, transform: 'translateY(-90px) scale(0.45)' },
          { opacity: 1, transform: 'translateY(8px) scale(1.06)', offset: 0.7 },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 420, delay: k * 80, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
      )
    })
  },
  { immediate: true },
)

const items = computed(() =>
  props.hand.flatMap((id, index) => {
    const card = props.cards[id]
    if (!card) return []
    const cost = displayCost(props.state, card)
    return [
      {
        card,
        index,
        cost,
        progress: props.state.evolveCounts?.[id] ?? progressOf(id),
        // 只有被拖拽的牌知道瞄准的是哪个敌人；其余牌按无目标预览
        damages: previewDamage(props.state, card, props.draggingIndex === index ? props.targetIndex : undefined, props.energy),
        playable: !card.unplayable && (cost === 'X' || cost <= props.energy),
      },
    ]
  }),
)
</script>

<template>
  <!-- 占满两侧面板之间的空间；放不下时各牌槽等比收窄，卡面叠放，悬浮的牌置顶显示全貌 -->
  <div ref="rootEl" data-hand-root class="flex-1 min-w-0 flex justify-center gap-3 min-h-56">
    <div
      v-for="item in items"
      :key="`${item.index}-${item.card.id}`"
      :data-hand-slot="item.index"
      class="relative z-0 basis-36 shrink min-w-0 last:shrink-0 hover:z-10"
    >
      <CardView
        :card="item.card"
        :playable="item.playable"
        :cost="item.cost"
        :progress="item.progress"
        :statuses="playerStatuses"
        :damages="item.damages"
        :target-statuses="draggingIndex === item.index ? targetStatuses : undefined"
        :class="[
          draggingIndex === item.index ? 'opacity-30' : '',
          pickIndexes?.includes(item.index) ? 'pick-ring' : '',
        ]"
        @pointerdown.prevent="(e: PointerEvent) => emit('press', item.index, e)"
      />
    </div>
  </div>
</template>

<style scoped>
.pick-ring {
  filter: drop-shadow(0 0 14px #fbbf24);
  transform: translateY(-12px);
}
</style>
