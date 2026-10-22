import { calcAttack, type Mod, type Statuses } from './statuses'
import type { BattleState, CardDef, EnemyState } from './types'

/** 背水：持有者（玩家或敌人）生命不高于 30% 时，攻击伤害 +50%×N。加成跟着状态走，谁带着谁吃 */
export function lastStandMods(hp: number, maxHp: number, statuses: Statuses): Mod[] {
  const n = statuses.lastStand ?? 0
  return n > 0 && hp * 10 <= maxHp * 3 ? [{ mul: 1 + 0.5 * n, round: true }] : []
}

/** 出手一方（玩家或敌人）的生命与状态；加成只看这些，跟谁是谁无关 */
export interface Attacker {
  hp: number
  maxHp: number
  statuses: Statuses
}
export const attackerOf = (e: EnemyState): Attacker => ({
  hp: e.hp,
  maxHp: e.maxHpOverride ?? e.def.maxHp,
  statuses: e.statuses,
})

/**
 * 出手方攻击时，需要读生命 / 目标格挡才能算的额外修正（玩家、敌人通用，增益跟着状态走）：
 * 背水（出手方血量不高于 30%）、活力（下一次攻击 +N）、感电（下一次伤害攻击）、冰霜（目标受伤 +5%×N；有格挡时 +10%×N 并穿甲）。
 * 增伤一律四舍五入。
 */
export function attackMods(
  from: Attacker,
  targetBlock: number,
  targetStatuses: Statuses,
): { mods: Mod[]; pierce: boolean } {
  const mods: Mod[] = []
  mods.push(...lastStandMods(from.hp, from.maxHp, from.statuses))
  const shock = from.statuses.shock ?? 0
  if (shock > 0) mods.push({ mul: 1 + 0.5 * shock, round: true })
  const vigor = from.statuses.vigor ?? 0
  if (vigor > 0) mods.push({ add: vigor })
  const frost = targetStatuses.frost ?? 0
  const pierce = frost > 0 && targetBlock > 0
  // 冰霜：任何时候受到伤害 +5%×N；目标有格挡时翻倍到 +10%×N，并且穿透格挡
  if (frost > 0) mods.push({ mul: 1 + (pierce ? 0.1 : 0.05) * frost, round: true })
  return { mods, pierce }
}

/** 敌人本次攻击意图的实际伤害与是否穿透格挡（含自身全部状态加成），行动结算、意图预览共用 */
export function enemyAttack(base: number, enemy: EnemyState, player: { block: number; statuses: Statuses }) {
  const { mods, pierce } = attackMods(attackerOf(enemy), player.block, player.statuses)
  return { damage: calcAttack(base, enemy.statuses, player.statuses, mods), pierce }
}

/** 本回合已打出的攻击牌数（含正在打的这一张） */
export const attacksThisTurn = (s: BattleState) => s.turnAttacks ?? 0

/** 这张牌是否含伤害效果（感电只被伤害牌消耗） */
export const hasDamage = (card: CardDef) => card.effects.some((e) => e.type === 'damage')
