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
