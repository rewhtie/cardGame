<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fxBatch, fxTimes, lag } from '@/composables/useFx'
import { playSfx } from '@/composables/useSfx'
import type { CardDef } from '@/engine/types'
import CardAddFx from './CardAddFx.vue'
import { isForgeable, resolveCards } from '@/engine/enchant'
import { findNode, type NodeType } from '@/engine/map'
import { campfireSpecial, campfireSpecialBlocked, maxPotions, type RunAction, type RunState } from '@/engine/run'
import { cards } from '@/data/cards'
import { relics } from '@/data/items'
import { relicPickSpec } from '@/engine/relics'
import AncientView from './AncientView.vue'
import BattleView from './BattleView.vue'
import CardPickView from './CardPickView.vue'
import EndView from './EndView.vue'
import EventView from './EventView.vue'
import ForgeView from './ForgeView.vue'
import MapView from './MapView.vue'
import HealFx from './HealFx.vue'
import HurtFx from './HurtFx.vue'
import SpearFx from './SpearFx.vue'
import PileButton from './PileButton.vue'
import PileModal from './PileModal.vue'
import PotionOfferModal from './PotionOfferModal.vue'
import PlaceholderView from './PlaceholderView.vue'
import RelicReveal from './RelicReveal.vue'
import RestView from './RestView.vue'
import RewardView from './RewardView.vue'
import ShopView from './ShopView.vue'
import RunHud from './RunHud.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ send: [action: RunAction]; menu: []; retry: [] }>()

const REST_HEAL_RATIO = 0.3
const PLACEHOLDERS: Partial<Record<NodeType, { icon: string; label: string }>> = {
  event: { icon: '❓', label: '事件' },
  treasure: { icon: '🎁', label: '宝箱' },
}

const placeholder = computed(() => {
  const node = props.run.current ? findNode(props.run.map, props.run.current) : undefined
  return (node && PLACEHOLDERS[node.type]) ?? { icon: '❔', label: '未知房间' }
})
const healAmount = computed(() => Math.floor(props.run.player.maxHp * REST_HEAL_RATIO))
const canForge = computed(() =>
  props.run.content.deck.some((id) => isForgeable(props.run.content.cards, id)),
)
/** 战斗中以战斗里的实时生命为准，其余界面用整局生命 */
const hudHp = computed(() =>
  props.run.screen === 'battle' && props.run.battle
    ? Math.max(0, props.run.battle.player.hp + lag.playerHp)
    : props.run.player.hp,
)
/** 战斗中的玩家回合才能使用药水 */
const canUsePotion = computed(
  () => props.run.screen === 'battle' && props.run.battle?.phase === 'player',
)
const livingEnemies = computed(() => props.run.battle?.enemies.filter((e) => e.hp > 0).length ?? 0)
/** 拖拽药水时瞄准的敌人，交给战斗界面高亮 */
const aimEnemy = ref<number | null>(null)
const pickSpec = computed(() =>
  props.run.pendingRelic ? relicPickSpec(props.run.pendingRelic.id) : undefined,
)
const showDeck = ref(false)
/** 非地图界面从状态栏打开的地图预览 */
const showMap = ref(false)
const eventDef = computed(() =>
  props.run.content.events?.find((e) => e.id === props.run.event?.id),
)
const deckCards = computed(() => resolveCards(cards, props.run.content.deck))
const showHud = computed(() => props.run.screen !== 'victory' && props.run.screen !== 'defeat')

// 任何来源的玩家回血（战斗、药水、遗物、火堆）统一播放全屏回血特效
const heal = ref({ key: 0, amount: 0, maxHp: false })
let healTimer: ReturnType<typeof setTimeout> | undefined
watch(fxBatch, (b) => {
  const healed = b.events.reduce(
    (sum, e) => (e.type === 'healed' && e.target === 'player' ? sum + e.amount : sum),
    0,
  )
  // 最大生命增长（火堆扎根）：同一特效，文案带"最大生命"
  const grown = b.events.reduce((sum, e) => (e.type === 'maxHpGained' ? sum + e.amount : sum), 0)
  const amount = healed > 0 ? healed : grown
  if (amount <= 0) return
  heal.value = { key: heal.value.key + 1, amount, maxHp: healed <= 0 }
  clearTimeout(healTimer)
  healTimer = setTimeout(() => (heal.value.amount = 0), 1100)
})

