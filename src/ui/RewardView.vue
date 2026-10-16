<script setup lang="ts">
import { computed, ref } from 'vue'
import { cards } from '@/data/cards'
import { potions, relics } from '@/data/items'
import { maxPotions, SKIP_PICK, type Reward, type RunState } from '@/engine/run'
import CardView from './CardView.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ claim: [index: number, pick?: number]; finish: [] }>()

/** 正在挑选卡牌的奖励下标 */
const picking = ref<number | null>(null)

const potionFull = computed(() => props.run.potions.length >= maxPotions(props.run.relics))

const pickingReward = computed(() => {
  const r = picking.value === null ? undefined : props.run.rewards[picking.value]
  return r?.type === 'cards' ? r : undefined
})

function describe(r: Reward) {
  switch (r.type) {
    case 'gold':
      return { icon: '💰', title: `${r.amount} 金币`, text: '' }
    case 'potion':
      return {
        icon: potions[r.id]?.icon ?? '🧪',
        title: potions[r.id]?.name ?? r.id,
        text: potions[r.id]?.text ?? '',
      }
    case 'relic':
      return {
        icon: relics[r.id]?.icon ?? '💍',
        title: relics[r.id]?.name ?? r.id,
        text: relics[r.id]?.text ?? '',
      }
    case 'cards':
      return { icon: '🃏', title: '添加一张卡牌到牌组', text: '从 3 张中选 1 张' }
  }
}

function onClaim(index: number, r: Reward) {
  if (r.type === 'cards') {
    picking.value = index
  } else if (!(r.type === 'potion' && potionFull.value)) {
    emit('claim', index)
  }
}

function choose(pick: number) {
  if (picking.value === null) return
  emit('claim', picking.value, pick)
  picking.value = null
}
</script>

<template>
  <div
    class="w-full h-full flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
  >
    <template v-if="pickingReward">
      <div class="text-3xl font-bold">选择一张卡牌</div>
      <div class="flex gap-6">
        <CardView
          v-for="(id, i) in pickingReward.choices"
          :key="id"
          :card="cards[id]!"
          :playable="true"
          @click="choose(i)"
        />
      </div>
      <button class="btn-primary" @click="choose(SKIP_PICK)">跳过</button>
    </template>

    <template v-else>
      <div class="text-4xl font-bold">战斗胜利</div>
      <div class="text-amber-300">💰 {{ run.gold }}</div>
      <div class="w-96 space-y-3">
        <button
          v-for="(r, i) in run.rewards"
          :key="i"
          class="w-full flex items-center gap-4 px-4 py-3 rounded bg-slate-800 hover:bg-slate-700 text-left disabled:(opacity-40 cursor-not-allowed)"
          :disabled="r.type === 'potion' && potionFull"
          @click="onClaim(i, r)"
        >
          <span class="text-3xl">{{ describe(r).icon }}</span>
          <span class="flex-1">
            <span class="block font-bold">{{ describe(r).title }}</span>
            <span class="block text-xs text-slate-400">
              {{ r.type === 'potion' && potionFull ? '药水栏已满' : describe(r).text }}
            </span>
          </span>
        </button>
      </div>
      <button class="btn-primary" @click="emit('finish')">继续</button>
    </template>
  </div>
</template>
