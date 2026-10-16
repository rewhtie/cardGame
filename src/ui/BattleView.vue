<script setup lang="ts">
import EnemyView from './EnemyView.vue'
import HandView from './HandView.vue'
import PileButton from './PileButton.vue'
import PileModal from './PileModal.vue'
import StatusIcons from './StatusIcons.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fxBatch } from '@/composables/useFx'
import { statusById } from '@/engine/statuses'
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

const isOver = computed(() => props.state.phase === 'won' || props.state.phase === 'lost')
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
  if (props.readonly || isOver.value || props.state.phase !== 'player') return
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
    if (card.target === 'self' || livingCount.value <= 1) {
      emit('action', { type: 'playCard', handIndex: d.index })
    }
    return
  }

  if (card.target === 'enemy') {
    const target = enemyUnder(e.clientX, e.clientY)
    if (target !== null) emit('action', { type: 'playCard', handIndex: d.index, target })
  } else if (toStage(e.clientX, e.clientY).y < HAND_TOP) {
    emit('action', { type: 'playCard', handIndex: d.index })
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
  kind: 'text' | 'slash' | 'healRing'
  x: number
  y: number
  text?: string
  cls?: string
}
const floaters = ref<Floater[]>([])
const playerEl = ref<HTMLElement | null>(null)
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

function hitReact(el: HTMLElement | null) {
  el?.animate(
    SHAKE.map((x, i) => ({
      transform: `translateX(${x}px)`,
      filter: i === 1 || i === 2 ? HIT_FLASH : 'none',
    })),
    { duration: 340, easing: 'ease-out' },
  )
}

