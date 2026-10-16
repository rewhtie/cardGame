import type { EnemyDef } from '@/engine/types'

export const slime: EnemyDef = {
  id: 'slime',
  name: '史莱姆',
  maxHp: 40,
  intents: [
    { type: 'attack', damage: 8 },
    { type: 'defend', block: 6 },
    { type: 'attack', damage: 12 },
  ],
}

export const sporeSlime: EnemyDef = {
  id: 'spore-slime',
  name: '孢子史莱姆',
  maxHp: 40,
  intents: [
    { type: 'debuff', status: 'weak', stacks: 1 },
    { type: 'attack', damage: 8 },
    { type: 'defend', block: 6 },
  ],
}

/** 三只史莱姆：意图循环错开起点，避免同一回合全部打出最高伤害 */
export const slimeGroup: EnemyDef[] = [
  { ...slime, id: 'slime-1' },
  { ...slime, id: 'slime-2', intents: rotate(slime.intents, 1) },
  { ...sporeSlime, id: 'slime-3' },
]

function rotate<T>(list: T[], by: number): T[] {
  return [...list.slice(by), ...list.slice(0, by)]
}
