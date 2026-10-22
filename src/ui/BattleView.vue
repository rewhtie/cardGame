<script setup lang="ts">
import { willSplit } from '@/engine/effects'
import EnemyView from './EnemyView.vue'
import HandView from './HandView.vue'
import PileButton from './PileButton.vue'
import PendingPicker from './PendingPicker.vue'
import PileModal from './PileModal.vue'
import StatusIcons from './StatusIcons.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { clearFxHandler, fxReset, lag, setFxCards, setFxHandler, whenFxIdle } from '@/composables/useFx'
import { intentIndexAt } from '@/engine/intents'
import { BUFFS, DEBUFFS, statusById } from '@/engine/statuses'
import type { Action, BattleState, GameEvent, Side } from '@/engine/types'

const props = defineProps<{
  state: BattleState
  readonly?: boolean
  aim?: number | null
  /** 有遗物时顶部状态栏多一行，作弊按钮要相应下移 */
  hasRelics?: boolean
}>()
const emit = defineEmits<{ action: [action: Action]; continue: [] }>()

const openPile = ref<'draw' | 'discard' | 'exhaust' | null>(null)
const pileView = computed(() => {
  switch (openPile.value) {
    case 'draw':
      return { title: '抽牌堆', pile: props.state.drawPile }
    case 'discard':
      return { title: '弃牌堆', pile: props.state.discardPile }
    case 'exhaust':
      return { title: '消耗牌堆', pile: props.state.exhaustPile }
    default:
      return null
  }
})

const isDev = import.meta.env.DEV

/** 作弊加状态：target 为 'player' 或敌人下标 */
const cheatOpen = ref(false)
const cheatStatusId = ref(BUFFS[0]?.id ?? '')
const cheatTarget = ref<'player' | number>('player')
const cheatStacks = ref(1)
const CHEAT_STACK_PRESETS = [-99, -1, 1, 3, 5, 10]
const cheatBtn =
  'px-2.5 py-1 rounded-md border border-red-400/30 bg-red-900/70 hover:bg-red-700 text-xs text-red-50 shadow transition-colors disabled:(opacity-40 cursor-not-allowed hover:bg-red-900/70)'
const cheatField =
  'flex-1 min-w-0 h-7 rounded-md border border-slate-600 px-2 text-xs outline-none focus:border-red-400'
// 原生控件的文字色用内联样式强制指定，避免被浏览器默认的黑字覆盖
const cheatFieldStyle = { color: '#f1e9dc', backgroundColor: '#2d2420', colorScheme: 'dark' }
function applyCheatStatus() {
  const stacks = Math.trunc(Number(cheatStacks.value))
  if (!cheatStatusId.value || !stacks) return
  const t = cheatTarget.value
  emit('action', {
    type: 'cheatStatus',
    side: t === 'player' ? 'player' : 'enemy',
    enemyIndex: t === 'player' ? 0 : t,
    status: cheatStatusId.value,
    stacks,
  })
}

const isOver = computed(() => props.state.phase === 'won' || props.state.phase === 'lost')
/** 只有玩家回合才能操作：敌人演出期间结束回合、作弊按钮都禁用 */
const canAct = computed(() => props.state.phase === 'player' && !props.state.pending)

const COMMAND_OPTIONS = [
  { choice: 'block', label: '格挡 6' },
  { choice: 'attack', label: '攻击 6' },
  { choice: 'devote', label: '奉献 6' },
] as const
const minionsAt = (enemyIndex: number) =>
  (props.state.minions ?? []).filter((m) => m.hp > 0 && m.enemyIndex === enemyIndex)
const commandCards = computed(() =>
  (props.state.minions ?? [])
    .map((m, index) => ({ index, hp: m.hp }))
    .filter((m) => m.hp > 0 && !(props.state.commanded ?? []).includes(m.index)),
)

/** 胜负界面要等演出队列放空：状态里早已分出胜负，但最后一击的动画必须先演完 */
const lostShown = ref(props.state.phase === 'lost')
let phaseToken = 0
watch(
  () => props.state.phase,
  async (phase) => {
    const token = ++phaseToken
    if (phase !== 'won' && phase !== 'lost') {
      lostShown.value = false
      return
    }
    await whenFxIdle()
    if (token !== phaseToken || props.state.phase !== phase) return
    if (phase === 'won' && !props.readonly) emit('continue')
    else if (phase === 'lost') lostShown.value = true
  },
  { immediate: true },
)

const livingCount = computed(() => props.state.enemies.filter((e) => e.hp > 0).length)

