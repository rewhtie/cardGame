<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fxBatch } from '@/composables/useFx'
import { isUpgraded, resolveCards } from '@/engine/enchant'
import { findNode, type NodeType } from '@/engine/map'
import type { RunAction, RunState } from '@/engine/run'
import { cards } from '@/data/cards'
import AncientView from './AncientView.vue'
import BattleView from './BattleView.vue'
import EnchantView from './EnchantView.vue'
import EndView from './EndView.vue'
import ForgeView from './ForgeView.vue'
import MapView from './MapView.vue'
import HealFx from './HealFx.vue'
import PileButton from './PileButton.vue'
import PileModal from './PileModal.vue'
import PlaceholderView from './PlaceholderView.vue'
import RelicReveal from './RelicReveal.vue'
import RestView from './RestView.vue'
import RewardView from './RewardView.vue'
import RunHud from './RunHud.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ send: [action: RunAction]; menu: []; retry: [] }>()

const REST_HEAL_RATIO = 0.3
const PLACEHOLDERS: Partial<Record<NodeType, { icon: string; label: string }>> = {
  shop: { icon: '🛒', label: '商店' },
  event: { icon: '❓', label: '事件' },
  treasure: { icon: '🎁', label: '宝箱' },
}

const placeholder = computed(() => {
  const node = props.run.current ? findNode(props.run.map, props.run.current) : undefined
  return (node && PLACEHOLDERS[node.type]) ?? { icon: '❔', label: '未知房间' }
})
const healAmount = computed(() => Math.floor(props.run.player.maxHp * REST_HEAL_RATIO))
const canForge = computed(() => props.run.content.deck.some((id) => !isUpgraded(id)))
/** 战斗中以战斗里的实时生命为准，其余界面用整局生命 */
const hudHp = computed(() =>
  props.run.screen === 'battle' && props.run.battle
    ? props.run.battle.player.hp
    : props.run.player.hp,
)
/** 战斗中的玩家回合才能使用药水 */
const canUsePotion = computed(
  () => props.run.screen === 'battle' && props.run.battle?.phase === 'player',
)
const livingEnemies = computed(() => props.run.battle?.enemies.filter((e) => e.hp > 0).length ?? 0)
/** 拖拽药水时瞄准的敌人，交给战斗界面高亮 */
const aimEnemy = ref<number | null>(null)
const showDeck = ref(false)
const deckCards = computed(() => resolveCards(cards, props.run.content.deck))
const showHud = computed(() => props.run.screen !== 'victory' && props.run.screen !== 'defeat')

// 任何来源的玩家回血（战斗、药水、遗物、火堆）统一播放全屏回血特效
const heal = ref({ key: 0, amount: 0 })
let healTimer: ReturnType<typeof setTimeout> | undefined
watch(fxBatch, (b) => {
  const amount = b.events.reduce(
    (sum, e) => (e.type === 'healed' && e.target === 'player' ? sum + e.amount : sum),
    0,
  )
  if (amount <= 0) return
  heal.value = { key: heal.value.key + 1, amount }
  clearTimeout(healTimer)
  healTimer = setTimeout(() => (heal.value.amount = 0), 1100)
})
</script>

<template>
  <div class="relative w-full h-full">
    <MapView
      v-if="run.screen === 'map'"
      :run="run"
      @choose="(id, god) => emit('send', { type: 'chooseNode', id, god })"
    />
    <AncientView
      v-else-if="run.screen === 'ancient'"
      :choices="run.ancientChoices"
      @choose="(id) => emit('send', { type: 'chooseAncient', id })"
    />
    <EnchantView
      v-else-if="run.screen === 'enchant'"
      :deck="run.content.deck"
      :cards="cards"
      @pick="(deckIndex) => emit('send', { type: 'enchantCard', deckIndex })"
    />
    <BattleView
      v-else-if="run.screen === 'battle' && run.battle"
      :state="run.battle"
      :aim="aimEnemy"
      :has-relics="run.relics.length > 0"
      @action="(action) => emit('send', { type: 'battle', action })"
      @continue="emit('send', { type: 'continue' })"
    />
    <RewardView
      v-else-if="run.screen === 'reward'"
      :run="run"
      @claim="(index, pick) => emit('send', { type: 'claimReward', index, pick })"
      @finish="emit('send', { type: 'finishRewards' })"
    />
    <RestView
      v-else-if="run.screen === 'rest'"
      :hp="run.player.hp"
      :max-hp="run.player.maxHp"
      :heal-amount="healAmount"
      :can-forge="canForge"
      @rest="emit('send', { type: 'rest' })"
      @forge="emit('send', { type: 'openForge' })"
      @leave="emit('send', { type: 'leave' })"
    />
    <ForgeView
      v-else-if="run.screen === 'forge'"
      :deck="run.content.deck"
      :cards="cards"
      @pick="(deckIndex) => emit('send', { type: 'forgeCard', deckIndex })"
      @back="emit('send', { type: 'leave' })"
    />
    <PlaceholderView
      v-else-if="run.screen === 'placeholder'"
      :icon="placeholder.icon"
      :label="placeholder.label"
      @leave="emit('send', { type: 'leave' })"
    />
    <EndView
      v-else
      :victory="run.screen === 'victory'"
      :seed="run.seed"
      @retry="emit('retry')"
      @menu="emit('menu')"
    />

    <RunHud
      v-if="showHud"
      :hp="hudHp"
      :max-hp="run.player.maxHp"
      :gold="run.gold"
      :potions="run.potions"
      :relics="run.relics"
      :can-use="canUsePotion"
      :living-enemies="livingEnemies"
      @use="(index, target) => emit('send', { type: 'usePotion', index, target })"
      @aim="(i) => (aimEnemy = i)"
    >
      <!-- 地图上可查看牌组，位于状态栏最右（设置按钮左侧） -->
      <PileButton
        v-if="run.screen === 'map'"
        kind="draw"
        label="查看牌堆"
        tip="bottom"
        borderless
        small
        :count="run.content.deck.length"
        @click="showDeck = true"
      />
    </RunHud>

    <RelicReveal :cards="cards" />
    <HealFx v-if="heal.amount > 0" :key="heal.key" :amount="heal.amount" />

    <div v-if="showDeck && run.screen === 'map'" @pointerdown.stop @wheel.stop>
      <PileModal
        title="我的牌堆"
        :pile="run.content.deck"
        :cards="deckCards"
        @close="showDeck = false"
      />
    </div>
  </div>
</template>
