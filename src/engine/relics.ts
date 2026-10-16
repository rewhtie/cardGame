import { addStatus, applyBlock, drawCards, heal } from './effects'
import { enchantedId, isEnchanted, isUpgraded, rawId, upgradedId } from './enchant'
import { sample, type Rng } from './seed'
import type { RunState } from './run'
import type { BattleState, CardDef, Effect, GameEvent } from './types'

/** 战斗中的遗物钩子：在对应时机由 battle 统一触发，遗物只声明自己关心的时机 */
export interface BattleHooks {
  onBattleStart(s: BattleState, events: GameEvent[]): void
  /** 玩家回合开始（状态结算之后、抽牌之前） */
  onTurnStart(s: BattleState, events: GameEvent[]): void
  onTurnEnd(s: BattleState, events: GameEvent[]): void
  onBattleWon(s: BattleState, events: GameEvent[]): void
  /** 完美格挡：enemyIndex 为发动攻击的敌人 */
  onPerfectBlock(s: BattleState, events: GameEvent[], enemyIndex: number): void
  /** 一张牌的效果结算完之后 */
  onCardPlayed(s: BattleState, events: GameEvent[], card: CardDef): void
}

/** 钩子在 (s, events) 之外的额外参数 */
type HookExtra<K extends keyof BattleHooks> =
  Parameters<BattleHooks[K]> extends [unknown, unknown, ...infer R] ? R : never

/** 获得遗物时的结算结果：cards / heal 用于界面演出 */
export interface AcquireResult {
  run: RunState
  cards?: { from: string; to: string }[]
  heal?: number
}

export interface RelicRule extends Partial<BattleHooks> {
  /** 最大能量加成 */
  maxEnergy?: number
  /** 药水栏位加成 */
  potionSlots?: number
  /** 获得时需要玩家先选一张牌（选完才获得） */
  needsPick?: boolean
  /** 改写出牌时即将结算的效果（如伤害翻倍） */
  modifyEffect?(s: BattleState, card: CardDef, effect: Effect): Effect
  /** 获得时的一次性结算 */
  onAcquire?(run: RunState, rng: Rng): AcquireResult
}

/** 遗物的计数 / 标记存放处：BattleState.relicState[id] */
const getState = (s: BattleState, id: string) => s.relicState[id] ?? 0

const PEN_NIB_EVERY = 10
const WHETSTONE_CARDS = 2
const STRAWBERRY_HP = 7

const withGold = (amount: number) => (run: RunState) => ({
  run: { ...run, gold: run.gold + amount },
})

/**
 * 遗物的规则。名称、图标、文案等展示信息在 data/items.ts。
 * 同一遗物持有多个时，战斗钩子只触发一次。
 */