function intentOf(enemy: BattleState['enemies'][number]) {
  return enemy.def.intents[enemy.intentIndex] ?? null
}

// ---- 拖拽出牌：把卡牌拖到敌人身上打出；自身牌拖到手牌区以上松手即可 ----
const DRAG_THRESHOLD = 6
/** 手牌区上沿（设计像素）；松手位置高于此线，自身牌才会打出 */
const HAND_TOP = 470

const root = ref<HTMLElement | null>(null)
const drag = ref<{
  index: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
} | null>(null)
const hoverEnemy = ref<number | null>(null)

/** 选牌模式：打出「消耗手牌中状态牌」的牌后，等玩家点一张状态牌；点别处取消 */
const pickMode = ref<{ handIndex: number } | null>(null)
const needsPick = (cardId: string | undefined) =>
  !!cardId && !!props.state.cards[cardId]?.effects.some((e) => e.type === 'exhaustStatusCard')
const pickable = computed(() => {
  const m = pickMode.value
  if (!m) return []
  return props.state.hand.flatMap((id, i) =>
    i !== m.handIndex && props.state.cards[id]?.rarity === 'status' ? [i] : [],
  )
})
/** 出牌；需要选状态牌的牌先进入选牌模式，手里没有状态牌就打不出 */
function playOrPick(handIndex: number, target?: number) {
  if (needsPick(props.state.hand[handIndex])) {
    const has = props.state.hand.some((id, i) => i !== handIndex && props.state.cards[id]?.rarity === 'status')
    if (has) pickMode.value = { handIndex }
    return
  }
  emit('action', { type: 'playCard', handIndex, ...(target !== undefined && { target }) })
}
watch(
  () => props.state.hand,
  () => (pickMode.value = null),
)

const dragCard = computed(() =>
  drag.value ? props.state.cards[props.state.hand[drag.value.index] ?? ''] : undefined,
)
const dragAimsEnemy = computed(() => drag.value?.active && dragCard.value?.target === 'enemy')

/** 舞台被 CSS 整体缩放，屏幕坐标需换算回设计像素 */
function toStage(clientX: number, clientY: number) {
  const el = root.value
  if (!el) return { x: clientX, y: clientY }
  const rect = el.getBoundingClientRect()
  const k = el.offsetWidth ? rect.width / el.offsetWidth : 1
  return { x: (clientX - rect.left) / k, y: (clientY - rect.top) / k }
}

function enemyUnder(clientX: number, clientY: number): number | null {
  const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-enemy-index]')
  if (!hit) return null
  const i = Number(hit.getAttribute('data-enemy-index'))
  const enemy = props.state.enemies[i]
  return enemy && enemy.hp > 0 ? i : null
}

function onPress(index: number, e: PointerEvent) {
  if (props.readonly || isOver.value || props.state.phase !== 'player' || props.state.pending) return
  if (pickMode.value) {
    const m = pickMode.value
    pickMode.value = null
    if (pickable.value.includes(index)) emit('action', { type: 'playCard', handIndex: m.handIndex, pick: index })
    return
  }
  const p = toStage(e.clientX, e.clientY)
  drag.value = { index, startX: p.x, startY: p.y, x: p.x, y: p.y, active: false }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onRelease)
  window.addEventListener('pointercancel', stopDrag)
}

function onMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = toStage(e.clientX, e.clientY)
  d.x = p.x
  d.y = p.y
  if (!d.active && Math.hypot(p.x - d.startX, p.y - d.startY) > DRAG_THRESHOLD) d.active = true
  hoverEnemy.value = d.active ? enemyUnder(e.clientX, e.clientY) : null
  drag.value = { ...d }
}

function onRelease(e: PointerEvent) {
  const d = drag.value
  stopDrag()
  if (!d) return
  const card = props.state.cards[props.state.hand[d.index] ?? '']
  if (!card) return

  if (!d.active) {
    // 单击：不需要选目标时直接打出（自身牌，或只剩一只敌人）
    if (card.target !== 'enemy' || livingCount.value <= 1) playOrPick(d.index)
    return
  }

  if (card.target === 'enemy') {
    const target = enemyUnder(e.clientX, e.clientY)
    if (target !== null) playOrPick(d.index, target)
  } else if (toStage(e.clientX, e.clientY).y < HAND_TOP) {
    playOrPick(d.index)
  }
}

function stopDrag() {
  drag.value = null
  hoverEnemy.value = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onRelease)
  window.removeEventListener('pointercancel', stopDrag)
}

onBeforeUnmount(stopDrag)

