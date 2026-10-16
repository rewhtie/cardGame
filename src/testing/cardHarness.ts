import { cards, starterDeck } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createBattle, dispatch } from '@/engine/battle'
import type { BattleState, CardDef, DispatchResult, EnemyDef } from '@/engine/types'

export interface ScenarioOpts {
  /** 起手牌，缺省为只有被测牌 */
  hand?: string[]
  energy?: number
  playerHp?: number
  playerStatuses?: Record<string, number>
  enemies?: EnemyDef[]
  seed?: number
}

/** 构造一个"手牌固定"的战斗：其余牌组留在抽牌堆，牌堆不会重复出现手牌里的牌 */
export function setupScenario(opts: ScenarioOpts = {}): BattleState {
  const hand = opts.hand ?? []
  const base = createBattle({
    seed: opts.seed ?? 1,
    deck: starterDeck,
    enemies: opts.enemies ?? [slime],
    cards,
  }).state
  return {
    ...base,
    hand: [...hand],
    drawPile: [...starterDeck],
    discardPile: [],
    player: {
      ...base.player,
      energy: opts.energy ?? base.player.energy,
      hp: opts.playerHp ?? base.player.hp,
      statuses: { ...opts.playerStatuses },
    },
  }
}

/** 打出手牌里第一张 cardId；牌不在手里直接抛错，避免测试静默通过 */
export function playCard(state: BattleState, cardId: string, target?: number): DispatchResult {
  const handIndex = state.hand.indexOf(cardId)
  if (handIndex < 0) throw new Error(`手牌里没有 ${cardId}：${state.hand.join(',')}`)
  return dispatch(state, { type: 'playCard', handIndex, target })
}

/** 连续打出若干张牌，返回最终状态和全部事件 */
export function playSequence(state: BattleState, cardIds: string[]) {
  let current = state
  const events: DispatchResult['events'] = []
  for (const id of cardIds) {
    const r = playCard(current, id)
    current = r.state
    events.push(...r.events)
  }
  return { state: current, events }
}

/** 通用冒烟：单独打出一张牌，检查费用、牌堆去向、无非法操作 */
export function smokeCheck(cardId: string): string[] {
  const def = cards[cardId]
  if (!def) return [`未知卡牌 ${cardId}`]
  const problems: string[] = []
  const before = setupScenario({ hand: [cardId], energy: 3 })
  const { state, events } = playCard(before, cardId)

  const invalid = events.find((e) => e.type === 'invalidAction')
  if (invalid) problems.push(`打出被拒绝：${'reason' in invalid ? invalid.reason : ''}`)

  const gained = def.effects.reduce((n, e) => n + (e.type === 'gainEnergy' ? e.amount : 0), 0)
  const expectedEnergy = (def.cost === 'X' ? 0 : 3 - def.cost) + gained
  if (state.player.energy !== expectedEnergy)
    problems.push(`能量应为 ${expectedEnergy}，实际 ${state.player.energy}`)

  const inDiscard = state.discardPile.includes(cardId)
  const inExhaust = state.exhaustPile.includes(cardId)
  if (def.kind === 'power' && (inDiscard || inExhaust)) problems.push('能力牌不应进入弃牌/消耗堆')
  if (def.kind !== 'power' && def.exhaust && !inExhaust) problems.push('消耗牌应进入消耗堆')
  if (def.kind !== 'power' && !def.exhaust && !inDiscard) problems.push('普通牌应进入弃牌堆')
  if (state.hand.includes(cardId)) problems.push('打出后牌仍在手牌中')
  return problems
}

export const twoSlimes = (): EnemyDef[] => [slime, { ...slime, id: 'slime-2' }]

/** 某一类牌的全部卡牌 id */
export const cardIdsOfKind = (kind: CardDef['kind']) =>
  Object.values(cards)
    .filter((c) => c.kind === kind)
    .map((c) => c.id)

const SNAPSHOT_ENERGY = 3
const SNAPSHOT_HP = 50

interface Snapshot {
  enemyHp: number[]
  playerBlock: number
  playerHp: number
  handSize: number
  playerStatuses: Record<string, number>
  enemyStatuses: Record<string, number>[]
}

/**
 * 数据驱动校验：不看引擎怎么算，只按卡牌定义的 effects 推算"应该发生什么"，
 * 与实际打出后的状态对比。场景：两只史莱姆、3 能量、玩家 50 血、无任何状态，
 * 所以所有数值修正都不生效；X 牌的 X = 3。
 */
export function effectSnapshot(cardId: string): { actual: Snapshot; expected: Snapshot } {
  const def = cards[cardId]
  if (!def) throw new Error(`未知卡牌 ${cardId}`)
  const before = setupScenario({
    hand: [cardId],
    energy: SNAPSHOT_ENERGY,
    playerHp: SNAPSHOT_HP,
    enemies: twoSlimes(),
  })
  const after = playCard(before, cardId).state

  const x = def.cost === 'X' ? SNAPSHOT_ENERGY : 0
  const expected: Snapshot = {
    enemyHp: before.enemies.map((e) => e.hp),
    playerBlock: 0,
    playerHp: SNAPSHOT_HP,
    handSize: 0,
    playerStatuses: {},
    enemyStatuses: before.enemies.map(() => ({})),
  }
  const stack = (to: Record<string, number>, id: string, n: number) => (to[id] = (to[id] ?? 0) + n)
  for (const e of def.effects) {
    if (e.type === 'damage') expected.enemyHp[0]! -= e.perX ? e.amount * x : e.amount
    else if (e.type === 'block') expected.playerBlock += e.perX ? e.amount * x : e.amount
    else if (e.type === 'draw') expected.handSize += e.count
    else if (e.type === 'heal')
      expected.playerHp = Math.min(before.player.maxHp, expected.playerHp + e.amount)
    else if (e.type === 'applyStatus') {
      if (e.to === 'self') stack(expected.playerStatuses, e.status, e.stacks)
      else if (e.to === 'target') stack(expected.enemyStatuses[0]!, e.status, e.stacks)
      else expected.enemyStatuses.forEach((st) => stack(st, e.status, e.stacks))
    }
  }
  const actual: Snapshot = {
    enemyHp: after.enemies.map((e) => e.hp),
    playerBlock: after.player.block,
    playerHp: after.player.hp,
    handSize: after.hand.length,
    playerStatuses: after.player.statuses,
    enemyStatuses: after.enemies.map((e) => e.statuses),
  }
  return { actual, expected }
}
