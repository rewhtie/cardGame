<script setup lang="ts">
import { computed, ref } from 'vue'
import { cards } from '@/data/cards'
import { characters } from '@/data/characters'
import { potions, relics } from '@/data/items'
import type { Rarity } from '@/engine/types'
import { upgradeCard } from '@/engine/enchant'
import { useGodMode } from '@/composables/useGodMode'
import { useRun } from '@/composables/useRun'
import CardPanel from './CardPanel.vue'
import UpgradableCard from './UpgradableCard.vue'

defineEmits<{ close: [] }>()

type Tab = Rarity | 'relic' | 'potion'
const TABS: { value: Tab; label: string }[] = [
  { value: 'gold', label: '金卡' },
  { value: 'blue', label: '蓝卡' },
  { value: 'white', label: '白卡' },
  { value: 'status', label: '状态' },
  { value: 'curse', label: '诅咒' },
  { value: 'relic', label: '遗物' },
  { value: 'potion', label: '药水' },
]

const tab = ref<Tab>('gold')
/** 左侧职业栏的筛选：null 为全部；状态牌 / 诅咒牌 / 药水不属于任何职业，不受影响 */
const charId = ref<string | null>(null)
const character = computed(() => characters.find((c) => c.id === charId.value))
const cardsOf = (t: Rarity) =>
  Object.values(cards).filter(
    (c) =>
      c.rarity === t &&
      (!character.value || t === 'status' || t === 'curse' || character.value.allCards.includes(c.id)),
  )
const relicsOfAll = () =>
  Object.values(relics).filter(
    (r) =>
      !character.value || [...character.value.relics, ...(character.value.exclusiveRelics ?? [])].includes(r.id),
  )
const cardList = computed(() =>
  tab.value === 'relic' || tab.value === 'potion' ? [] : cardsOf(tab.value),
)
const itemList = computed(() => (tab.value === 'potion' ? Object.values(potions) : relicsOfAll()))
const count = (t: Tab) => {
  if (t === 'relic') return relicsOfAll().length
  if (t === 'potion') return Object.keys(potions).length
  return cardsOf(t).length
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
      : run.value?.screen === 'pick'
        ? '请关闭设置，选择要处理的牌'
        : `已加入：${name}`
  setTimeout(() => (granted.value = ''), 2500)
}
</script>

<template>
  <div class="absolute inset-0 z-30 bg-black/85 flex items-center justify-center p-8">
    <!-- 左侧职业栏：平时收起只露出图标，悬停时整条伸出并显示名称 -->
    <nav class="rail" aria-label="职业筛选">
      <button class="rail-item" :class="{ active: charId === null }" @click="charId = null">
        <span class="rail-icon">📚</span>
        <span class="rail-name">全部</span>
      </button>
      <button
        v-for="c in characters"
        :key="c.id"
        class="rail-item"
        :class="{ active: charId === c.id }"
        @click="charId = c.id"
      >
        <span class="rail-icon">{{ c.icon }}</span>
        <span class="rail-name">{{ c.name }}</span>
      </button>
    </nav>
    <!-- 固定高度：切换分页时弹框尺寸不跳动 -->
    <CardPanel title="图鉴" class="w-[1100px] h-full" closable @close="$emit('close')">
      <template #toolbar>
        <button
          v-for="t in TABS"
          :key="t.value"
          class="tab"
          :class="{ active: tab === t.value }"
          @click="tab = t.value"
        >
          {{ t.label }}（{{ count(t.value) }}）
        </button>
      </template>

      <div v-if="isCardTab" class="flex flex-wrap justify-center content-start gap-4">
        <div v-for="card in cardList" :key="card.id" class="flex flex-col items-center gap-1">
          <UpgradableCard
            :card="card"
            :upgraded="
              card.rarity === 'curse' || card.rarity === 'status' ? undefined : upgradeCard(card)
            "
          />
          <button v-if="canGrant" class="grant" @click="grant('card', card.id)">加入</button>
        </div>
        <div v-if="!cardList.length" class="py-10 text-slate-400">暂无</div>
      </div>
      <div v-else class="grid grid-cols-2 content-start gap-3">
        <div
          v-for="r in itemList"
          :key="r.id"
          class="flex items-center gap-4 p-4 rounded-lg bg-slate-900/70 border border-amber-500/30"
        >
          <span class="text-4xl">{{ r.icon }}</span>
          <div class="flex-1">
            <div class="font-bold text-amber-300">{{ r.name }}</div>
            <div class="text-sm text-slate-300">{{ r.text }}</div>
            <div v-if="r.lore" class="text-xs italic text-slate-400">{{ r.lore }}</div>
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

      <!-- 底部操作提示栏：右对齐，卡牌分页的 Tip 与上帝模式（开发）提示并排 -->
      <template v-if="isCardTab || canGrant" #footer>
        <div class="flex w-full items-center justify-end gap-6 text-xs">
          <span v-if="isCardTab" class="text-slate-400">
            <b class="text-amber-400/80">Tip：</b
            >右键点击卡牌，查看升级后的效果（状态牌、诅咒牌无升级）
          </span>
          <span v-if="canGrant" class="text-amber-300">
            上帝模式：点击「加入」直接获得（卡牌进入牌组，下一场战斗生效）
            <span v-if="granted" class="ml-2 text-emerald-300 font-bold">{{ granted }}</span>
          </span>
        </div>
      </template>
    </CardPanel>
  </div>
</template>

<style scoped>
.rail {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem 0.5rem 0.6rem 0;
  width: 3.6rem;
  overflow: hidden;
  transform: translateY(-50%);
  background: linear-gradient(90deg, #131a33, #0d1224);
  border: 1px solid rgba(251, 191, 36, 0.45);
  border-left: none;
  border-radius: 0 14px 14px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
  transition:
    width 0.2s ease,
    box-shadow 0.2s;
}
.rail:hover {
  width: 10rem;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.7),
    0 0 22px rgba(251, 191, 36, 0.25);
}
.rail-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.35rem 0.5rem 0.35rem 0.4rem;
  color: #d8c8b0;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0 999px 999px 0;
  transition:
    background 0.15s,
    color 0.15s;
}
.rail-item:hover {
  color: #fde68a;
  background: rgba(251, 191, 36, 0.12);
}
.rail-item.active {
  font-weight: 700;
  color: #1c1917;
  background: linear-gradient(90deg, #fcd34d, #d97706);
}
.rail-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  font-size: 1.5rem;
  background: radial-gradient(circle at 50% 35%, #334155, #0f172a 85%);
  border: 2px solid rgba(252, 211, 77, 0.6);
  border-radius: 50%;
}
.rail-name {
  opacity: 0;
  transition: opacity 0.15s;
}
.rail:hover .rail-name {
  opacity: 1;
}
/* 分页标签：与弹框金边呼应，选中态为金色 */
.tab {
  padding: 0.35rem 1.1rem;
  font-size: 0.9rem;
  color: #d8c8b0;
  cursor: pointer;
  background: rgba(45, 34, 28, 0.8);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 999px;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}
.tab:hover {
  color: #fde68a;
  border-color: rgba(251, 191, 36, 0.6);
}
.tab.active {
  font-weight: 700;
  color: #1c1917;
  background: linear-gradient(180deg, #fcd34d, #d97706);
  border-color: #fef3c7;
}
.grant {
  padding: 0.2rem 0.9rem;
  font-size: 0.85rem;
  color: #18100c;
  font-weight: 700;
  background: #fbbf24;
  border-radius: 6px;
  cursor: pointer;
}
.grant:hover {
  background: #fcd34d;
}
</style>