// ---- 战斗动画：引擎事件 -> 纯视觉效果（状态已立即更新，这里只叠加表现） ----
interface Floater {
  id: number
  kind: 'text' | 'slash' | 'healRing' | 'shield'
  x: number
  y: number
  text?: string
  cls?: string
}
const floaters = ref<Floater[]>([])
const playerEl = ref<HTMLElement | null>(null)
const blockEl = ref<HTMLElement | null>(null)
const energyEl = ref<HTMLElement | null>(null)
const vignette = ref<HTMLElement | null>(null)
let floaterId = 0
const timers = new Set<number>()

function later(ms: number, fn: () => void) {
  if (ms <= 0) return fn()
  const t = window.setTimeout(() => {
    timers.delete(t)
    fn()
  }, ms)
  timers.add(t)
}

function spriteOf(side: Side, enemyIndex = 0): HTMLElement | null {
  if (side === 'player') return playerEl.value
  return root.value?.querySelector(`[data-enemy-index="${enemyIndex}"] [data-fx="sprite"]`) ?? null
}

function addFloater(item: Floater, ttl: number) {
  floaters.value.push(item)
  later(ttl, () => (floaters.value = floaters.value.filter((f) => f !== item)))
}

function float(el: HTMLElement | null, text: string, cls: string) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const p = toStage(r.left + r.width / 2, r.top + r.height / 3)
  const x = p.x + (Math.random() - 0.5) * 36
  addFloater({ id: ++floaterId, kind: 'text', x, y: p.y, text, cls }, 1100)
}

/** 获得防御：蓝色护盾在目标身上凝聚，伴随扩散的冲击环 */
function shieldUp(el: HTMLElement | null, cls?: string) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const p = toStage(r.left + r.width / 2, r.top + r.height / 2)
  addFloater({ id: ++floaterId, kind: 'shield', x: p.x, y: p.y, cls }, 900)
}

/** 治疗粒子：以目标为中心向上飘散的绿色光柱 */
function healRing(el: HTMLElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const p = toStage(r.left + r.width / 2, r.top + r.height / 2)
  addFloater({ id: ++floaterId, kind: 'healRing', x: p.x, y: p.y }, 1000)
}

function slash(el: HTMLElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const p = toStage(r.left + r.width / 2, r.top + r.height / 2)
  addFloater({ id: ++floaterId, kind: 'slash', x: p.x, y: p.y }, 360)
}

const SHAKE = [0, -14, 12, -8, 5, 0]
const HIT_FLASH = 'brightness(1.9) sepia(1) saturate(6) hue-rotate(-50deg)'

const GLOW = {
  block: 'rgba(56,189,248,.7)',
  heal: 'rgba(74,222,128,.7)',
  poison: 'rgba(74,222,128,.8)',
  energy: 'rgba(250,204,21,.9)',
  buff: 'rgba(250,204,21,.7)',
  debuff: 'rgba(192,132,252,.7)',
  enemyAct: 'rgba(167,139,250,.7)',
  cardHurt: 'rgba(239,68,68,.7)',
  cardAdd: 'rgba(148,163,184,.7)',
} as const

/** 播放动画并在演完时兑现；被取消 / 元素已移除也算演完，不能卡住演出队列 */
function animate(el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const a = el?.animate(keyframes, options)
  return a ? a.finished.then(() => a, () => a) : Promise.resolve(undefined)
}

const hitReact = (el: HTMLElement | null) =>
  animate(
    el,
    SHAKE.map((x, i) => ({
      transform: `translateX(${x}px)`,
      filter: i === 1 || i === 2 ? HIT_FLASH : 'none',
    })),
    { duration: 340, easing: 'ease-out' },
  )

const glow = (el: HTMLElement | null, color: string) =>
  animate(
    el,
    [
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${color}` },
      { transform: 'scale(1.12)', boxShadow: `0 0 36px 10px ${color}`, offset: 0.4 },
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${color}` },
    ],
    { duration: 420, easing: 'ease-out' },
  )

/** 冲撞分两段：下压段演完才算"打到了"（队列在此处放行受击），回弹段不阻塞队列 */
async function lunge(el: HTMLElement | null) {
  const pressed = 'translateY(70px) scale(1.22)'
  const down = await animate(
    el,
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-14px) scale(0.94)', offset: 0.35 },
      { transform: pressed },
    ],
    { duration: 230, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
  )
  // 回弹结束后撤掉下压段的 forwards，否则敌人会一直停在压下去的位置
  void animate(el, [{ transform: pressed }, { transform: 'translateY(0) scale(1)' }], {
    duration: 190,
    easing: 'ease-out',
  }).then(() => down?.cancel())
}

