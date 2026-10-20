import { isForgeable, upgradedId } from './enchant'
import type { RunResult, RunState } from './run'
import { createRng, deriveSeed, sample, type Rng } from './seed'
import type { GameEvent } from './types'

export type BattleKind = 'monster' | 'elite'
export interface BattleBonus {
  gold?: number
  relic?: boolean
}

/** 事件选项的结果原语 */
export type Outcome =
  | { type: 'gold'; amount: number }
  | { type: 'hp'; amount: number }
  | { type: 'maxHp'; amount: number }
  | { type: 'relic' }
  | { type: 'potion'; count: number }
  | { type: 'addCard'; id: string }
  | { type: 'removeCard' }
  | { type: 'upgradeCard' }
  | { type: 'upgradeRandom'; count: number }
  | { type: 'battle'; kind: BattleKind; bonus?: BattleBonus }
  | { type: 'chance'; p: number; win: Outcome[]; lose: Outcome[] }

export interface EventOption {
  label: string
  cost?: { gold?: number; hp?: number }
  /** 返回不可选的原因；可选返回 null */
  requires?(run: RunState): string | null
  outcomes: Outcome[]
}

export interface EventDef {
  id: string
  title: string
  icon: string
  text: string
  weight?: number
  /** 事件是否可出现 */
  requires?(run: RunState): boolean
  options: EventOption[]
}

export interface EventState {
  id: string
  /** 已发生的结果文字，逐行展示 */
  result: string[]
  /** 选牌暂停后尚未结算的结果 */
  pending: Outcome[]
  pick: 'remove' | 'upgrade' | null
  /** 已选的选项；null 表示还没选 */
  optionIndex: number | null
}

/** 事件战斗：胜利后奖励里追加 bonus */
export interface EventBattle {
  kind: BattleKind
  bonus?: BattleBonus
}

export const NO_OPTION_TEXT = '你转身离开了。'
/** 遗物池拿空时，"获得遗物"折算成的金币 */
export const RELIC_FALLBACK_GOLD = 50

/** 抽取本节点的事件：同一局不重复，全部见过后重新开始 */
export function pickEvent(run: RunState, nodeId: string): EventDef {
  const all = run.content.events ?? []
  const available = all.filter((e) => e.requires?.(run) !== false)
  const fresh = available.filter((e) => !run.seenEvents.includes(e.id))
  const pool = fresh.length > 0 ? fresh : available.length > 0 ? available : all
  const rng = createRng(deriveSeed(run.seed, `event:${nodeId}`))
  const total = pool.reduce((sum, e) => sum + (e.weight ?? 1), 0)
  let roll = rng.float() * total
  for (const e of pool) {
    roll -= e.weight ?? 1
    if (roll < 0) return e
  }
  return pool[pool.length - 1] as EventDef
}

/** 选项不可选的原因；可选返回 null */
export function optionDisabled(run: RunState, opt: EventOption): string | null {
  if ((opt.cost?.gold ?? 0) > run.gold) return '金币不足'
  if ((opt.cost?.hp ?? 0) >= run.player.hp) return '生命不足'
  return opt.requires?.(run) ?? null
}

const say = (run: RunState, line: string): RunState =>
  run.event ? { ...run, event: { ...run.event, result: [...run.event.result, line] } } : run

/**
 * 依次结算结果。遇到选牌类结果暂停（剩余结果存进 event.pending），遇到战斗类结果丢弃后续结果。
 * grant 由调用方注入（run.ts 的 grantRelic），避免两个文件互相导入。
 */
