import { deriveSeed } from './seed'
import type { EnemyDef, Intent, IntentAction } from './types'

/** 第一阶段保留原有种子序列，后续阶段使用独立命名空间。 */
export function stageSeed(seed: string, stage = 1): string {
  return stage === 1 ? seed : String(deriveSeed(seed, `stage:${stage}`))
}

/** 后续大层非原生敌人的强化倍率：生命与攻击/格挡/回血分开算，两者都 ×1.5 时难度叠加过高 */
export const STAGE_HP_SCALE = 1.3
export const STAGE_POWER_SCALE = 1.1

export function stageEnemy(enemy: EnemyDef, stage = 1): EnemyDef {
  if (stage <= 1 || enemy.nativeStage === stage) return enemy
  const scale = (value: number) => Math.min(999, Math.ceil(value * STAGE_POWER_SCALE))
  const hpScale = (value: number) => Math.min(999, Math.ceil(value * STAGE_HP_SCALE))
  const action = (value: IntentAction): IntentAction => {
    switch (value.type) {
      case 'attack':
        return { ...value, damage: scale(value.damage), ...(value.grow !== undefined && { grow: scale(value.grow) }) }
      case 'defend':
        return { ...value, block: scale(value.block) }
      case 'heal':
        return { ...value, amount: scale(value.amount) }
      case 'summon':
        return { ...value, enemy: stageEnemy(value.enemy, stage) }
      default:
        return { ...value }
    }
  }
  const intent = (value: Intent): Intent => ({
    ...action(value),
    ...(value.also && { also: value.also.map(action) }),
  })
  return {
    ...enemy,
    maxHp: hpScale(enemy.maxHp),
    intents: enemy.intents.map(intent),
    ...(enemy.evenTurnActions && { evenTurnActions: enemy.evenTurnActions.map(action) }),
    ...(enemy.hpPhase && { hpPhase: {
      ...enemy.hpPhase,
      intents: enemy.hpPhase.intents.map(intent),
      ...(enemy.hpPhase.evenTurnActions && { evenTurnActions: enemy.hpPhase.evenTurnActions.map(action) }),
    } }),
    ...(enemy.stunPhase && { stunPhase: {
      ...enemy.stunPhase,
      intents: enemy.stunPhase.intents.map(intent),
      ...(enemy.stunPhase.evenTurnActions && { evenTurnActions: enemy.stunPhase.evenTurnActions.map(action) }),
    } }),
    ...(enemy.splitInto && { splitInto: enemy.splitInto.map((def) => stageEnemy(def, stage)) }),
    ...(enemy.splitOnDeath && { splitOnDeath: enemy.splitOnDeath.map((def) => stageEnemy(def, stage)) }),
  }
}