// 战斗外失去生命（事件代价 / 结果）统一播放全屏受伤特效；战斗内扣血由 BattleView 演出
const hurt = ref({ key: 0, amount: 0 })
let hurtTimer: ReturnType<typeof setTimeout> | undefined
watch(fxBatch, (b) => {
  const amount = b.events.reduce((sum, e) => (e.type === 'hpLost' ? sum + e.amount : sum), 0)
  if (amount <= 0) return
  hurt.value = { key: hurt.value.key + 1, amount }
  clearTimeout(hurtTimer)
  hurtTimer = setTimeout(() => (hurt.value.amount = 0), 900)
})

// 能力牌演出：传说中的长枪打出时，长枪从左下角螺旋射出，旋转后消失
const spearFx = ref<{ key: number; delay: number } | null>(null)
let spearKey = 0
watch(fxBatch, (b) => {
  const times = fxTimes(b.events)
  const i = b.events.findIndex((e) => e.type === 'cardPlayed' && e.cardId === 'legendSpear')
  if (i < 0) return
  spearFx.value = { key: ++spearKey, delay: times[i] ?? 0 }
})

// 塞入状态牌 / 诅咒牌（敌人攻击、事件结果等）：卡牌弹出再飞向牌堆，让玩家感知到
const ADD_STAGGER_MS = 90
const ADD_FX_MS = 1400
const addFx = ref<{
  key: number
  items: { card: CardDef; delay: number; to: 'deck' | 'discard'; index: number }[]
}>({
  key: 0,
  items: [],
})
let addTimer: ReturnType<typeof setTimeout> | undefined
watch(fxBatch, (b) => {
  const times = fxTimes(b.events)
  const inBattle = props.run.screen === 'battle'
  const pool = props.run.battle?.cards ?? props.run.content.cards
  const items: { card: CardDef; delay: number; to: 'deck' | 'discard'; index: number }[] = []
  b.events.forEach((e, i) => {
    if (e.type !== 'cardAdded') return
    const card = pool[e.cardId] ?? props.run.content.cards[e.cardId]
    if (!card) return
    for (let k = 0; k < e.count; k++) {
      const index = items.length
      items.push({ card, delay: (times[i] ?? 0) + index * ADD_STAGGER_MS, to: inBattle ? 'discard' : 'deck', index })
    }
  })
  if (!items.length) return
  addFx.value = { key: addFx.value.key + 1, items }
  // 诅咒 / 状态牌弹出的那一刻响一声；战斗内外都走这里，避免重复
  items.forEach((x) => {
    const bad = x.card.rarity === 'curse' || x.card.rarity === 'status'
    setTimeout(() => void playSfx(bad ? 'battle.cardAdded.bad' : 'battle.cardAdded.normal'), x.delay)
  })
  clearTimeout(addTimer)
  addTimer = setTimeout(
    () => (addFx.value.items = []),
    Math.max(...items.map((x) => x.delay)) + ADD_FX_MS + 100,
  )
})
</script>

