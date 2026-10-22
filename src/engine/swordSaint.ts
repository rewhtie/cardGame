import { rawId } from './enchant'
import { addStatus, parasiteTotal } from './effects'
import type { BattleState, CardDef, GameEvent } from './types'

export const SWORD_STRIKE_ID = 'swordStrike'
export const SWORD_MANUAL = 'swordManual'

/** 这张牌现在是否免费，以及免费的来源（技能吃剑意，剑击吃剑流；技能优先，一张牌只走一种；诅咒 / 状态牌不吃剑意） */
export function playCost(
  s: BattleState,
  card: CardDef,
): { free: boolean; viaIntent: boolean; viaFlow: boolean } {
  // 参天古树：全场寄生层数够了，免费打出（不消耗剑意 / 剑流）
  if (card.freeIfParasiteTotal !== undefined && parasiteTotal(s) >= card.freeIfParasiteTotal) {
    return { free: true, viaIntent: false, viaFlow: false }
  }
  // 有剑意时免费的牌：不额外消耗剑意（伤害随剑意的牌自己会清空剑意，先扣 1 层会少算一层）
  if (card.freeIfSwordIntent && (s.player.statuses.swordIntent ?? 0) > 0) {
    return { free: true, viaIntent: false, viaFlow: false }
  }
  if (card.kind === 'skill' && card.rarity !== 'status' && card.rarity !== 'curse' && (s.player.statuses.swordIntent ?? 0) > 0) {
    return { free: true, viaIntent: true, viaFlow: false }
  }
  if (rawId(card.id) === SWORD_STRIKE_ID && (s.player.statuses.swordFlow ?? 0) > 0) {
    return { free: true, viaIntent: false, viaFlow: true }
  }
  return { free: false, viaIntent: false, viaFlow: false }
}

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
