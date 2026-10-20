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

export const cockroach: EnemyDef = {
  id: 'cockroach',
  name: '蟑螂',
  icon: '🪳',
  maxHp: 40,
  startStatuses: { damageCap: 9 },
  intents: [
    { type: 'attack', damage: 6 },
    { type: 'defend', block: 8 },
    { type: 'attack', damage: 10 },
  ],
}

export const hive: EnemyDef = {
  id: 'hive',
  name: '蜂巢',
  icon: '🐝',
  maxHp: 36,
  startStatuses: { hive: 1 },
  intents: [
    { type: 'attack', damage: 7 },
    { type: 'debuff', status: 'weak', stacks: 1 },
    { type: 'attack', damage: 9 },
  ],
}

export const smallSlime: EnemyDef = {
  id: 'small-slime',
  name: '小史莱姆',
  maxHp: 20,
  intents: [
    { type: 'attack', damage: 5 },
    { type: 'defend', block: 4 },
  ],
}

export const splitSlime: EnemyDef = {
  id: 'split-slime',
  name: '分裂史莱姆',
  maxHp: 40,
  startStatuses: { split: 1 },
  splitInto: [smallSlime, smallSlime],
  intents: slime.intents,
}

export const summoner: EnemyDef = {
  id: 'summoner',
  name: '召唤师',
  icon: '🧙',
  maxHp: 50,
  intents: [
    { type: 'attack', damage: 6 },
    { type: 'summon', enemy: smallSlime },
    { type: 'defend', block: 8 },
  ],
}

export const goblin: EnemyDef = {
  id: 'goblin',
  name: '哥布林',
  icon: '👺',
  maxHp: 30,
  intents: [
    { type: 'attack', damage: 5 },
    { type: 'steal', amount: 15 },
    { type: 'flee' },
  ],
}

export const beetle: EnemyDef = {
  id: 'beetle',
  name: '甲壳虫',
  icon: '🪲',
  maxHp: 45,
  startStatuses: { carapace: 1 },
  intents: [
    { type: 'defend', block: 6 },
    { type: 'attack', damage: 11 },
    { type: 'attack', damage: 7 },
  ],
}

const slimed = { cardId: 'slimed', count: 1 }

export const mediumSpikeSlime: EnemyDef = {
  id: 'medium-spike-slime',
  name: '中尖刺史莱姆',
  maxHp: 32,
  intents: [
    { type: 'attack', damage: 8, addCards: slimed },
    { type: 'debuff', status: 'frail', stacks: 1 },
  ],
}

export const mediumAcidSlime: EnemyDef = {
  id: 'medium-acid-slime',
  name: '中酸液史莱姆',
  maxHp: 34,
  intents: [
    { type: 'attack', damage: 7, addCards: slimed },
    { type: 'attack', damage: 10 },
    { type: 'debuff', status: 'weak', stacks: 1 },
  ],
}

export const largeSpikeSlime: EnemyDef = {
  id: 'large-spike-slime',
  name: '大尖刺史莱姆',
  maxHp: 64,
  startStatuses: { split: 1 },
  splitInto: [mediumSpikeSlime, mediumSpikeSlime],
  intents: [
    { type: 'attack', damage: 16, addCards: { cardId: 'slimed', count: 2 } },
    { type: 'debuff', status: 'frail', stacks: 2 },
  ],
}

export const largeAcidSlime: EnemyDef = {
  id: 'large-acid-slime',
  name: '大酸液史莱姆',
  maxHp: 68,
  startStatuses: { split: 1 },
  splitInto: [mediumAcidSlime, mediumAcidSlime],
  intents: [
    { type: 'attack', damage: 11, addCards: { cardId: 'slimed', count: 2 } },
    { type: 'attack', damage: 16 },
    { type: 'debuff', status: 'weak', stacks: 2 },
  ],
}

/** Boss：血量过半当场分裂成大尖刺 + 大酸液 */
export const slimeBoss: EnemyDef = {
  id: 'slime-boss',
  name: '史莱姆老大',
  maxHp: 140,
  startStatuses: { split: 1 },
  splitInto: [largeSpikeSlime, largeAcidSlime],
  intents: [
    { type: 'addCards', cardId: 'slimed', count: 3 },
    { type: 'idle' },
    { type: 'attack', damage: 35 },
  ],
}

/** 普通战斗节点的机制怪池 */
export const monsterPool: EnemyDef[] = [cockroach, hive, splitSlime, summoner, goblin, beetle]

function rotate<T>(list: T[], by: number): T[] {
  return [...list.slice(by), ...list.slice(0, by)]
}