<template>
  <div class="relative w-full h-full">
    <MapView
      v-if="run.screen === 'map'"
      :run="run"
      @choose="(id, god) => emit('send', { type: 'chooseNode', id, god })"
      @cheat-next="(enemies) => emit('send', { type: 'cheatNextBattle', enemies })"
    />
    <AncientView
      v-else-if="run.screen === 'ancient'"
      :choices="run.ancientChoices"
      @choose="(id) => emit('send', { type: 'chooseAncient', id })"
    />
    <CardPickView
      v-else-if="run.screen === 'pick' && pickSpec && run.pendingRelic"
      :title="`${relics[run.pendingRelic.id]?.icon ?? ''} ${relics[run.pendingRelic.id]?.name ?? ''}`"
      :hint="pickSpec.hint"
      :deck="run.content.deck"
      :cards="cards"
      :count="pickSpec.count"
      :eligible="(id: string) => pickSpec!.eligible(id, run.content.cards)"
      @confirm="(deckIndexes) => emit('send', { type: 'pickCards', deckIndexes })"
    />
    <CardPickView
      v-else-if="run.screen === 'eventPick' && run.event?.pick"
      :title="run.event.pick === 'remove' ? '删除一张牌' : '升级一张牌'"
      :hint="run.event.pick === 'remove' ? '选择一张牌从牌组中永久删除' : '选择一张牌升级'"
      :deck="run.content.deck"
      :cards="cards"
      :count="1"
      :eligible="(id: string) => run.event?.pick === 'remove' || isForgeable(run.content.cards, id)"
      @confirm="(deckIndexes) => emit('send', { type: 'eventPickCard', deckIndex: deckIndexes[0] ?? -1 })"
    />
    <EventView
      v-else-if="run.screen === 'event' && eventDef"
      :run="run"
      :def="eventDef"
      @choose="(index) => emit('send', { type: 'chooseEventOption', index })"
      @leave="emit('send', { type: 'leave' })"
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
      :special="campfireSpecial(run)"
      :special-blocked="campfireSpecialBlocked(run)"
      @rest="emit('send', { type: 'rest' })"
      @forge="emit('send', { type: 'openForge' })"
      @special="emit('send', { type: 'campfireSpecial' })"
      @leave="emit('send', { type: 'leave' })"
    />
    <ForgeView
      v-else-if="run.screen === 'forge'"
      :deck="run.content.deck"
      :cards="cards"
      @pick="(deckIndex) => emit('send', { type: 'forgeCard', deckIndex })"
      @back="emit('send', { type: 'leave' })"
    />
    <ShopView
      v-else-if="run.screen === 'shop' && run.shop"
      :run="run"
      @buy="(kind, index) => emit('send', { type: 'buyShop', kind, index })"
      @remove="(deckIndex) => emit('send', { type: 'shopRemove', deckIndex })"
      @leave="emit('send', { type: 'leave' })"
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
      :gold="run.screen === 'battle' && run.battle ? run.battle.gold : run.gold"
      :potions="run.potions"
      :relics="run.relics"
      :relic-state="run.battle?.relicState ?? run.relicState"
      :can-use="canUsePotion"
      :in-battle="run.screen === 'battle'"
      :living-enemies="livingEnemies"
      :seed="run.seed"
      @use="(index, target) => emit('send', { type: 'usePotion', index, target })"
      @discard="(index) => emit('send', { type: 'discardPotion', index })"
      @aim="(i) => (aimEnemy = i)"
    >
      <!-- 牌组始终可查看；不在地图上时额外提供地图预览 -->
      <PileButton
        kind="draw"
        label="查看牌堆"
        tip="bottom"
        borderless
        small
        :count="run.content.deck.length"
        @click="showDeck = true"
      />
      <PileButton
        v-if="run.screen !== 'map'"
        kind="map"
        label="查看地图"
        tip="bottom"
        borderless
        small
        @click="showMap = true"
      />
    </RunHud>

    <PotionOfferModal
      v-if="run.potionOffer?.length && run.screen !== 'battle'"
      :offer="run.potionOffer"
      :held="run.potions"
      :capacity="maxPotions(run.relics)"
      @take="(index) => emit('send', { type: 'takePotion', index })"
      @skip="(index) => emit('send', { type: 'skipPotion', index })"
    />
    <RelicReveal :cards="cards" />
    <HealFx v-if="heal.amount > 0" :key="heal.key" :amount="heal.amount" :max-hp="heal.maxHp" />
    <HurtFx v-if="hurt.amount > 0" :key="hurt.key" :amount="hurt.amount" />
    <SpearFx v-if="spearFx" :key="spearFx.key" :delay="spearFx.delay" @done="spearFx = null" />
    <template v-if="addFx.items.length">
      <CardAddFx
        v-for="(it, i) in addFx.items"
        :key="`${addFx.key}-${i}`"
        :card="it.card"
        :to="it.to"
        :delay="it.delay"
        :index="it.index"
        :total="addFx.items.length"
      />
    </template>

    <div v-if="showDeck" @pointerdown.stop @wheel.stop>
      <PileModal
        title="我的牌堆"
        :pile="run.content.deck"
        :cards="deckCards"
        @close="showDeck = false"
      />
    </div>

    <!-- 地图预览：只读，可拖动查看，不响应选点 -->
    <div
      v-if="showMap"
      class="absolute inset-0 z-[55] bg-black/85 flex items-center justify-center p-8"
      @pointerdown.stop
      @wheel.stop
    >
      <div
        class="relative w-full h-full max-w-[1280px] max-h-[720px] overflow-hidden rounded-xl border-2 border-amber-700/70 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
      >
        <MapView :run="run" readonly />
        <button
          class="absolute top-2 right-2 z-20 flex items-center justify-center w-8 h-8 p-0 rounded-full cursor-pointer text-amber-100 bg-slate-900/85 border border-amber-500/60 hover:text-slate-900 hover:bg-amber-400 hover:rotate-90 transition"
          title="关闭"
          aria-label="关闭"
          @click="showMap = false"
        >
          <svg viewBox="0 0 16 16" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
