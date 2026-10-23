import type { EnemyDef } from '@/engine/types'
import raw from './enemies.json'
import { buildEnemies, type EnemyData } from './enemySpec'

/**
 * 敌人数据在 enemies.json 里，开发模式下由敌人编辑器维护（意图循环、数值、定位、固定遭遇）。
 * 这里只负责把数据表构建成引擎用的 EnemyDef，并保持原有的导出名不变。
 */
const built = buildEnemies(raw as EnemyData)
const get = (id: string) => built.byId[id] as EnemyDef

export const slime = get('slime')
export const sporeSlime = get('spore-slime')
export const smallSlime = get('small-slime')
export const cockroach = get('cockroach')
export const hive = get('hive')
export const splitSlime = get('split-slime')
export const summoner = get('summoner')
export const goblin = get('goblin')
export const beetle = get('beetle')
export const mediumSpikeSlime = get('medium-spike-slime')
export const mediumAcidSlime = get('medium-acid-slime')
export const largeSpikeSlime = get('large-spike-slime')
export const largeAcidSlime = get('large-acid-slime')
export const slimeBoss = get('slime-boss')
export const ghost = get('ghost')
export const drainer = get('drainer')
export const statue = get('statue')

function rotate<T>(list: T[], by: number): T[] {
  return [...list.slice(by), ...list.slice(0, by)]
}

/** 三只史莱姆：意图循环错开起点，避免同一回合全部打出最高伤害 */
export const slimeGroup: EnemyDef[] = [
  { ...slime, id: 'slime-1' },
  { ...slime, id: 'slime-2', intents: rotate(slime.intents, 1) },
  { ...sporeSlime, id: 'slime-3' },
]

/** 普通战斗的怪池（定位为 monster 的敌人）：按各自 threat 与楼层预算组怪，见 engine/encounter */
export const monsterPool: EnemyDef[] = built.pool('monster')

/** 固定遭遇（组合怪）：楼层命中时按概率优先于预算组怪 */
export const encounterList = built.encounters

/** 开发作弊用：全部敌人（含精英 / Boss / 附属）及其定位 */
export const enemyCatalog = (raw as EnemyData).enemies.map((s) => ({ def: built.byId[s.id] as EnemyDef, role: s.role }))
