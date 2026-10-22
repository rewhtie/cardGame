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
  strengthPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'strength', stacks: 2, to: 'self' }] },
  dexterityPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'dexterity', stacks: 2, to: 'self' }] },
  energyPotion: { target: 'self', effects: [{ type: 'gainEnergy', amount: 2 }] },
  swiftPotion: { target: 'self', effects: [{ type: 'draw', count: 3 }] },
  flexPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'strength', stacks: 5, to: 'self', temp: true }] },
  speedPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'dexterity', stacks: 5, to: 'self', temp: true }] },
  regenPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'regen', stacks: 5, to: 'self' }] },
  weakPotion: { target: 'enemy', effects: [{ type: 'applyStatus', status: 'weak', stacks: 3, to: 'target' }] },
  fearPotion: { target: 'enemy', effects: [{ type: 'applyStatus', status: 'vulnerable', stacks: 3, to: 'target' }] },
  poisonPotion: { target: 'enemy', effects: [{ type: 'applyStatus', status: 'poison', stacks: 6, to: 'target' }] },
  bronzePotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'thorns', stacks: 3, to: 'self' }] },
  steelPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'metallicize', stacks: 4, to: 'self' }] },
  ghostPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'incorporeal', stacks: 1, to: 'self' }] },
  gamblerPotion: { target: 'self', effects: [{ type: 'redraw', extra: 0 }] },
  memoryPotion: { target: 'self', effects: [{ type: 'fetch', from: 'discard', count: 1 }] },
  fortressPotion: { target: 'self', effects: [{ type: 'block', amount: 25 }] },
  elixirPotion: { target: 'self', effects: [{ type: 'heal', amount: 40 }] },
  thunderPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'shock', stacks: 2, to: 'self' }] },
  weakAllPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'weak', stacks: 2, to: 'allEnemies' }] },
  fearAllPotion: { target: 'self', effects: [{ type: 'applyStatus', status: 'vulnerable', stacks: 2, to: 'allEnemies' }] },
}

/** 战斗外只能使用纯回血药水（不涉及战斗内的 buff、格挡或临时卡牌） */
export function fieldHeal(potionId: string): number | undefined {
  const rule = POTION_RULES[potionId]
  if (!rule || rule.target !== 'self' || !rule.effects.every((e) => e.type === 'heal')) return undefined
  return rule.effects.reduce((sum, e) => sum + (e.type === 'heal' ? e.amount : 0), 0)
}