export function resolveOutcomes(
  run: RunState,
  outcomes: Outcome[],
  rng: Rng,
  grant: (run: RunState, id: string) => RunResult,
): RunResult {
  let state = run
  const events: GameEvent[] = []
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i] as Outcome
    const rest = outcomes.slice(i + 1)
    switch (o.type) {
      case 'gold': {
        const gold = Math.max(0, state.gold + o.amount)
        state = say({ ...state, gold }, o.amount >= 0 ? `获得 ${o.amount} 金币` : `失去 ${-o.amount} 金币`)
        break
      }
      case 'hp': {
        const hp = Math.max(1, Math.min(state.player.maxHp, state.player.hp + o.amount))
        const delta = hp - state.player.hp
        if (delta > 0) events.push({ type: 'healed', target: 'player', amount: delta })
        else if (delta < 0) events.push({ type: 'hpLost', amount: -delta })
        state = say(
          { ...state, player: { ...state.player, hp } },
          o.amount >= 0 ? `恢复 ${Math.abs(delta)} 点生命` : `失去 ${Math.abs(delta)} 点生命`,
        )
        break
      }
      case 'maxHp': {
        const maxHp = Math.max(1, state.player.maxHp + o.amount)
        const hp = Math.max(1, Math.min(maxHp, state.player.hp + o.amount))
        if (o.amount < 0) events.push({ type: 'hpLost', amount: -o.amount })
        else if (hp > state.player.hp) events.push({ type: 'healed', target: 'player', amount: hp - state.player.hp })
        state = say(
          { ...state, player: { hp, maxHp } },
          o.amount >= 0 ? `最大生命 +${o.amount}` : `最大生命 ${o.amount}`,
        )
        break
      }
      case 'relic': {
        const unowned = (state.content.relicIds ?? []).filter((id) => !state.relics.includes(id))
        const [id] = sample(unowned, 1, rng)
        if (id === undefined) {
          state = say({ ...state, gold: state.gold + RELIC_FALLBACK_GOLD }, `获得 ${RELIC_FALLBACK_GOLD} 金币`)
          break
        }
        const r = grant(state, id)
        events.push(...r.events)
        state = say(r.state, '获得一件遗物')
        break
      }
      case 'potion': {
        const pool = state.content.potionIds ?? []
        const got = sample(pool, Math.min(o.count, pool.length), rng)
        // sample 不放回；一次要多瓶时允许重复，补足数量
        while (got.length < o.count && pool.length > 0) got.push(pool[rng.int(pool.length)] as string)
        state = say({ ...state, potionOffer: [...(state.potionOffer ?? []), ...got] }, `发现 ${got.length} 瓶药水`)
        break
      }
      case 'addCard': {
        const deck = [...state.content.deck, o.id]
        events.push({ type: 'cardAdded', cardId: o.id, count: 1 })
        state = say({ ...state, content: { ...state.content, deck } }, `获得卡牌：${state.content.cards[o.id]?.name ?? o.id}`)
        break
      }
      case 'upgradeRandom': {
        const idx = state.content.deck.map((_, k) => k).filter((k) => isForgeable(state.content.cards, state.content.deck[k] as string))
        const picked = new Set(sample(idx, o.count, rng))
        const deck = state.content.deck.map((c, k) => (picked.has(k) ? upgradedId(c) : c))
        const cards = [...picked].map((k) => ({ from: state.content.deck[k] as string, to: deck[k] as string }))
        if (cards.length > 0) events.push({ type: 'cardsUpgraded', cards })
        state = say({ ...state, content: { ...state.content, deck } }, `升级了 ${picked.size} 张牌`)
        break
      }
      case 'removeCard':
      case 'upgradeCard':
        if (!state.event) return { state, events }
        return {
          state: {
            ...state,
            screen: 'eventPick',
            event: { ...state.event, pending: rest, pick: o.type === 'removeCard' ? 'remove' : 'upgrade' },
          },
          events,
        }
      case 'battle':
        return { state: { ...state, eventBattle: { kind: o.kind, bonus: o.bonus } }, events }
      case 'chance': {
        const next = rng.float() < o.p ? o.win : o.lose
        const r = resolveOutcomes(state, [...next, ...rest], rng, grant)
        return { state: r.state, events: [...events, ...r.events] }
      }
    }
  }
  return { state, events }
}
