<script setup lang="ts">
import { computed, ref } from 'vue'
import { isForgeable, resolveCards, upgradeCard } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import CardPanel from './CardPanel.vue'
import UpgradableCard from './UpgradableCard.vue'

/**
 * 通用选牌界面：从牌组中选 count 张满足 eligible 的牌（可选牌不足时选全部），点确认提交。
 * 遗物获得时的选牌等场景共用，具体规则由调用方传入。
 */
const props = defineProps<{
  title: string
  hint: string
  deck: string[]
  cards: Readonly<Record<string, CardDef>>
  count: number
  eligible: (cardId: string) => boolean
  /** 显示返回按钮（可放弃选牌） */
  cancellable?: boolean
}>()
const emit = defineEmits<{ confirm: [deckIndexes: number[]]; cancel: [] }>()

const items = computed(() => {
  const defs = resolveCards(props.cards, props.deck)
  return props.deck.flatMap((id, index) => {
    const card = defs[id]
    if (!card || !props.eligible(id)) return []
    // 右键 / 长按看升级后的牌面；诅咒、状态牌没有升级版
    const upgraded = isForgeable(props.cards, id) ? upgradeCard(card) : undefined
    return [{ card, upgraded, index }]
  })
})
const need = computed(() => Math.min(props.count, items.value.length))
const selected = ref<number[]>([])

function toggle(index: number) {
  if (selected.value.includes(index)) {
    selected.value = selected.value.filter((i) => i !== index)
  } else {
    // 已选满时顶掉最早选的一张：单选就是点哪张选哪张
    selected.value = [...selected.value, index].slice(-need.value)
  }
}
</script>

<template>
  <div
    class="absolute inset-0 z-[55] flex items-center justify-center p-8 theme-bg text-slate-100"
  >
    <CardPanel :title="title" :hint="`${hint}（已选 ${selected.length}/${need}）`">
      <div class="flex flex-wrap justify-center gap-4">
        <UpgradableCard
          v-for="item in items"
          :key="item.index"
          :card="item.card"
          :upgraded="item.upgraded"
          :selected="selected.includes(item.index)"
          @click="toggle(item.index)"
        />
      </div>
      <template #footer>
        <button v-if="cancellable" class="px-4 py-2 rounded bg-slate-700 text-slate-100 font-bold hover:bg-slate-600" @click="emit('cancel')">
          返回
        </button>
        <button
          class="btn-primary disabled:opacity-40"
          :disabled="selected.length !== need"
          @click="emit('confirm', selected)"
        >
          确认
        </button>
      </template>
    </CardPanel>
  </div>
</template>
