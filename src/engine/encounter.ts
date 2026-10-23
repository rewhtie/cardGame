import { FLOORS } from './map'
import type { Rng } from './seed'
import type { EncounterDef, EnemyDef } from './types'

/** 第 1 层与最后一个战斗层的威胁预算，中间线性插值；整体调难度只改这两个数 */
const BUDGET_FIRST = 2
const BUDGET_LAST = 6
/** 首只怪的威胁值落在 [预算 - WINDOW, 预算]，避免后期还只出最弱的怪 */
const WINDOW = 1.5
const MAX_UNITS = 3
/** 楼层命中固定遭遇时，直接出固定组合的概率；其余仍按预算组怪 */
const FIXED_CHANCE = 0.5

/** 机制互相放大、同场战损过高的怪，按预算组怪时不会凑在一起（固定遭遇不受限） */
const EXCLUSIVE: readonly (readonly [string, string])[] = [
  ['summoner', 'goblin'],
  ['summoner', 'split-slime'],
]
const clashes = (a: EnemyDef, b: EnemyDef) => EXCLUSIVE.some(([x, y]) => (a.id === x && b.id === y) || (a.id === y && b.id === x))

export const floorBudget =(floor: number) => {
  const t = Math.min(1, Math.max(0, (floor - 1) / (FLOORS - 3)))
  return BUDGET_FIRST + (BUDGET_LAST - BUDGET_FIRST) * t
}

/**
 * 普通战斗按楼层组怪：先抽一只接近预算的主怪，剩余预算再补小怪（同种不重复）。
 * 越往上预算越大，主怪更强、能凑出多只组合；怪本身的意图与数值不变。
 */
export function pickEncounter(
  pool: readonly EnemyDef[],
  floor: number,
  fixed: readonly EncounterDef[],
  rng: Rng,
): EnemyDef[] {
  const here = fixed.filter((c) => floor >= c.minFloor && floor <= c.maxFloor)
  if (here.length > 0 && rng.float() < FIXED_CHANCE) return [...(here[rng.int(here.length)] as EncounterDef).enemies]
  const budget = floorBudget(floor)
  const threat = (e: EnemyDef) => e.threat ?? Infinity
  const affordable = pool.filter((e) => threat(e) <= budget)
  if (affordable.length === 0) return pool.length ? [pool[rng.int(pool.length)] as EnemyDef] : []

  const near = affordable.filter((e) => threat(e) >= budget - WINDOW)
  const mains = near.length > 0 ? near : affordable
  const picked = [mains[rng.int(mains.length)] as EnemyDef]

  let left = budget - threat(picked[0] as EnemyDef)
  while (picked.length < MAX_UNITS) {
    const fill = affordable.filter((e) => threat(e) <= left && !picked.includes(e) && !picked.some((p) => clashes(p, e)))
    if (fill.length === 0) break
    const e = fill[rng.int(fill.length)] as EnemyDef
    picked.push(e)
    left -= threat(e)
  }
  return picked
}
