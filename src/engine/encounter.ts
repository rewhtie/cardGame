import { FLOORS } from './map'
import type { Rng } from './seed'
import type { EncounterDef, EnemyDef } from './types'

/** 第 1 层与最后一个战斗层的威胁预算，中间线性插值；整体调难度只改这两个数 */
const BUDGET_FIRST = 2
const BUDGET_LAST = 5
/** 首只怪的威胁值落在 [预算 - WINDOW, 预算]，避免后期还只出最弱的怪 */
const WINDOW = 1.5
const MAX_UNITS = 2
/** 这一层之前普通战斗只出单只怪：前中期卡组还没成型，处理不了组合 */
const COMBO_FROM_FLOOR = 9
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
 * seen 为本条路线已出现过的怪：还有没见过的怪（或成员都没见过的固定遭遇）时，只从它们里抽单只 / 整组，
 * 全部见过之后才允许重复与随机组合。
 */
export function pickEncounter(
  pool: readonly EnemyDef[],
  floor: number,
  fixed: readonly EncounterDef[],
  rng: Rng,
  seen: ReadonlySet<string> = new Set(),
): EnemyDef[] {
  const here = fixed.filter((c) => floor >= c.minFloor && floor <= c.maxFloor)
  const budget = floorBudget(floor)
  const threat = (e: EnemyDef) => e.threat ?? Infinity
  const freshFixed = here.filter((c) => c.enemies.every((e) => !seen.has(e.id)))
  const freshSingles = pool.filter((e) => threat(e) <= budget && !seen.has(e.id))
  if (freshFixed.length > 0) {
    const fixedPick = freshFixed[rng.int(freshFixed.length)] as EncounterDef
    if (freshSingles.length === 0 || rng.float() < (fixedPick.chance ?? FIXED_CHANCE)) return [...fixedPick.enemies]
  }
  if (freshSingles.length > 0) {
    const near = freshSingles.filter((e) => threat(e) >= budget - WINDOW)
    const mains = near.length > 0 ? near : freshSingles
    return [mains[rng.int(mains.length)] as EnemyDef]
  }
  if (here.length > 0) {
    const fixedPick = here[rng.int(here.length)] as EncounterDef
    if (rng.float() < (fixedPick.chance ?? FIXED_CHANCE)) return [...fixedPick.enemies]
  }
  const affordable = pool.filter((e) => threat(e) <= budget)
  if (affordable.length === 0) return pool.length ? [pool[rng.int(pool.length)] as EnemyDef] : []

  const near = affordable.filter((e) => threat(e) >= budget - WINDOW)
  const mains = near.length > 0 ? near : affordable
  const picked = [mains[rng.int(mains.length)] as EnemyDef]

  let left = budget - threat(picked[0] as EnemyDef)
  const maxUnits = floor >= COMBO_FROM_FLOOR && !picked[0]!.solo ? MAX_UNITS : 1
  while (picked.length < maxUnits) {
    const fill = affordable.filter((e) => threat(e) <= left && !e.solo && !picked.includes(e) && !picked.some((p) => clashes(p, e)))
    if (fill.length === 0) break
    const e = fill[rng.int(fill.length)] as EnemyDef
    picked.push(e)
    left -= threat(e)
  }
  return picked
}
