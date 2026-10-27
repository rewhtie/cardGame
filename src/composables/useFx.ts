import { reactive, ref, shallowRef } from 'vue'
import type { CardDef, GameEvent, Intent } from '@/engine/types'
import { playSfx } from './useSfx'
import { sfxSlotsForEvent } from './sfxResolve'

/** 最近一次 dispatch 产生的引擎事件；seq 保证相同内容也能触发 watch */
export const fxBatch = shallowRef<{ seq: number; events: GameEvent[] }>({ seq: 0, events: [] })

/**
 * 引擎事件 -> 表现层：状态照常立即更新，动画只是叠在上面的纯视觉效果。
 * play=false 时只广播给全屏特效 / 遗物展示，不进战斗演出队列（调用方自己分段入队）。
 */
export function pushFx(events: GameEvent[], play = true): FxTicket | undefined {
  if (!events.length) return
  fxBatch.value = { seq: fxBatch.value.seq + 1, events }
  return play ? enqueueFx(events) : undefined
}

/** 仅供 RunView 的"塞牌"飞行动画估算错开延迟用；战斗演出走上面的队列，不看这个 */
export function fxTimes(events: GameEvent[]): number[] {
  let t = 0
  return events.map((e, i) => {
    switch (e.type) {
      case 'enemyActed': {
        t += 380
        const at = t
        if (e.intent.type === 'attack') t += 160 // 让受击落在冲撞最低点
        return at
      }
      case 'damageDealt': {
        const prev = events[i - 1]
        const dot =
          prev?.type === 'statusTriggered' &&
          prev.status === 'poison' &&
          prev.target === e.target &&
          (prev.enemyIndex ?? 0) === (e.enemyIndex ?? 0)
        if (dot) t += 220
        const at = t
        t += 130
        return at
      }
      case 'statusApplied': {
        const at = t
        t += 90
        return at
      }
      default:
        return t
    }
  })
}

// ---- 演出队列：引擎事件按顺序逐个"演"，演完一个才让它对应的数值落地 ----
// 状态（BattleState）在 dispatch 时已是终值；界面显示的数值 = 真实值 + lag，
// lag 是"已发生但动画还没播完"的事件造成的差额，事件演完即从 lag 里扣掉。

/** 演出滞后量：显示值 = 真实值 + lag（意图：显示的是真实意图往回退 lag 步） */
export const lag = reactive({
  playerHp: 0,
  playerBlock: 0,
  enemyHp: {} as Record<number, number>,
  enemyBlock: {} as Record<number, number>,
  enemyStunned: {} as Record<number, number>,
  explosionPreview: {} as Record<number, { damage: number; dueTurn: number }>,
  intentPreview: {} as Record<number, Intent>,
  intent: {} as Record<number, number>,
})

/** 事件落地前，对各数值造成的差额；sign=1 入队时记上，sign=-1 演完时扣掉 */
function settle(e: GameEvent, sign: 1 | -1) {
  const add = (rec: Record<number, number>, i: number, n: number) => {
    rec[i] = (rec[i] ?? 0) + sign * n
  }
  const i = 'enemyIndex' in e ? (e.enemyIndex ?? 0) : 0
  switch (e.type) {
    case 'damageDealt':
      if (e.target === 'player') {
        lag.playerHp += sign * e.amount
        lag.playerBlock += sign * e.blocked
      } else {
        add(lag.enemyHp, i, e.amount)
        add(lag.enemyBlock, i, e.blocked)
      }
      break
    case 'enemyRevived':
      add(lag.enemyHp, i, -e.amount)
      break
    case 'enemyExploded':
      if (sign === 1) lag.explosionPreview[i] = { damage: e.damage, dueTurn: 0 }
      else delete lag.explosionPreview[i]
      break
    case 'healed':
      if (e.target === 'player') lag.playerHp -= sign * e.amount
      else add(lag.enemyHp, i, -e.amount)
      break
    case 'blockGained':
      if (e.target === 'player') lag.playerBlock -= sign * e.amount
      else add(lag.enemyBlock, i, -e.amount)
      break
    case 'statusApplied':
      if (e.target === 'enemy' && e.status === 'stunned') add(lag.enemyStunned, i, -e.stacks)
      break
    case 'statusRemoved':
      if (e.target === 'enemy' && e.status === 'stunned') add(lag.enemyStunned, i, 1)
      break
  }
}

