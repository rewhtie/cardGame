<script setup lang="ts">
import { computed, ref } from 'vue'
import { cards } from '@/data/cards'
import { potions, relics } from '@/data/items'
import type { Rarity } from '@/engine/types'
import { upgradeCard } from '@/engine/enchant'
import { useGodMode } from '@/composables/useGodMode'
import { useRun } from '@/composables/useRun'
import UpgradableCard from './UpgradableCard.vue'

defineEmits<{ close: [] }>()

type Tab = Rarity | 'relic' | 'potion'
const TABS: { value: Tab; label: string }[] = [
  { value: 'gold', label: '金卡' },
  { value: 'blue', label: '蓝卡' },
  { value: 'white', label: '白卡' },
  { value: 'relic', label: '遗物' },
  { value: 'potion', label: '药水' },
]

const tab = ref<Tab>('gold')
const cardList = computed(() =>
  tab.value === 'relic' || tab.value === 'potion'
    ? []
    : Object.values(cards).filter((c) => c.rarity === tab.value),
)
const itemList = computed(() => Object.values(tab.value === 'potion' ? potions : relics))
const count = (t: Tab) => {
  if (t === 'relic') return Object.keys(relics).length
  if (t === 'potion') return Object.keys(potions).length
  return Object.values(cards).filter((c) => c.rarity === t).length
}
const isCardTab = computed(() => tab.value !== 'relic' && tab.value !== 'potion')

// 上帝模式（仅开发）：对局中可在图鉴里直接获得卡牌 / 药水 / 遗物
const { run, send } = useRun()
const { godMode } = useGodMode()
const canGrant = computed(() => godMode.value && !!run.value && run.value.screen !== 'battle')
const granted = ref('')
function grant(kind: 'card' | 'potion' | 'relic', id: string) {
  const before = run.value
  send({ type: 'cheatGrant', kind, id })
  const name =
    (kind === 'card' ? cards[id] : kind === 'potion' ? potions[id] : relics[id])?.name ?? id
  const fail =
    run.value?.screen === 'battle'
      ? '战斗中无法加入'
      : kind === 'potion'
        ? '药水栏已满'
        : '无法获得'
  granted.value =
    run.value === before
      ? fail
      : run.value?.screen === 'enchant'
        ? '请关闭设置，选择要附魔的牌'
        : `已加入：${name}`
  setTimeout(() => (granted.value = ''), 2500)
}
</script>

<template>
  <div class="absolute inset-0 z-30 bg-black/85 flex flex-col items-center gap-4 p-8">
    <div class="text-2xl font-bold">图鉴</div>
    <div v-if="isCardTab" class="text-xs text-slate-400">右键点击卡牌，查看升级后的效果</div>
    <div v-if="canGrant" class="text-xs text-amber-300">
      上帝模式：点击「加入」直接获得（卡牌进入牌组，下一场战斗生效）
      <span v-if="granted" class="ml-2 text-emerald-300 font-bold">{{ granted }}</span>
    </div>
    <div class="flex gap-2">
      <button
        v-for="t in TABS"
        :key="t.value"
        class="px-5 py-2 rounded"
        :class="
          tab === t.value
            ? 'bg-amber-500 text-slate-900 font-bold'
            : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
        "
        @click="tab = t.value"
      >
        {{ t.label }}（{{ count(t.value) }}）
      </button>
    </div>

    <div
      v-if="isCardTab"
      class="flex-1 w-full overflow-y-auto flex flex-wrap justify-start content-start gap-3 px-8 pt-8 pb-6"
    >
      <div v-for="card in cardList" :key="card.id" class="flex flex-col items-center gap-1">
        <UpgradableCard :card="card" :upgraded="upgradeCard(card)" />
        <button v-if="canGrant" class="grant" @click="grant('card', card.id)">加入</button>
      </div>
      <div v-if="!cardList.length" class="text-slate-400">暂无</div>
    </div>
    <div
      v-else
      class="flex-1 w-full overflow-y-auto grid grid-cols-2 content-start gap-3 px-8 pt-4 pb-6"
    >
      <div
        v-for="r in itemList"
        :key="r.id"
        class="flex items-center gap-4 p-4 rounded bg-slate-800 border border-slate-600"
      >
        <span class="text-4xl">{{ r.icon }}</span>
        <div class="flex-1">
          <div class="font-bold text-amber-300">{{ r.name }}</div>
          <div class="text-sm text-slate-300">{{ r.text }}</div>
        </div>
        <button
          v-if="canGrant"
          class="grant"
          @click="grant(tab === 'potion' ? 'potion' : 'relic', r.id)"
        >
          加入
        </button>
      </div>
    </div>

    <button class="btn-primary" @click="$emit('close')">关闭</button>
  </div>
</template>

<style scoped>
.grant {
  padding: 0.2rem 0.9rem;
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 700;
  background: #fbbf24;
  border-radius: 6px;
  cursor: pointer;
}
.grant:hover {
  background: #fcd34d;
}
</style>
