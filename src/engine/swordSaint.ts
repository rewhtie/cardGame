import { rawId } from './enchant'
import { addStatus, parasiteTotal } from './effects'
import type { BattleState, CardDef, GameEvent } from './types'

export const SWORD_STRIKE_ID = 'swordStrike'
export const SWORD_MANUAL = 'swordManual'

/**
 * 这张牌现在是否免费，以及免费的来源。所有适用于这张牌的来源同时生效、同时各消耗 1 层：
 * 类型 / 虚无的免费状态、剑意（技能牌）、剑流（剑击）。诅咒 / 状态牌不吃这些。
 * 牌自带的免费条件（参天古树、有剑意时免费）让牌免费，此时不消耗任何来源。
 */
export function playCost(
  s: BattleState,
  card: CardDef,
): { free: boolean; viaIntent: boolean; viaFlow: boolean; viaStatuses: string[] } {
  const has = (id: string) => (s.player.statuses[id] ?? 0) > 0
  const plain = card.rarity !== 'status' && card.rarity !== 'curse'
  const viaStatuses = plain && card.cost !== 0 ? freeStatusesFor(card).filter(has) : []
  const native =
    (card.freeIfParasiteTotal !== undefined && parasiteTotal(s) >= card.freeIfParasiteTotal) ||
    (!!card.freeIfSwordIntent && has('swordIntent'))
  // 牌自带条件免费时什么都不额外消耗（伤害随剑意的牌自己会清空剑意，先扣 1 层会少算一层）
  if (native) return { free: true, viaIntent: false, viaFlow: false, viaStatuses: [] }
  const viaIntent = card.kind === 'skill' && plain && has('swordIntent')
  const viaFlow = rawId(card.id) === SWORD_STRIKE_ID && has('swordFlow')
  return {
    free: viaStatuses.length > 0 || viaIntent || viaFlow,
    viaIntent,
    viaFlow,
    viaStatuses,
  }
}

const FREE_BY_KIND = { attack: 'freeAttack', skill: 'freeSkill', power: 'freePower' } as const

/** 这张牌可以吃哪些"下一张免费"状态（类型 + 虚无，适用的都吃） */
const freeStatusesFor = (card: CardDef): string[] => [
  FREE_BY_KIND[card.kind],
  ...(card.ethereal ? ['freeEthereal'] : []),
]

/** 界面显示用的费用：免费时为 0 */
export function displayCost(s: BattleState, card: CardDef): number | 'X' {
  return playCost(s, card).free ? 0 : card.cost
}

/**
 * 出牌结算后：付费打出的剑击给玩家 1 层剑流（最多 1 层）。
 * 剑谱：剑击不论是否免费都给 1 层，且不受 1 层上限限制，剑流因此永不断档（免费那张只消耗 1 层，见 battle.ts）。
 */
export function afterPlay(
  s: BattleState,
  card: CardDef,
  paid: { viaFlow: boolean },
  events: GameEvent[],
) {
  if (rawId(card.id) !== SWORD_STRIKE_ID) return
  if (!s.relics.includes(SWORD_MANUAL)) {
    if (paid.viaFlow) return
    if ((s.player.statuses.swordFlow ?? 0) >= 1) return
  }
  addStatus(s, 'player', 0, 'swordFlow', 1, events)
}
