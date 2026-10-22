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

/**
 * 吃目标寄生层数的牌（消耗 / 引爆 / 按层数施加 / 传播 / 斩杀转化）：
 * 测试场景里敌人身上没有寄生，先给目标补足层数，否则这些牌只会被拒绝或空转。
 */
export function primeParasite(state: BattleState, cardId: string, target = 0): BattleState {
  const effects = state.cards[cardId]?.effects ?? []
  // 移除自身增益的牌：玩家先挂上 PRIMED_BUFF 层力量，否则打出会被拒绝
  if (effects.some((e) => e.type === 'purgeSelfBuff') && !(state.player.statuses.strength ?? 0))
    state = { ...state, player: { ...state.player, statuses: { ...state.player.statuses, strength: PRIMED_BUFF } } }
  const needs = effects.some((e) =>
    ['consumeParasite', 'parasiteBurst', 'devourParasite', 'parasiteStatus', 'spreadParasite', 'convertCorpse'].includes(e.type),
  )
  if (!needs || !state.enemies[target]) return state
  const layers = effects.some((e) => e.type === 'convertCorpse') ? PRIMED_CORPSE : PRIMED_LAYERS
  const enemies = state.enemies.map((e, i) =>
    i === target && (e.statuses.parasite ?? 0) < layers ? { ...e, statuses: { ...e.statuses, parasite: layers } } : e,
  )
  return { ...state, enemies }
}
export const PRIMED_LAYERS = 20
export const PRIMED_CORPSE = 999
export const PRIMED_BUFF = 4