function screenHit(big: boolean) {
  const amp = big ? 12 : 6
  root.value?.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-amp}px,${amp / 2}px)` },
      { transform: `translate(${amp}px,${-amp / 2}px)` },
      { transform: `translate(${-amp / 2}px,0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 300 },
  )
  vignette.value?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], {
    duration: 520,
  })
}

type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
type PlayCtx = { prev?: GameEvent }

const statusTone = (kind?: string) => (kind === 'buff' ? 'buff' : 'debuff')
const cardLabel = (id: string) => {
  const card = props.state.cards[id]
  return `${card?.icon ?? '🃏'} ${card?.name ?? ''}`
}

/** 扣血的成因：由紧邻其前的触发事件决定，用来区分斩击特效与毒的绿光 */
function damageCause(e: Ev<'damageDealt'>, prev?: GameEvent): 'attack' | 'poison' | 'trigger' {
  if (prev?.type === 'cardTriggered') return e.target === 'player' ? 'trigger' : 'attack'
  if (prev?.type !== 'statusTriggered') return 'attack'
  if (prev.target !== e.target || (prev.enemyIndex ?? 0) !== (e.enemyIndex ?? 0)) return 'attack'
  return prev.status === 'poison' ? 'poison' : 'trigger'
}

async function playDamage(e: Ev<'damageDealt'>, { prev }: PlayCtx) {
  const cause = damageCause(e, prev)
  const el = spriteOf(e.target, e.enemyIndex)
  if (cause === 'poison') {
    if (e.amount > 0) float(el, `☠ -${e.amount}`, 'fx-poison')
    return void (await glow(el, GLOW.poison))
  }
  if (e.blocked > 0) float(el, `🛡 -${e.blocked}`, 'fx-blocked')
  if (e.amount <= 0) {
    if (e.blocked > 0) {
      await glow(el, GLOW.block)
    }
    return
  }
  if (cause === 'attack') slash(el)
  float(el, `-${e.amount}`, e.target === 'player' ? 'fx-hurt' : 'fx-damage')
  if (e.target === 'player') screenHit(e.amount >= 10)
  await hitReact(el)
}

/** 每种事件的演出；没登记的事件不占队列时间。动画演完才兑现，队列据此保证"动作 -> 动画 -> 数值"逐个结算 */
const players: { [T in GameEvent['type']]?: (e: Ev<T>, ctx: PlayCtx) => Promise<unknown> | void } = {
  enemyActed: (e) => {
    const el = spriteOf('enemy', e.enemyIndex)
    return e.intent.type === 'attack' ? lunge(el) : glow(el, GLOW.enemyAct)
  },
  damageDealt: playDamage,
  blockGained: (e) => {
    // 玩家的防御只在徽章上演，不动整块左栏
    const isPlayer = e.target === 'player'
    const el = isPlayer ? blockEl.value : spriteOf(e.target, e.enemyIndex)
    shieldUp(el, isPlayer ? 'fx-shield-sm' : undefined)
    float(el, `+${e.amount} 🛡`, 'fx-block')
    return glow(el, GLOW.block)
  },
  energyGained: (e) => {
    float(energyEl.value, `+${e.amount} ⚡`, 'fx-energy')
    return glow(energyEl.value, GLOW.energy)
  },
  healed: (e) => {
    const el = spriteOf(e.target, e.enemyIndex)
    healRing(el)
    float(el, `+${e.amount} ❤`, 'fx-heal')
    return glow(el, GLOW.heal)
  },
  statusTriggered: (e) => {
    const def = statusById[e.status]
    const el = spriteOf(e.target, e.enemyIndex)
    const tone = statusTone(def?.kind)
    if (def) float(el, `${def.icon} ${def.name}`, `fx-${tone}`)
    return glow(el, GLOW[tone])
  },
  cardTriggered: (e) => {
    const el = spriteOf('player')
    float(el, cardLabel(e.cardId), 'fx-debuff')
    return glow(el, GLOW.cardHurt)
  },
  cardAdded: (e) => {
    const el = spriteOf('player')
    float(el, `${cardLabel(e.cardId)} ×${e.count}`, 'fx-debuff')
    return glow(el, GLOW.cardAdd)
  },
  // 只飘字，不占队列时间
  statusApplied: (e) => {
    const def = statusById[e.status]
    if (def) float(spriteOf(e.target, e.enemyIndex), `${def.icon} ${def.name} ${e.stacks > 0 ? '+' : ''}${e.stacks}`, `fx-${statusTone(def.kind)}`)
  },
}

