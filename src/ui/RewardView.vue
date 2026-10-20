<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { cards } from '@/data/cards'
import { potions, relics } from '@/data/items'
import { type Reward, type RunState } from '@/engine/run'
import CardPanel from './CardPanel.vue'
import CardView from './CardView.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ claim: [index: number, pick?: number]; finish: [] }>()

/** 正在挑选卡牌的奖励下标 */
const picking = ref<number | null>(null)

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

// 奖励领完（且没有待处理的药水弹窗）后自动离开；遗物选牌返回时重新挂载也会触发
watch(
  () => props.run.rewards.length === 0 && !props.run.potionOffer?.length,
  (done) => {
    if (done) emit('finish')
  },
  { immediate: true },
)

function onClaim(index: number, r: Reward) {
  if (r.type === 'cards') picking.value = index
  else emit('claim', index)
}

function choose(pick: number) {
  if (picking.value === null) return
  emit('claim', picking.value, pick)
  picking.value = null
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-6 theme-bg text-slate-100"
    :class="pickingReward ? 'absolute inset-0 z-[55]' : 'w-full h-full'"
  >
    <CardPanel v-if="pickingReward" title="选择一张卡牌" closable @close="picking = null">
      <div class="flex justify-center gap-6">
        <CardView
          v-for="(id, i) in pickingReward.choices"
          :key="id"
          :card="cards[id]!"
          :playable="true"
          @click="choose(i)"
        />
      </div>
    </CardPanel>

    <CardPanel v-else class="w-[32rem]" title="战斗胜利">
      <div class="flex flex-col gap-3">
        <button
          v-for="(r, i) in run.rewards"
          :key="i"
          class="reward"
          @click="onClaim(i, r)"
        >
          <span class="icon">{{ describe(r).icon }}</span>
          <span class="flex-1">
            <span class="name">{{ describe(r).title }}</span>
            <span class="desc">{{ describe(r).text }}</span>
          </span>
          <span class="chev">›</span>
        </button>
      </div>
      <template #footer>
        <button class="btn-primary" @click="emit('finish')">继续</button>
      </template>
    </CardPanel>
  </div>
</template>

<style scoped>
/* 奖励条目：深色底 + 金色描边，悬停发光 */
.reward {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.7rem 1rem;
  text-align: left;
  color: #e2e8f0;
  cursor: pointer;
  background: linear-gradient(90deg, rgba(51, 65, 85, 0.75), rgba(30, 41, 59, 0.75));
  border: 1px solid #334155;
  border-radius: 10px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.reward:hover:not(:disabled) {
  border-color: #f59e0b;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.35);
  transform: translateY(-1px);
}
.reward:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  font-size: 1.7rem;
  background: radial-gradient(circle at 50% 35%, #334155, #0f172a 85%);
  border: 2px solid rgba(252, 211, 77, 0.6);
  border-radius: 50%;
}
.name {
  display: block;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fef3c7;
}
.desc {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.8rem;
  color: #94a3b8;
}
.chev {
  font-size: 1.5rem;
  color: #d97706;
}
</style>