/** 打出手牌里第一张 cardId；牌不在手里直接抛错，避免测试静默通过 */
export function playCard(state: BattleState, cardId: string, target?: number): DispatchResult {
  const handIndex = state.hand.indexOf(cardId)
  if (handIndex < 0) throw new Error(`手牌里没有 ${cardId}：${state.hand.join(',')}`)
  state = primeParasite(state, cardId, target ?? 0)
  // 需要选状态牌的牌：手里没有就补一张伤口，并自动选它
  const needsPick = state.cards[cardId]?.effects.some((e) => e.type === 'exhaustStatusCard')
  if (needsPick) {
    let pick = state.hand.findIndex((c) => state.cards[c]?.rarity === 'status')
    if (pick < 0) {
      state = { ...state, hand: [...state.hand, 'wound'] }
      pick = state.hand.length - 1
    }
    return dispatch(state, { type: 'playCard', handIndex, target, pick })
  }
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

  // 无法打出的牌（诅咒）：必须被拒绝，且牌和能量原样保留
  if (def.unplayable) {
    if (!events.some((e) => e.type === 'invalidAction')) problems.push('无法打出的牌应被拒绝')
    if (!state.hand.includes(cardId)) problems.push('被拒绝后牌应留在手牌中')
    if (state.player.energy !== 3) problems.push('被拒绝后不应扣能量')
    return problems
  }

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
  const before = primeParasite(
    setupScenario({
      hand: [cardId],
      energy: SNAPSHOT_ENERGY,
      playerHp: SNAPSHOT_HP,
      enemies: twoSlimes(),
    }),
    cardId,
  )
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
  // 付费打出的剑击会给 1 层剑流（引擎钩子，不在 effects 里）
  if (cardId === 'swordStrike') expected.playerStatuses.swordFlow = 1
  const stack = (to: Record<string, number>, id: string, n: number) => (to[id] = (to[id] ?? 0) + n)
  // 寄生系的牌：目标（敌人 0）被预置了寄生层数，按效果顺序推算剩余层数
  // 群体牌：伤害打到每只敌人；之前给目标上的裂伤让每段伤害 +层数
  const hitAll = def.target === 'allEnemies'
  const gashOn = [0, 0]
  const hurt = (total: number, hits: number) => {
    expected.enemyHp.forEach((_, i) => {
      if (i === 0 || hitAll) expected.enemyHp[i]! -= total + gashOn[i]! * hits
    })
  }
  let layers = before.enemies[0]!.statuses.parasite ?? 0
  const primed = layers > 0
  if (primed) expected.enemyStatuses[0]!.parasite = layers
  // 无法打出的牌：打出被拒绝，状态不变，牌仍在手里
  if (def.unplayable) expected.handSize = 1
  else
    for (const e of def.effects) {
      if (e.type === 'damage') {
        hurt(
          (e.perX ? e.amount * x : e.amount * (e.hits ?? 1)) + (e.perAttackPlayed?.per ?? 0) + (e.maxHpPct ? Math.round((before.player.maxHp * e.maxHpPct) / 100 + 1e-9) : 0), // 第 1 张攻击牌
          e.perX ? 1 : (e.hits ?? 1),
        )
        // 玩家攻击命中带寄生的敌人：回复层数的一半并清空
        if (layers > 0) {
          expected.playerHp = Math.min(before.player.maxHp, expected.playerHp + Math.floor(layers / 2))
          layers = 0
          delete expected.enemyStatuses[0]!.parasite
        }
      }
      else if (e.type === 'sapStrength') {
        stack(expected.enemyStatuses[0]!, 'strength', -e.amount)
        stack(expected.enemyStatuses[0]!, 'restore:strength', e.amount)
      }
      else if (e.type === 'purgeSelfBuff') expected.playerBlock += PRIMED_BUFF // 预置的力量被移除、换成格挡
      else if (e.type === 'block') expected.playerBlock += e.perX ? e.amount * x : e.amount
      else if (e.type === 'blockByIntent') {
        const intent = before.enemies[0]!.def.intents[before.enemies[0]!.intentIndex]
        if (intent?.type === 'attack') expected.playerBlock += intent.damage
      } else if (e.type === 'playTop') {
        // 抽牌堆顶是打击：对第一只敌人造成 6 点伤害
        expected.enemyHp[0]! -= 6
      }
      else if (e.type === 'draw') expected.handSize += e.count
      else if (e.type === 'loseHp') expected.playerHp -= e.amount
      else if (e.type === 'consumeParasite') {
        layers -= e.amount
        if (layers > 0) expected.enemyStatuses[0]!.parasite = layers
        else delete expected.enemyStatuses[0]!.parasite
      } else if (e.type === 'stealMaxHp') {
        const max = before.enemies[0]!.def.maxHp
        expected.enemyHp[0] = Math.min(expected.enemyHp[0]!, max - e.amount)
        expected.playerHp += e.amount
      } else if (e.type === 'devourParasite') {
        const eaten = Math.min(layers, e.max)
        expected.enemyHp[0]! -= eaten * e.per
        layers -= eaten
        if (layers > 0) expected.enemyStatuses[0]!.parasite = layers
        else delete expected.enemyStatuses[0]!.parasite
      } else if (e.type === 'parasiteBurst') {
        expected.enemyHp[0]! -= layers
        layers = 0
        delete expected.enemyStatuses[0]!.parasite
      } else if (e.type === 'parasiteStatus') {
        stack(expected.enemyStatuses[0]!, e.status, Math.max(1, Math.floor(layers / e.divisor)))
      } else if (e.type === 'spreadParasite') {
        expected.enemyStatuses[1]!.parasite = layers
      } else if (e.type === 'convertCorpse') {
        expected.enemyHp[0] = 0
        expected.enemyStatuses[0] = {}
      } else if (e.type === 'heal')
        expected.playerHp = Math.min(before.player.maxHp, expected.playerHp + e.amount)
      else if (e.type === 'penalty') {
        // 力量 / 敏捷：立刻失去，记透支待恢复；能量 / 抽牌：记到下回合的状态
        const [now, mark] =
          e.stat === 'strength' ? ['strength', 'overdraft'] : e.stat === 'dexterity' ? ['dexterity', 'overdraftDex'] : [undefined, e.stat === 'energy' ? 'energyDown' : 'drawDown']
        if (now) stack(expected.playerStatuses, now, -e.amount)
        stack(expected.playerStatuses, mark!, e.amount)
      }
      else if (e.type === 'overdraft') {
        stack(expected.playerStatuses, 'strength', -e.amount)
        stack(expected.playerStatuses, 'overdraft', e.amount)
      }
      else if (e.type === 'applyStatus') {
        if (e.stacks < 0) {
          // 负层数 = 清除（如泰坦清掉虚弱/易伤）：预期里直接去掉该状态
          const targets = e.to === 'self' ? [expected.playerStatuses] : e.to === 'target' ? [expected.enemyStatuses[0]!] : expected.enemyStatuses
          for (const st of targets) st[e.status] = Math.max(0, (st[e.status] ?? 0) + e.stacks)
          for (const st of targets) if (st[e.status] === 0) delete st[e.status]
        }
        else if (e.to === 'self') {
          stack(expected.playerStatuses, e.status, e.stacks)
          // 临时层数另记一笔 temp: 键，回合结束扣除
          if (e.temp) stack(expected.playerStatuses, 'temp:' + e.status, e.stacks)
        }
        else if (e.to === 'target') stack(expected.enemyStatuses[0]!, e.status, e.stacks)
        else expected.enemyStatuses.forEach((st) => stack(st, e.status, e.stacks))
        if (e.status === 'gash' && e.to !== 'self') gashOn[0]! += e.stacks
        if (e.status === 'gash' && e.to === 'allEnemies') gashOn[1]! += e.stacks
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