async function playEvent(e: GameEvent, prev?: GameEvent): Promise<void> {
  const play = players[e.type] as ((e: GameEvent, ctx: PlayCtx) => Promise<unknown> | void) | undefined
  await play?.(e, { prev })
}

setFxHandler(playEvent)
setFxCards(props.state.cards)

/** 界面显示值 = 真实状态 + 演出滞后量：事件的动画没演完，对应数值先不落地 */
const enemies = computed(() =>
  props.state.enemies.map((e, i) => {
    const turns = Math.max(0, (e.turns ?? 0) - (lag.intent[i] ?? 0))
    return {
      ...e,
      hp: e.hp + (lag.enemyHp[i] ?? 0),
      block: e.block + (lag.enemyBlock[i] ?? 0),
      turns,
      intentIndex: intentIndexAt(e.def, turns),
    }
  }),
)
const shownBlock = computed(() => props.state.player.block + lag.playerBlock)

// 读档 / 重开：旧战斗没播完的飘字和遮罩立刻作废（队列本身由 resetFx 清空）
watch(fxReset, () => {
  phaseToken++
  lostShown.value = false
  timers.forEach((id) => clearTimeout(id))
  timers.clear()
  floaters.value = []
})
onBeforeUnmount(() => {
  clearFxHandler(playEvent)
  setFxCards(null)
  phaseToken++
  timers.forEach((id) => clearTimeout(id))
})
</script>

