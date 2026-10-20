import type { Effect } from './types'

/**
 * 药水的战斗效果：self 饮用（对自己），enemy 投掷（需要指定敌人）。
 * 药水的名称、图标等展示信息在 data/items.ts。
 */
export interface PotionRule {
  target: 'self' | 'enemy'
  effects: Effect[]
}

export const POTION_RULES: Readonly<Record<string, PotionRule>> = {
  healPotion: { target: 'self', effects: [{ type: 'heal', amount: 20 }] },
  firePotion: { target: 'enemy', effects: [{ type: 'damage', amount: 20 }] },
  guardPotion: { target: 'self', effects: [{ type: 'block', amount: 12 }] },
}

/** 战斗外只能使用纯回血药水（不涉及战斗内的 buff、格挡或临时卡牌） */
export function fieldHeal(potionId: string): number | undefined {
  const rule = POTION_RULES[potionId]
  if (!rule || rule.target !== 'self' || !rule.effects.every((e) => e.type === 'heal')) return undefined
  return rule.effects.reduce((sum, e) => sum + (e.type === 'heal' ? e.amount : 0), 0)
}
