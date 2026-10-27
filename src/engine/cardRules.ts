import type { BattleState, CardDef } from './types'
import { STATUSES } from './statuses'

export function cardTypePlayBlock(state: BattleState, card: CardDef): string | undefined {
  for (const status of STATUSES) {
    const limit = status.cardPlayLimit
    if (!limit || limit.kind !== card.kind || (state.player.statuses[status.id] ?? 0) <= 0) continue
    const played = limit.kind === 'attack' ? (state.turnAttacks ?? 0) : (state.turnSkills ?? 0)
    if (played >= limit.max) return `${status.name}：本回合最多打出 ${limit.max} 张${limit.kind === 'attack' ? '攻击' : '技能'}牌`
  }
  return undefined
}

export function cardPlayBlock(state: BattleState, card: CardDef): string | undefined {
  return priorityPlayBlock(state, card) ?? cardTypePlayBlock(state, card)
}

export function priorityPlayBlock(state: BattleState, card: CardDef): string | undefined {
  if (card.mustPlayFirst) return undefined
  const first = state.hand.map((id) => state.cards[id]).find((c) => c?.mustPlayFirst)
  return first ? `请先打出手牌中的${first.name}` : undefined
}