<template>
  <div
    ref="root"
    class="relative w-full h-full overflow-hidden flex flex-col justify-between px-6 pb-6 pt-36 theme-bg text-slate-100"
  >
    <div
      v-if="isDev && !readonly"
      class="absolute right-3 z-50 flex flex-col items-end gap-1.5"
      :class="hasRelics ? 'top-28' : 'top-16'"
    >
      <button :class="cheatBtn" :disabled="!canAct" @click="emit('action', { type: 'cheatDamage', amount: 9999 })">
        作弊：直接胜利
      </button>
      <button :class="cheatBtn" :disabled="!canAct" @click="emit('action', { type: 'cheatDraw', count: 3 })">
        作弊：抽三张牌
      </button>
      <button :class="cheatBtn" :disabled="!canAct" @click="emit('action', { type: 'cheatEnergy', amount: 3 })">
        作弊：回复3点能量
      </button>
      <button :class="cheatBtn" :aria-expanded="cheatOpen" @click="cheatOpen = !cheatOpen">
        作弊：添加状态 {{ cheatOpen ? '▲' : '▼' }}
      </button>
      <div
        v-if="cheatOpen"
        class="flex flex-col gap-2 p-3 w-64 rounded-lg border border-red-400/30 bg-slate-900/95 shadow-xl backdrop-blur text-xs text-slate-100"
      >
        <label class="flex items-center gap-2">
          <span class="w-8 shrink-0 text-slate-400">状态</span>
          <select v-model="cheatStatusId" :class="cheatField" :style="cheatFieldStyle">
            <optgroup label="增益">
              <option v-for="d in BUFFS" :key="d.id" :value="d.id">{{ d.icon }} {{ d.name }}</option>
            </optgroup>
            <optgroup label="减益">
              <option v-for="d in DEBUFFS" :key="d.id" :value="d.id">{{ d.icon }} {{ d.name }}</option>
            </optgroup>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="w-8 shrink-0 text-slate-400">目标</span>
          <select v-model="cheatTarget" :class="cheatField" :style="cheatFieldStyle">
            <option value="player">玩家</option>
            <option v-for="(e, i) in state.enemies" :key="i" :value="i">
              敌人 {{ i + 1 }}：{{ e.def.name }}{{ e.hp <= 0 ? '（已死亡）' : '' }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="w-8 shrink-0 text-slate-400">层数</span>
          <input v-model.number="cheatStacks" type="number" step="1" :class="cheatField" :style="cheatFieldStyle" />
        </label>
        <p class="pl-10 -mt-1 text-slate-400">正数加层，负数扣层，扣光即移除</p>
        <div class="flex gap-1 pl-10">
          <button
            v-for="n in CHEAT_STACK_PRESETS"
            :key="n"
            class="flex-1 h-6 rounded border text-xs transition-colors"
            :class="
              cheatStacks === n
                ? 'border-red-400 bg-red-800 text-white'
                : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-red-400/60'
            "
            @click="cheatStacks = n"
          >
            {{ n }}
          </button>
        </div>
        <button :class="[cheatBtn, 'h-8 justify-center text-sm']" :disabled="!canAct" @click="applyCheatStatus">
          {{ cheatStacks < 0 ? '扣除' : '施加' }}
        </button>
      </div>
    </div>

    <div class="flex justify-center gap-10">
      <!-- 召唤 / 分裂出的敌人（及分裂掉的本体）死后不留尸体；按演出后的血量判断，死亡动画播完才消失 -->
      <div
        v-for="(enemy, i) in enemies"
        v-show="!(enemy.vanishOnDeath && enemy.hp <= 0)"
        :key="i"
        :data-enemy-index="i"
      >
        <EnemyView
          :enemy="enemy"
          :intent="intentOf(enemy)"
          :splitting="state.phase === 'player' && willSplit(enemy, livingCount)"
          :cards="state.cards"
          :player-statuses="state.player.statuses"
          :player-block="state.player.block"
          :hovered="hoverEnemy === i || aim === i"
        />
        <!-- 随从占据被转化的尸体位置 -->
        <div
          v-for="(m, mi) in minionsAt(i)"
          :key="'m' + mi"
          class="mt-1 text-center text-sm text-emerald-300"
        >
          🌿 随从 {{ m.hp }}/20
        </div>
      </div>
    </div>

    <div v-if="pickMode" class="absolute left-1/2 top-[44%] z-20 -translate-x-1/2 px-5 py-2 rounded-lg bg-black/75 text-amber-200 pointer-events-none">选择手牌中的一张状态牌消耗（点别处取消）</div>

    <!-- 指挥牌：每只存活随从每回合一张，不入任何牌堆 -->
    <div v-if="commandCards.length" class="flex justify-center gap-4 shrink-0">
      <div
        v-for="c in commandCards"
        :key="c.index"
        class="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-950/60 px-3 py-1 text-sm"
      >
        <span>指挥 🌿{{ c.hp }}</span>
        <button
          v-for="o in COMMAND_OPTIONS"
          :key="o.choice"
          class="btn-primary"
          :disabled="!canAct || readonly"
          @click="emit('action', { type: 'command', minion: c.index, choice: o.choice })"
        >
          {{ o.label }}
        </button>
      </div>
    </div>

    <!-- 底部行固定高度：左栏、打牌区都不会被内容撑开 -->
    <div class="flex items-end justify-between h-56 shrink-0">
      <div ref="playerEl" class="relative w-48 h-56 shrink-0 space-y-1 rounded-xl">
        <div class="text-sm text-slate-400">回合 {{ state.turn }}</div>
        <div
          ref="blockEl"
          :key="shownBlock"
          class="block-badge"
          :class="(shownBlock) > 0 ? 'block-badge-on' : 'block-badge-off'"
        >
          <span class="block-icon">🛡</span>
          <span class="block-num">{{ shownBlock }}</span>
        </div>
        <div
          ref="energyEl"
          class="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-2xl font-bold"
        >
          {{ state.player.energy }}/{{ state.player.maxEnergy }}
        </div>
        <!-- 相对左栏绝对定位：贴近手牌底边（手牌下移了 22px，这里留 6px 给层数角标），向上延伸，不占布局高度；高度和列数由 StatusIcons 控制 -->
        <div class="absolute left-[4.75rem] bottom-[18px]">
          <StatusIcons :statuses="state.player.statuses" vertical />
        </div>
        <PileButton
          kind="draw"
          label="抽牌堆"
          :count="state.drawPile.length"
          @click="openPile = 'draw'"
        />
      </div>

      <HandView
        class="translate-y-[22px]"
        :hand="state.hand"
        :cards="state.cards"
        :state="state"
        :energy="state.player.energy"
        :dragging-index="drag?.active ? drag.index : null"
        :pick-indexes="pickable"
        :player-statuses="state.player.statuses"
        :target-statuses="hoverEnemy !== null ? state.enemies[hoverEnemy]?.statuses : undefined"
        :target-index="hoverEnemy ?? undefined"
        @press="onPress"
      />

      <div class="w-48 flex flex-col items-end gap-2">
        <div class="flex items-center gap-4">
          <PileButton
            kind="discard"
            label="弃牌堆"
            :count="state.discardPile.length"
            @click="openPile = 'discard'"
          />
          <PileButton
            kind="exhaust"
            label="消耗牌堆"
            :count="state.exhaustPile.length"
            @click="openPile = 'exhaust'"
          />
        </div>
        <button
          class="btn-primary"
          :disabled="!canAct || readonly"
          @click="emit('action', { type: 'endTurn' })"
        >
          结束回合
        </button>
      </div>
    </div>

    <!-- 拖拽指示：敌人牌画箭头，自身牌在越过手牌区上沿后提示可松手 -->
    <svg v-if="drag?.active" class="absolute inset-0 w-full h-full pointer-events-none z-20">
      <template v-if="dragAimsEnemy">
        <line
          :x1="drag.startX"
          :y1="drag.startY"
          :x2="drag.x"
          :y2="drag.y"
          :stroke="hoverEnemy !== null ? '#fbbf24' : '#b09c86'"
          stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray="4 12"
        />
        <circle
          :cx="drag.x"
          :cy="drag.y"
          r="14"
          fill="none"
          :stroke="hoverEnemy !== null ? '#fbbf24' : '#b09c86'"
          stroke-width="4"
        />
      </template>
      <text
        v-else
        :x="drag.x"
        :y="drag.y - 20"
        text-anchor="middle"
        :fill="drag.y < HAND_TOP ? '#fbbf24' : '#b09c86'"
        font-size="20"
        font-weight="bold"
      >
        {{ drag.y < HAND_TOP ? '松手打出' : '拖到上方打出' }}
      </text>
    </svg>

    <!-- 受击红色暗角 -->
    <div
      ref="vignette"
      class="absolute inset-0 pointer-events-none z-30 opacity-0"
      style="box-shadow: inset 0 0 140px 40px rgba(239, 68, 68, 0.75)"
    />
    <!-- 飘字与斩击特效 -->
    <template v-for="f in floaters" :key="f.id">
      <div
        v-if="f.kind === 'text'"
        class="fx-float absolute pointer-events-none z-30 font-black text-3xl whitespace-nowrap"
        :class="f.cls"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      >
        {{ f.text }}
      </div>
      <div
        v-else-if="f.kind === 'slash'"
        class="fx-slash absolute pointer-events-none z-30"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      />
      <div
        v-else-if="f.kind === 'shield'"
        class="fx-shield absolute pointer-events-none z-30"
        :class="f.cls"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      >
        <b>🛡</b>
      </div>
      <div
        v-else
        class="fx-heal-particles absolute pointer-events-none z-30"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      >
        <span v-for="i in 9" :key="i" />
      </div>
    </template>

    <PendingPicker
      v-if="!readonly"
      :state="state"
      @resolve="(picks) => emit('action', { type: 'resolve', picks })"
    />

    <PileModal
      v-if="pileView"
      :title="pileView.title"
      :pile="pileView.pile"
      :cards="state.cards"
      :evolve-counts="state.evolveCounts"
      :sorted="openPile === 'draw'"
      @close="openPile = null"
    />

    <div
      v-if="lostShown && !readonly"
      class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-6"
    >
      <div class="text-5xl font-bold">战败…</div>
      <button class="btn-primary" @click="emit('continue')">继续</button>
    </div>
  </div>
</template>

<style scoped>
.fx-float {
  transform: translate(-50%, -50%);
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.8),
    0 0 8px rgba(0, 0, 0, 0.6);
  animation: fx-float-up 1s ease-out forwards;
}
.fx-damage,
.fx-hurt {
  color: #fca5a5;
  font-size: 2.4rem;
}
.fx-hurt {
  color: #f87171;
}
.fx-blocked,
.fx-block {
  color: #7dd3fc;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.8),
    0 0 14px rgba(56, 189, 248, 0.9);
}
.fx-block {
  font-size: 2.4rem;
}
.fx-blocked {
  font-size: 1.8rem;
}

