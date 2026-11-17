import type { EnemyState, Intent } from './types'
import { STATUSES } from './statuses'

export function lifeShareTarget(enemy: EnemyState, enemies: readonly EnemyState[]): EnemyState | undefined {
  return enemies.filter((e) => e !== enemy && e.hp > 0 && !e.fled)
    .sort((a, b) => Math.abs(b.hp - enemy.hp) - Math.abs(a.hp - enemy.hp))[0]
}

export function priorityLifeShare(enemy: EnemyState, enemies: readonly EnemyState[]): boolean {
  const target = lifeShareTarget(enemy, enemies)
  return !!target && STATUSES.some((s) => s.priorityLifeShare !== undefined &&
    (enemy.statuses[s.id] ?? 0) > 0 && Math.abs(target.hp - enemy.hp) >= s.priorityLifeShare)
}

export function revivalTarget(enemy: EnemyState, enemies: readonly EnemyState[]): EnemyState | undefined {
  const rule = enemy.def.revival
  if (!rule || !enemy.def.family || (enemy.revivesUsed ?? 0) >= rule.limit) return undefined
  return enemies.filter((e) => e !== enemy && e.hp <= 0 && !e.fled && !e.pendingExplosion &&
    !e.vanishOnDeath && e.deathHandled && e.def.family === enemy.def.family && !e.def.revival)
    .sort((a, b) => (a.deathOrder ?? 0) - (b.deathOrder ?? 0))[0]
}

/** 相邻队友：右侧最近的存活队友优先，没有则取左侧最近的 */
export function adjacentAlly(enemies: readonly EnemyState[], index: number): number {
  for (let i = index + 1; i < enemies.length; i++) if (enemies[i]!.hp > 0 && !enemies[i]!.fled) return i
  for (let i = index - 1; i >= 0; i--) if (enemies[i]!.hp > 0 && !enemies[i]!.fled) return i
  return -1
}

/** 合体：死亡分裂出的分身里已有同伴阵亡，存活的分身改为合体意图；返回本体复活比例（基础 + 每只存活分身加成），不合体时为 undefined */
export function regroupRatio(enemy: EnemyState, enemies: readonly EnemyState[]): number | undefined {
  const parent = enemy.splitParent
  const rule = parent === undefined ? undefined : enemies[parent]?.def.regroup
  if (!rule) return undefined
  const kids = enemies.filter((e) => e.splitParent === parent && !e.fled)
  const living = kids.filter((e) => e.hp > 0).length
  if (living === kids.length) return undefined
  // 取整到百分位，避免 0.2 + 4×0.1 这类浮点误差让向上取整多出 1 点生命
  return Math.min(1, Math.round((rule.hpRatio + living * (rule.perClone ?? 0)) * 100) / 100)
}

export function currentIntent(enemy: EnemyState, enemies: readonly EnemyState[] = []): Intent | undefined {
  if (enemy.pendingExplosion) return { type: 'explode', damage: enemy.pendingExplosion.damage }
  const ratio = enemy.hp > 0 ? regroupRatio(enemy, enemies) : undefined
  if (ratio !== undefined) return { type: 'regroup', ratio }
  if (enemy.hp > 0 && revivalTarget(enemy, enemies)) return { type: 'revive' }
  if (priorityLifeShare(enemy, enemies)) return { type: 'shareLife' }
  const intent = enemy.def.intents[enemy.intentIndex]
  if (!intent) return undefined
  const extra = [
    ...((enemy.turns ?? 0) % 2 === 1 ? enemy.def.evenTurnActions ?? [] : []),
    ...(enemy.strikePending && enemy.def.deathStrike !== undefined
      ? [{ type: 'deathStrike' as const, damage: enemy.def.deathStrike }]
      : []),
  ]
  return extra.length ? { ...intent, also: [...(intent.also ?? []), ...extra] } : intent
}

/** 只看意图的类型与递增量，EnemyDef 与编辑器的 EnemySpec 都满足 */
interface Looping {
  intents: { type: string; grow?: number }[]
  loopFrom?: number
}

/** 敌人已行动 turns 次后，下一次要用的意图下标：走到末尾回到 loopFrom（缺省 0） */
export function intentIndexAt(def: Looping, turns: number): number {
  const n = def.intents.length
  if (n === 0) return 0
  if (turns < n) return Math.max(0, turns)
  const from = Math.min(def.loopFrom ?? 0, n - 1)
  return from + ((turns - from) % (n - from))
}

/** 已行动 turns 次后，攻击意图累计的额外伤害（每次攻击后按 grow 递增） */
export function attackBonusAt(def: Looping, turns: number): number {
  let bonus = 0
  for (let k = 0; k < turns; k++) {
    const it = def.intents[intentIndexAt(def, k)]
    if (it?.type === 'attack') bonus += it.grow ?? 0
  }
  return bonus
}