function glow(el: HTMLElement | null, color: string) {
  el?.animate(
    [
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${color}` },
      { transform: 'scale(1.12)', boxShadow: `0 0 36px 10px ${color}`, offset: 0.4 },
      { transform: 'scale(1)', boxShadow: `0 0 0 0 ${color}` },
    ],
    { duration: 420, easing: 'ease-out' },
  )
}

function lunge(el: HTMLElement | null) {
  el?.animate(
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-14px) scale(0.94)', offset: 0.3 },
      { transform: 'translateY(70px) scale(1.22)', offset: 0.55 },
      { transform: 'translateY(0) scale(1)' },
    ],
    { duration: 420, easing: 'cubic-bezier(.3,.7,.4,1)' },
  )
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

const sameTarget = (e: GameEvent, side: Side, enemyIndex = 0) =>
  'target' in e && e.target === side && (('enemyIndex' in e && e.enemyIndex) || 0) === enemyIndex

function playFx(events: GameEvent[]) {
  let t = 0 // 当前事件的延迟（毫秒）：敌人逐个行动、连击逐段结算
  events.forEach((e, i) => {
    const prev = events[i - 1]
    switch (e.type) {
      case 'enemyActed': {
        t += 380
        const el = () => spriteOf('enemy', e.enemyIndex)
        if (e.intent.type === 'attack') {
          later(t, () => lunge(el()))
          t += 160 // 让受击落在冲撞最低点
        } else {
          later(t, () => glow(el(), 'rgba(167,139,250,.7)'))
        }
        break
      }
      case 'damageDealt': {
        const fromStatus =
          prev?.type === 'statusTriggered' && sameTarget(prev, e.target, e.enemyIndex)
        const dot = fromStatus && prev.type === 'statusTriggered' && prev.status === 'poison'
        if (dot) t += 220
        later(t, () => {
          const el = spriteOf(e.target, e.enemyIndex)
          if (dot) {
            glow(el, 'rgba(74,222,128,.8)')
            if (e.amount > 0) float(el, `☠ -${e.amount}`, 'fx-poison')
            return
          }
          if (e.blocked > 0) float(el, `🛡 -${e.blocked}`, 'fx-blocked')
          if (e.amount > 0) {
            if (!fromStatus) slash(el)
            hitReact(el)
            float(el, `-${e.amount}`, e.target === 'player' ? 'fx-hurt' : 'fx-damage')
            if (e.target === 'player') screenHit(e.amount >= 10)
          } else if (e.blocked > 0) {
            glow(el, 'rgba(56,189,248,.7)')
          }
        })
        t += 130
        break
      }
      case 'blockGained':
        later(t, () => {
          const el = spriteOf(e.target, e.enemyIndex)
          glow(el, 'rgba(56,189,248,.7)')
          float(el, `+${e.amount} 🛡`, 'fx-block')
        })
        break
      case 'healed':
        later(t, () => {
          const el = spriteOf(e.target, e.enemyIndex)
          glow(el, 'rgba(74,222,128,.7)')
          healRing(el)
          float(el, `+${e.amount} ❤`, 'fx-heal')
        })
        break
      case 'statusApplied': {
        const def = statusById[e.status]
        if (!def) break
        later(t, () =>
          float(
            spriteOf(e.target, e.enemyIndex),
            `${def.icon} ${def.name} +${e.stacks}`,
            def.kind === 'buff' ? 'fx-buff' : 'fx-debuff',
          ),
        )
        t += 90
        break
      }
    }
  })
}

watch(fxBatch, (b) => {
  playFx(b.events)
})
onBeforeUnmount(() => timers.forEach((id) => clearTimeout(id)))
</script>

<template>
  <div
    ref="root"
    class="relative w-full h-full overflow-hidden flex flex-col justify-between px-6 pb-6 pt-36 theme-bg text-slate-100"
  >
    <div
      v-if="isDev && !readonly"
      class="absolute right-3 z-50 flex flex-col items-end gap-1"
      :class="hasRelics ? 'top-28' : 'top-16'"
    >
      <button
        class="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs text-white disabled:(opacity-40 cursor-not-allowed)"
        :disabled="isOver"
        @click="emit('action', { type: 'cheatDamage', amount: 9999 })"
      >
        作弊：直接胜利
      </button>
      <button
        class="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs text-white disabled:(opacity-40 cursor-not-allowed)"
        :disabled="isOver"
        @click="emit('action', { type: 'cheatDraw', count: 3 })"
      >
        作弊：抽三张牌
      </button>
      <button
        class="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-xs text-white disabled:(opacity-40 cursor-not-allowed)"
        :disabled="isOver"
        @click="emit('action', { type: 'cheatEnergy', amount: 3 })"
      >
        作弊：回复3点能量
      </button>
    </div>

    <div class="flex justify-center gap-10">
      <div v-for="(enemy, i) in state.enemies" :key="i" :data-enemy-index="i">
        <EnemyView
          :enemy="enemy"
          :intent="intentOf(enemy)"
          :player-statuses="state.player.statuses"
          :hovered="hoverEnemy === i || aim === i"
        />
      </div>
    </div>

    <div class="flex items-end justify-between">
      <div ref="playerEl" class="w-48 space-y-1 rounded-xl">
        <div class="text-sm text-slate-400">回合 {{ state.turn }}</div>
        <div class="text-sky-300">🛡 {{ state.player.block }}</div>
        <StatusIcons :statuses="state.player.statuses" />
        <div
          class="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-2xl font-bold"
        >
          {{ state.player.energy }}/{{ state.player.maxEnergy }}
        </div>
        <PileButton
          kind="draw"
          label="抽牌堆"
          :count="state.drawPile.length"
          @click="openPile = 'draw'"
        />
      </div>

      <HandView
        :hand="state.hand"
        :cards="state.cards"
        :energy="state.player.energy"
        :dragging-index="drag?.active ? drag.index : null"
        :player-statuses="state.player.statuses"
        :target-statuses="hoverEnemy !== null ? state.enemies[hoverEnemy]?.statuses : undefined"
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
          :disabled="isOver || readonly"
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
          :stroke="hoverEnemy !== null ? '#fbbf24' : '#94a3b8'"
          stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray="4 12"
        />
        <circle
          :cx="drag.x"
          :cy="drag.y"
          r="14"
          fill="none"
          :stroke="hoverEnemy !== null ? '#fbbf24' : '#94a3b8'"
          stroke-width="4"
        />
      </template>
      <text
        v-else
        :x="drag.x"
        :y="drag.y - 20"
        text-anchor="middle"
        :fill="drag.y < HAND_TOP ? '#fbbf24' : '#94a3b8'"
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
        v-else
        class="fx-heal-particles absolute pointer-events-none z-30"
        :style="{ left: `${f.x}px`, top: `${f.y}px` }"
      >
        <span v-for="i in 9" :key="i" />
      </div>
    </template>

    <PileModal
      v-if="pileView"
      :title="pileView.title"
      :pile="pileView.pile"
      :cards="state.cards"
      :sorted="openPile === 'draw'"
      @close="openPile = null"
    />

    <div
      v-if="isOver && !readonly"
      class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-6"
    >
      <div class="text-5xl font-bold">{{ state.phase === 'won' ? '胜利！' : '战败…' }}</div>
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
}
.fx-blocked {
  font-size: 1.5rem;
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
