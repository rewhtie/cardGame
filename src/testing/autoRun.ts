import { cards } from '@/data/cards'
import { slimeGroup } from '@/data/enemies'
import { potions as potionDefs, relics as relicDefs } from '@/data/items'
import { createBattle, dispatch } from '@/engine/battle'
import { statusById } from '@/engine/statuses'
import type { Action, BattleState, EnemyDef, GameEvent } from '@/engine/types'
import { effectSnapshot, smokeCheck } from './cardHarness'

export const DEFAULT_TEST_TURNS = 3
/** 被测牌在牌组里的张数，其余用打击/防御补满 */
const TEST_COPIES = 3
const FILLER_STRIKES = 3
const FILLER_DEFENDS = 3
const FILLERS = ['defend', 'strike']
/** 每回合最多出牌数：0 费抽牌的牌会自我循环，必须封顶 */
const MAX_PLAYS_PER_TURN = 20

export interface AutoRunOptions {
  turns?: number
  seed?: number
  enemies?: EnemyDef[]
}

/** 轨迹上的一步：执行完某个动作后的状态 */
export interface TraceStep {
  turn: number
  label: string
  state: BattleState
  /** 这一步产生的事件，已翻译成日志文字 */
  lines: string[]
  /** 原始引擎事件，回放时用来驱动战斗动画 */
  events: GameEvent[]
}

export interface Trace {
  cardId: string
  turns: number
  steps: TraceStep[]
  /** 被测牌实际打出的次数 */
  played: number
  /** 自动校验发现的问题，空数组表示通过 */
  problems: string[]
}

const nameOf = (state: BattleState, id: string) => state.cards[id]?.name ?? id
const statusName = (id: string) => statusById[id]?.name ?? id
const who = (state: BattleState, side: 'player' | 'enemy', i?: number) =>
  side === 'player'
    ? '玩家'
    : (state.enemies[i ?? 0]?.def.name ?? '敌人') + (i === undefined ? '' : `#${i + 1}`)

/** 把引擎事件翻译成一行日志；不值得展示的事件返回 null */
export function describeEvent(state: BattleState, e: GameEvent): string | null {
  switch (e.type) {
    case 'cardPlayed':
    case 'handDiscarded':
      return null
    case 'damageDealt':
      return `${who(state, e.target, e.enemyIndex)} 受到 ${e.amount} 点伤害${e.blocked ? `（格挡 ${e.blocked}）` : ''}`
    case 'blockGained':
      return `${who(state, e.target, e.enemyIndex)} 获得 ${e.amount} 点格挡`
    case 'cardDrawn':
      return `抽到 ${nameOf(state, e.cardId)}`
    case 'reshuffled':
      return '弃牌堆洗回抽牌堆'
    case 'energyGained':
      return `获得 ${e.amount} 点能量`
    case 'perfectBlock':
      return '完美格挡'
    case 'statusApplied':
      return `${who(state, e.target, e.enemyIndex)} 获得 ${e.stacks} 层${statusName(e.status)}`
    case 'statusRemoved':
      return `${who(state, e.target, e.enemyIndex)} 的${statusName(e.status)}消失`
    case 'healed':
      return `${who(state, e.target, e.enemyIndex)} 恢复 ${e.amount} 点生命`
    case 'statusTriggered':
      return `${who(state, e.target, e.enemyIndex)} 的${statusName(e.status)}触发`
    case 'cardEnchantGrew':
      return `${nameOf(state, e.cardId)} 附魔成长`
    case 'turnStarted':
      return `—— 第 ${e.turn} 回合开始 ——`
    case 'enemyActed': {
      const i = e.intent
      const detail =
        i.type === 'attack'
          ? `攻击 ${i.damage}`
          : i.type === 'defend'
            ? `防御 ${i.block}`
            : i.type === 'debuff' || i.type === 'buff'
              ? `${i.type === 'debuff' ? '给玩家' : '给自己'} ${i.stacks} 层${statusName(i.status)}`
              : { addCards: '塞牌', idle: '蓄力', summon: '召唤', steal: '偷金币', flee: '逃跑' }[i.type]
      return `${who(state, 'enemy', e.enemyIndex)} ${detail}`
    }
    case 'battleEnded':
      return e.result === 'won' ? '战斗胜利' : '战斗失败'
    case 'relicGained':
      return `获得遗物 ${relicDefs[e.id]?.name ?? e.id}${e.heal ? `（回复 ${e.heal} 点生命）` : ''}`
    case 'cardsUpgraded':
      return `升级了 ${e.cards.length} 张牌`
    case 'potionUsed':
      return `使用药水 ${potionDefs[e.potionId]?.name ?? e.potionId}`
    case 'invalidAction':
      return `⚠ 非法操作：${e.reason}`
    default:
      // 新增事件类型若还没有对应的日志文案，就不展示，免得漏掉分支
      return null
  }
}