/** 一批事件的"取件票"：可等到前 i 个事件都演完 */
export interface FxTicket {
  /** 前 count 个事件都演完时兑现 */
  reached(count: number): Promise<void>
  /** 整批演完时兑现 */
  done: Promise<void>
}

interface Entry {
  event: GameEvent
  prev?: GameEvent
  batch: { completed: number; waiters: { count: number; resolve: () => void }[] }
}

/** 战斗界面注册的事件播放器：返回的 Promise 兑现即代表这个事件的动画演完 */
type FxHandler = (event: GameEvent, prev?: GameEvent) => Promise<void> | void
let handler: FxHandler | null = null
let queue: Entry[] = []
let running = false
let epoch = 0
let idleWaiters: (() => void)[] = []

/** 当前战斗的牌表，用来按牌类型选出牌音效；BattleView 挂载时设置、卸载时清除 */
let fxCards: Record<string, CardDef> | null = null
export function setFxCards(cards: Record<string, CardDef> | null) {
  fxCards = cards
}
/** 战斗音效挂在演出队列上：事件轮到演出时，按事件与成因查槽位发声，面板复现和真实游戏走同一条路径 */
function playEventSfx(e: GameEvent, prev?: GameEvent) {
  for (const slot of sfxSlotsForEvent(e, prev, fxCards ?? {})) void playSfx(slot)
}

export function setFxHandler(h: FxHandler | null) {
  handler = h
}
/** 仅当注册的还是自己时才注销，避免新旧界面交接时误删对方 */
export function clearFxHandler(h: FxHandler) {
  if (handler === h) handler = null
}

function flushWaiters(batch: Entry['batch']) {
  batch.waiters = batch.waiters.filter((w) => {
    if (batch.completed < w.count) return true
    w.resolve()
    return false
  })
}

async function drain() {
  if (running) return
  running = true
  const mine = epoch
  while (queue.length) {
    const entry = queue.shift() as Entry
    try {
      playEventSfx(entry.event, entry.prev)
      await handler?.(entry.event, entry.prev)
    } catch {
      // 动画失败不能卡住整个队列
    }
    if (mine !== epoch) return // 期间被 resetFx 作废
    settle(entry.event, -1)
    entry.batch.completed++
    flushWaiters(entry.batch)
  }
  running = false
  lag.intent = {} // 敌人阶段全部演完，意图才翻到新的一招
  lag.intentPreview = {}
  idleWaiters.forEach((r) => r())
  idleWaiters = []
}

/** 把一批事件排进演出队列；数值立刻记入 lag，随各事件演完逐个落地 */
export function enqueueFx(events: GameEvent[]): FxTicket {
  const batch: Entry['batch'] = { completed: 0, waiters: [] }
  events.forEach((event, i) => {
    settle(event, 1)
    if (event.type === 'enemyActed') {
      lag.intent[event.enemyIndex] = (lag.intent[event.enemyIndex] ?? 0) + 1
      lag.intentPreview[event.enemyIndex] = event.intent
    }
    queue.push({ event, prev: events[i - 1], batch })
  })
  const reached = (count: number) =>
    batch.completed >= count
      ? Promise.resolve()
      : new Promise<void>((resolve) => batch.waiters.push({ count, resolve }))
  void drain()
  return { reached, done: reached(events.length) }
}

/** 队列清空（含正在演的事件）时兑现 */
export function whenFxIdle(): Promise<void> {
  return running || queue.length
    ? new Promise<void>((resolve) => idleWaiters.push(resolve))
    : Promise.resolve()
}

/** 特效重置信号：读档 / 开新局 / 退出时自增，通知战斗界面丢弃未播完的动画 */
export const fxReset = ref(0)
/** 作废队列里所有未演的事件，演出数值立刻回到真实值，所有等待者放行 */
export function resetFx() {
  epoch++
  queue = []
  running = false
  lag.playerHp = 0
  lag.playerBlock = 0
  lag.enemyHp = {}
  lag.enemyBlock = {}
  lag.enemyStunned = {}
  lag.explosionPreview = {}
  lag.intentPreview = {}
  lag.intent = {}
  idleWaiters.forEach((r) => r())
  idleWaiters = []
  fxReset.value++
}
