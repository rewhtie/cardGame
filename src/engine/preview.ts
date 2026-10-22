import { attackMods } from './blades'
import { damageBase } from './effects'
import { modifyEffect } from './relics'
import { calcAttack } from './statuses'
import type { BattleState, CardDef, Effect } from './types'

/**
 * 卡面伤害预览：按当前战斗状态把这张牌卡面上每个「造成 N 点伤害」算成最终伤害（单段 / 单层），
 * 与打出时的结算同口径——基数追加（层数 / 伤口 / 本回合攻击数 / 目标格挡…）、遗物改写、
 * 力量 / 剑意 / 易伤 / 虚弱、背水 / 感电 / 活力 / 冰霜、无实体封顶一并算进去。
 *
 * 返回顺序与卡面文字里「造成 N 点伤害」出现的顺序一致：
 * - 带 lowHp 的伤害效果产出两项（正常、低血）；
 * - 寄生吞食、伤口消耗（造成伤害）的卡面写的是「每层 / 每张 N 点」，产出单层 / 单张的最终值；
 * - 按最大生命 / 场上增益总和算的伤害，卡面没有具体数字，不产出。
 * enemyIndex 为空（未瞄准）时，目标相关的加成（目标状态 / 格挡 / 易伤）按无目标处理。
 */
export function previewDamage(s: BattleState, card: CardDef, enemyIndex?: number, x = 0): number[] {
  // 这张牌打出时「本回合攻击数」已含自己
  let ctx: BattleState = card.kind === 'attack' ? { ...s, turnAttacks: (s.turnAttacks ?? 0) + 1 } : s
  const from = { hp: s.player.hp, maxHp: s.player.maxHp, statuses: s.player.statuses }
  // 复制一份：牌里排在伤害前面的「给予目标状态」（如死亡标记先上裂伤）要先叠上去再算伤害
  const tStatuses: Record<string, number> = { ...((enemyIndex === undefined ? undefined : s.enemies[enemyIndex])?.statuses ?? {}) }
  // 目标格挡随效果顺序变化（如长矛先融化格挡再造成伤害），每次算伤害时现读
  const finalOf = (base: number) => {
    const block = (enemyIndex === undefined ? undefined : ctx.enemies[enemyIndex])?.block ?? 0
    const { mods } = attackMods(from, block, tStatuses)
    return calcAttack(base, s.player.statuses, tStatuses, mods)
  }

  const out: number[] = []
  // 衍生效果（每消耗一张牌…）的卡面文字紧跟在这个效果之后，按同样顺序展开
  const visit = (raw: Effect) => {
    const effect = modifyEffect(ctx, card, raw)
    if (effect.type === 'applyStatus' && (effect.to === 'target' || effect.to === 'allEnemies')) {
      tStatuses[effect.status] = (tStatuses[effect.status] ?? 0) + effect.stacks
    } else if (effect.type === 'meltBlock' && enemyIndex !== undefined) {
      ctx = { ...ctx, enemies: ctx.enemies.map((e, i) => (i === enemyIndex ? { ...e, block: 0 } : e)) }
    } else if (effect.type === 'damage') {
      if (effect.buffTotal || effect.maxHpPct) return // 卡面没有具体数字
      out.push(finalOf(damageBase(ctx, effect, enemyIndex ?? -1, x, effect.amount)))
      if (effect.lowHp) out.push(finalOf(damageBase(ctx, effect, enemyIndex ?? -1, x, effect.lowHp.amount)))
    } else if (effect.type === 'devourParasite') {
      out.push(finalOf(effect.per))
    } else if (effect.type === 'exhaustWounds' && (effect.gain === 'damage' || effect.gain === 'damageAll')) {
      out.push(finalOf(effect.per))
    } else if (effect.type === 'exhaustCards') {
      effect.perCard?.forEach(visit)
    }
  }
  card.effects.forEach(visit)
  return out
}