/** 与 cardHarness 的校验保持一致：冒烟 + 按定义推算的效果快照 */
export function verifyCard(cardId: string): string[] {
  if (!cards[cardId]) return [`未知卡牌 ${cardId}`]
  const problems = smokeCheck(cardId)
  const { actual, expected } = effectSnapshot(cardId)
  if (JSON.stringify(sortKeys(actual)) !== JSON.stringify(sortKeys(expected)))
    problems.push(
      `效果与定义不符：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`,
    )
  return problems
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sortKeys(x)]),
    )
  return v
}

/** 保证被测牌在手里：不在的话从抽牌堆（其次弃牌堆）换一张进来，换掉一张填充牌 */
function ensureInHand(state: BattleState, cardId: string): BattleState {
  if (state.hand.includes(cardId)) return state
  const pile = state.drawPile.includes(cardId) ? 'drawPile' : 'discardPile'
  const from = state[pile].indexOf(cardId)
  if (from < 0) return state
  const s: BattleState = {
    ...state,
    hand: [...state.hand],
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
  }
  const outIndex = s.hand.findIndex((id) => FILLERS.includes(id))
  const swapped = outIndex >= 0 ? s.hand.splice(outIndex, 1, cardId)[0]! : undefined
  s[pile].splice(from, 1)
  if (swapped) s[pile].push(swapped)
  else s.hand.push(cardId)
  return s
}

/**
 * 自动跑一遍：每回合先打出手里所有被测牌，再用防御/打击把剩余能量花掉，然后结束回合。
 * X 费牌排在最前，保证它拿到满能量。整个过程同步完成，界面只回放结果。
 */
export function traceCard(cardId: string, opts: AutoRunOptions = {}): Trace {
  const def = cards[cardId]
  if (!def) throw new Error(`未知卡牌 ${cardId}`)
  const turns = opts.turns ?? DEFAULT_TEST_TURNS
  const deck = [
    ...Array<string>(TEST_COPIES).fill(cardId),
    ...Array<string>(FILLER_STRIKES).fill('strike'),
    ...Array<string>(FILLER_DEFENDS).fill('defend'),
  ]
  const created = createBattle({
    seed: opts.seed ?? 1,
    deck,
    enemies: opts.enemies ?? slimeGroup,
    cards,
  })
  let state = created.state
  const steps: TraceStep[] = []
  let played = 0

  const record = (label: string, next: BattleState, events: GameEvent[], from: BattleState) => {
    const lines = events.flatMap((e) => describeEvent(from, e) ?? [])
    steps.push({ turn: next.turn, label, state: next, lines, events })
  }
  const act = (label: string, action: Action) => {
    const from = state
    const result = dispatch(state, action)
    state = result.state
    record(label, state, result.events, from)
  }

  record('战斗开始', state, created.events, state)
  const playable = (id: string) => {
    const c = state.cards[id]
    return !!c && !c.unplayable && (c.cost === 'X' || c.cost <= state.player.energy)
  }
  const playFirst = (id: string) => {
    const handIndex = state.hand.indexOf(id)
    if (handIndex < 0 || !playable(id) || state.phase !== 'player') return false
    act(`打出 ${nameOf(state, id)}`, { type: 'playCard', handIndex })
    return true
  }

  for (let t = 1; t <= turns && state.phase === 'player'; t++) {
    const ensured = ensureInHand(state, cardId)
    if (ensured !== state) {
      state = ensured
      record(`第 ${t} 回合：把被测牌换进手牌`, state, [], state)
    }
    let plays = 0
    while (plays < MAX_PLAYS_PER_TURN && playFirst(cardId)) {
      played++
      plays++
    }
    for (const filler of FILLERS) {
      while (plays < MAX_PLAYS_PER_TURN && playFirst(filler)) plays++
    }
    if (state.phase === 'player') act(`第 ${t} 回合：结束回合`, { type: 'endTurn' })
  }

  return { cardId, turns, steps, played, problems: verifyCard(cardId) }
}