/* 玩家防御徽章：有防御时醒目的蓝色盾牌，数值变化时弹一下 */
.block-badge {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
}
.block-icon,
.block-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.block-icon {
  font-size: 3.4rem;
}
.block-num {
  top: 9px; /* 盾牌 emoji 视觉中心偏下，数字需下移才对准 */
  font-size: 1.1rem;
  font-weight: 900;
  color: #fff;
  text-shadow:
    0 0 4px #0c4a6e,
    0 0 4px #0c4a6e,
    0 2px 2px rgba(0, 0, 0, 0.8);
}
.block-badge-on {
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
  animation: block-pop 0.4s ease-out;
}
.block-badge-off {
  opacity: 0.35;
  filter: grayscale(1);
}
@keyframes block-pop {
  0% {
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.3);
  }
  100% {
    transform: scale(1);
  }
}

/* 护盾凝聚：盾牌由大缩小定格后淡出，同时两圈冲击环向外扩散 */
.fx-shield {
  width: 0;
  height: 0;
}
.fx-shield-sm {
  transform: scale(0.5);
}
.fx-energy {
  color: #fde047;
  font-size: 2rem;
  text-shadow:
    0 2px 0 rgba(0, 0, 0, 0.8),
    0 0 14px rgba(250, 204, 21, 0.9);
}
.fx-shield i {
  position: absolute;
  left: -60px;
  top: -60px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid #7dd3fc;
  box-shadow:
    0 0 24px 6px rgba(56, 189, 248, 0.7),
    inset 0 0 24px 4px rgba(56, 189, 248, 0.5);
  background: radial-gradient(circle, rgba(125, 211, 252, 0.35), transparent 70%);
  animation: fx-shield-ring 0.7s ease-out forwards;
}
.fx-shield b {
  position: absolute;
  left: -50px;
  top: -62px;
  width: 100px;
  text-align: center;
  font-size: 5rem;
  line-height: 1;
  filter: drop-shadow(0 0 16px rgba(56, 189, 248, 1));
  animation: fx-shield-icon 0.85s ease-out forwards;
}
@keyframes fx-shield-ring {
  0% {
    opacity: 0;
    transform: scale(1.8);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(0.7);
  }
}
@keyframes fx-shield-icon {
  0% {
    opacity: 0;
    transform: scale(2.2);
  }
  35% {
    opacity: 1;
    transform: scale(1);
  }
  75% {
    opacity: 1;
    transform: scale(1.08);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
.fx-heal {
  color: #86efac;
}
.fx-poison {
  color: #4ade80;
}
.fx-buff,
.fx-debuff {
  font-size: 1.25rem;
}
.fx-buff {
  color: #6ee7b7;
}
.fx-debuff {
  color: #fda4af;
}
@keyframes fx-float-up {
  0% {
    opacity: 0;
    transform: translate(-50%, -30%) scale(0.5);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, -60%) scale(1.3);
  }
  30% {
    transform: translate(-50%, -70%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -190%) scale(1);
  }
}
/* 治疗粒子：多道竖直绿色光柱从下往上飘散、渐隐 */
.fx-heal-particles {
  width: 150px;
  height: 190px;
  margin: -130px 0 0 -75px;
}
.fx-heal-particles span {
  position: absolute;
  bottom: 0;
  width: 4px;
  height: 26px;
  opacity: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, #6ee7b7 40%, #ecfdf5);
  box-shadow: 0 0 12px 3px rgba(52, 211, 153, 0.8);
  animation: fx-heal-rise 1s ease-out forwards;
}
/* 左右散开、长短错落、先后升起 */
.fx-heal-particles span:nth-child(1) {
  left: 8%;
  height: 22px;
  animation-delay: 0.05s;
}
.fx-heal-particles span:nth-child(2) {
  left: 20%;
  height: 32px;
  animation-delay: 0.28s;
}
.fx-heal-particles span:nth-child(3) {
  left: 31%;
  height: 24px;
  animation-delay: 0.12s;
}
.fx-heal-particles span:nth-child(4) {
  left: 42%;
  height: 36px;
  animation-delay: 0.4s;
}
.fx-heal-particles span:nth-child(5) {
  left: 52%;
  height: 28px;
  animation-delay: 0.02s;
}
.fx-heal-particles span:nth-child(6) {
  left: 62%;
  height: 34px;
  animation-delay: 0.22s;
}
.fx-heal-particles span:nth-child(7) {
  left: 73%;
  height: 20px;
  animation-delay: 0.34s;
}
.fx-heal-particles span:nth-child(8) {
  left: 84%;
  height: 30px;
  animation-delay: 0.08s;
}
.fx-heal-particles span:nth-child(9) {
  left: 94%;
  height: 24px;
  animation-delay: 0.46s;
}
@keyframes fx-heal-rise {
  0% {
    opacity: 0;
    transform: translateY(0) scaleY(0.5);
  }
  20% {
    opacity: 1;
    transform: translateY(-24px) scaleY(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-150px) scaleY(1.15);
  }
}

/* 斩击：一道斜向光刃快速划过 */
.fx-slash {
  width: 190px;
  height: 7px;
  margin: -3px 0 0 -95px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #fff 45%, #fde68a 55%, transparent);
  box-shadow: 0 0 14px 3px rgba(253, 230, 138, 0.9);
  transform: rotate(-35deg);
  animation: fx-slash 0.3s ease-out forwards;
}
@keyframes fx-slash {
  0% {
    opacity: 1;
    transform: rotate(-35deg) scaleX(0);
  }
  50% {
    opacity: 1;
    transform: rotate(-35deg) scaleX(1);
  }
  100% {
    opacity: 0;
    transform: rotate(-35deg) scaleX(1.1);
  }
}
</style>