export const RELIC_RULES: Readonly<Record<string, RelicRule>> = {
  burningBlood: { onBattleWon: (s, ev) => heal(s, 'player', 0, 6, ev) },
  meatOnBone: {
    onBattleWon: (s, ev) => {
      if (s.player.hp <= s.player.maxHp / 2) heal(s, 'player', 0, 12, ev)
    },
  },
  bloodVial: { onBattleStart: (s, ev) => heal(s, 'player', 0, 2, ev) },
  bronzeScale: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'thorns', 3, ev) },
  vajra: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'strength', 1, ev) },
  smoothStone: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'dexterity', 1, ev) },
  energyCrystal: { maxEnergy: 1 },
  anchor: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) applyBlock(s, 'player', 10, ev)
    },
  },
  lantern: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) gainEnergy(s, 1, ev)
    },
  },
  happyFlower: {
    onTurnStart: (s, ev) => {
      if (s.turn % 3 === 0) gainEnergy(s, 1, ev)
    },
  },
  preparedBag: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) drawCards(s, 2, ev)
    },
  },
  orichalcum: {
    onTurnEnd: (s, ev) => {
      if (s.player.block === 0) applyBlock(s, 'player', 6, ev)
    },
  },
  roundShield: {
    onPerfectBlock: (s, ev, enemyIndex) => addStatus(s, 'enemy', enemyIndex, 'vulnerable', 1, ev),
  },
  // 每打出 10 张攻击牌，下一张攻击牌伤害翻倍；翻倍的那张不计数
  penNib: {
    modifyEffect: (s, card, effect) =>
      card.kind === 'attack' && effect.type === 'damage' && getState(s, 'penNib') >= PEN_NIB_EVERY
        ? { ...effect, amount: effect.amount * 2 }
        : effect,
    onCardPlayed: (s, _ev, card) => {
      if (card.kind !== 'attack') return
      const n = getState(s, 'penNib')
      s.relicState = { ...s.relicState, penNib: n >= PEN_NIB_EVERY ? 0 : n + 1 }
    },
  },
  ancientCoin: { onAcquire: withGold(50) },
  goldPouch: { onAcquire: withGold(150) },
  strawberry: {
    onAcquire: (run) => ({
      run: {
        ...run,
        player: { hp: run.player.hp + STRAWBERRY_HP, maxHp: run.player.maxHp + STRAWBERRY_HP },
      },
      heal: STRAWBERRY_HP,
    }),
  },
  potionBelt: { potionSlots: 2 },
  whetstone: {
    onAcquire: (run, rng) => {
      const idx = run.content.deck
        .map((_, i) => i)
        .filter((i) => {
          const c = run.content.deck[i] as string
          return !isUpgraded(c) && run.content.cards[rawId(c)]?.kind === 'attack'
        })
      const picked = new Set(sample(idx, WHETSTONE_CARDS, rng))
      const cards: { from: string; to: string }[] = []
      const deck = run.content.deck.map((c, i) => {
        if (!picked.has(i)) return c
        cards.push({ from: c, to: upgradedId(c) })
        return upgradedId(c)
      })
      return { run: { ...run, content: { ...run.content, deck } }, cards }
    },
  },
  trainingGuide: {
    needsPick: true,
    // 无法让玩家选牌时（如作弊发放、战斗外初始化）随机附魔一张
    onAcquire: (run, rng) => {
      const idx = run.content.deck
        .map((_, i) => i)
        .filter((i) => !isEnchanted(run.content.deck[i] as string))
      const [pick] = sample(idx, 1, rng)
      if (pick === undefined) return { run }
      const from = run.content.deck[pick] as string
      const deck = run.content.deck.map((c, i) => (i === pick ? enchantedId(c) : c))
      return {
        run: { ...run, content: { ...run.content, deck } },
        cards: [{ from, to: deck[pick] as string }],
      }
    },
  },
}

function gainEnergy(s: BattleState, amount: number, events: GameEvent[]) {
  s.player.energy += amount
  events.push({ type: 'energyGained', amount })
}

/** 去重后的持有遗物规则，保持获得顺序 */
function activeRules(relics: readonly string[]): RelicRule[] {
  return [...new Set(relics)].flatMap((id) => RELIC_RULES[id] ?? [])
}

/** 触发所有持有遗物的某个战斗钩子 */
export function fireRelics<K extends keyof BattleHooks>(
  s: BattleState,
  hook: K,
  events: GameEvent[],
  ...extra: HookExtra<K>
) {
  for (const rule of activeRules(s.relics)) {
    ;(rule[hook] as ((...a: unknown[]) => void) | undefined)?.(s, events, ...extra)
  }
}

/** 依次让持有遗物改写即将结算的效果 */
export function modifyEffect(s: BattleState, card: CardDef, effect: Effect): Effect {
  return activeRules(s.relics).reduce((e, r) => r.modifyEffect?.(s, card, e) ?? e, effect)
}

const sum = (relics: readonly string[], key: 'maxEnergy' | 'potionSlots') =>
  activeRules(relics).reduce((n, r) => n + (r[key] ?? 0), 0)

export const relicMaxEnergy = (relics: readonly string[]) => sum(relics, 'maxEnergy')
export const relicPotionSlots = (relics: readonly string[]) => sum(relics, 'potionSlots')
export const relicNeedsPick = (id: string) => RELIC_RULES[id]?.needsPick === true
