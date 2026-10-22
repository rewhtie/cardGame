import type { EncounterDef, EnemyDef, IntentAction } from '../engine/types'

/** 敌人定位：monster 进普通战斗池；elite / boss 对应精英、Boss 节点；other 只作为分裂 / 召唤的附属或测试用 */
export const ROLES = ['monster', 'elite', 'boss', 'other'] as const
export type EnemyRole = (typeof ROLES)[number]

/** 与引擎的 Intent 相同，只是 summon 里的敌人改为按 id 引用，方便存成 JSON */
export type ActionSpec = Exclude<IntentAction, { type: 'summon' }> | { type: 'summon'; enemy: string }
export type IntentSpec = ActionSpec & { also?: ActionSpec[] }

export interface EnemySpec {
  id: string
  name: string
  icon?: string
  role: EnemyRole
  /** 威胁值：仅 monster 有意义，普通战斗按楼层预算组怪时用 */
  threat?: number
  maxHp: number
  startStatuses?: Record<string, number>
  intents: IntentSpec[]
  /** 意图走到末尾后回到第几个（缺省 0，整体循环） */
  loopFrom?: number
  /** 分裂出的敌人 id，按顺序追加 */
  splitInto?: string[]
}

/** 固定遭遇：指定楼层范围内，普通战斗有一定概率直接出这一组 */
export interface EncounterSpec {
  id: string
  name: string
  enemies: string[]
  minFloor: number
  maxFloor: number
}

export interface EnemyData {
  enemies: EnemySpec[]
  encounters: EncounterSpec[]
}

const INTENT_TYPES = ['attack', 'defend', 'debuff', 'buff', 'addCards', 'idle', 'summon', 'steal', 'flee']
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** 校验整份数据；返回错误列表，空表示通过（编辑器保存前与构建时都用） */
export function validateEnemyData(data: EnemyData): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const e of data.enemies) {
    if (!/^[\w-]+$/.test(e.id)) errors.push(`非法的敌人 id：${e.id}`)
    if (ids.has(e.id)) errors.push(`敌人 id 重复：${e.id}`)
    ids.add(e.id)
  }
  const has = (id: string) => ids.has(id)
  for (const e of data.enemies) {
    const at = `${e.name || e.id}`
    if (!e.name.trim()) errors.push(`${e.id}：名称不能为空`)
    if (!ROLES.includes(e.role)) errors.push(`${at}：未知定位`)
    if (!isInt(e.maxHp) || e.maxHp <= 0) errors.push(`${at}：生命值必须是正整数`)
    if (e.threat !== undefined && !(typeof e.threat === 'number' && e.threat > 0))
      errors.push(`${at}：威胁值必须大于 0`)
    if (e.role === 'monster' && e.threat === undefined) errors.push(`${at}：普通怪需要威胁值`)
    if (e.intents.length === 0) errors.push(`${at}：意图列表不能为空`)
    if (e.loopFrom !== undefined && (!isInt(e.loopFrom) || e.loopFrom < 0 || e.loopFrom >= e.intents.length))
      errors.push(`${at}：循环起点必须是意图列表内的下标`)
    for (const [k, v] of Object.entries(e.startStatuses ?? {})) {
      if (!k.trim() || !isInt(v)) errors.push(`${at}：初始状态 ${k || '(空)'} 的层数必须是整数`)
    }
    for (const top of e.intents) {
      for (const it of [top, ...(top.also ?? [])] as ActionSpec[]) {
        if (!INTENT_TYPES.includes(it.type)) {
          errors.push(`${at}：未知意图 ${it.type}`)
          continue
        }
        const nums: Record<string, unknown> = {}
        if (it.type === 'attack') nums['伤害'] = it.damage
        if (it.type === 'attack' && it.grow !== undefined) nums['递增'] = it.grow
        if (it.type === 'defend') nums['格挡'] = it.block
        if (it.type === 'steal') nums['金币'] = it.amount
        if (it.type === 'debuff' || it.type === 'buff') nums['层数'] = it.stacks
        if (it.type === 'addCards') nums['张数'] = it.count
        for (const [label, v] of Object.entries(nums)) {
          if (!isInt(v) || v < 0) errors.push(`${at}：${it.type} 的${label}必须是非负整数`)
        }
        if (it.type === 'attack' && it.hits !== undefined && (!isInt(it.hits) || it.hits < 1))
          errors.push(`${at}：攻击段数必须是正整数`)
        if ((it.type === 'debuff' || it.type === 'buff') && !it.status.trim())
          errors.push(`${at}：${it.type} 需要状态 id`)
        if (it.type === 'addCards' && !it.cardId.trim()) errors.push(`${at}：addCards 需要卡牌 id`)
        if (it.type === 'attack' && it.addCards && (!it.addCards.cardId.trim() || !isInt(it.addCards.count)))
          errors.push(`${at}：攻击附带塞牌的参数不完整`)
        if (it.type === 'summon' && !has(it.enemy)) errors.push(`${at}：召唤的敌人 ${it.enemy} 不存在`)
      }
    }
    for (const s of e.splitInto ?? []) {
      if (!has(s)) errors.push(`${at}：分裂出的敌人 ${s} 不存在`)
    }
  }
  // 引用成环会让构建无限递归
  const refs = (e: EnemySpec) => [
    ...(e.splitInto ?? []),
    ...e.intents.flatMap((i) => [i, ...(i.also ?? [])].flatMap((a) => (a.type === 'summon' ? [a.enemy] : []))),
  ]
  const byId = new Map(data.enemies.map((e) => [e.id, e]))
  const state = new Map<string, 1 | 2>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false
    if (state.get(id) === 1) return true
    state.set(id, 1)
    for (const r of refs(byId.get(id) as EnemySpec)) if (byId.has(r) && visit(r)) return true
    state.set(id, 2)
    return false
  }
  for (const e of data.enemies) if (visit(e.id)) errors.push(`${e.name || e.id}：分裂 / 召唤引用成环`)

  const eids = new Set<string>()
  for (const c of data.encounters) {
    if (!/^[\w-]+$/.test(c.id)) errors.push(`非法的遭遇 id：${c.id}`)
    if (eids.has(c.id)) errors.push(`遭遇 id 重复：${c.id}`)
    eids.add(c.id)
    if (c.enemies.length === 0) errors.push(`遭遇 ${c.name || c.id}：至少一只敌人`)
    if (c.enemies.some((id) => !has(id))) errors.push(`遭遇 ${c.name || c.id}：包含不存在的敌人`)
    if (!isInt(c.minFloor) || !isInt(c.maxFloor) || c.minFloor < 1 || c.minFloor > c.maxFloor)
      errors.push(`遭遇 ${c.name || c.id}：楼层范围不合法`)
  }
  return errors
}

/** 把数据表构建成引擎使用的 EnemyDef（分裂 / 召唤按 id 解析，同一 id 共用同一份对象） */
export function buildEnemies(data: EnemyData) {
  const errors = validateEnemyData(data)
  if (errors.length) throw new Error(`enemies.json 无效：\n${errors.join('\n')}`)
  const specs = new Map(data.enemies.map((s) => [s.id, s]))
  const cache = new Map<string, EnemyDef>()
  const build = (id: string): EnemyDef => {
    const hit = cache.get(id)
    if (hit) return hit
    const s = specs.get(id) as EnemySpec
    const action = (a: ActionSpec): IntentAction => (a.type === 'summon' ? { type: 'summon', enemy: build(a.enemy) } : { ...a })
    const def: EnemyDef = {
      id: s.id,
      name: s.name,
      ...(s.icon && { icon: s.icon }),
      maxHp: s.maxHp,
      ...(s.role === 'monster' && s.threat !== undefined && { threat: s.threat }),
      ...(s.startStatuses && Object.keys(s.startStatuses).length > 0 && { startStatuses: { ...s.startStatuses } }),
      ...(s.loopFrom !== undefined && { loopFrom: s.loopFrom }),
      intents: s.intents.map(({ also, ...main }) => ({
        ...action(main),
        ...(also?.length && { also: also.map(action) }),
      })),
      ...(s.splitInto?.length && { splitInto: s.splitInto.map(build) }),
    }
    cache.set(id, def)
    return def
  }
  const byId: Record<string, EnemyDef> = {}
  for (const s of data.enemies) byId[s.id] = build(s.id)
  const pool = (role: EnemyRole) => data.enemies.filter((s) => s.role === role).map((s) => byId[s.id] as EnemyDef)
  const encounters: EncounterDef[] = data.encounters.map((c) => ({
    id: c.id,
    name: c.name,
    enemies: c.enemies.map((id) => byId[id] as EnemyDef),
    minFloor: c.minFloor,
    maxFloor: c.maxFloor,
  }))
  return { byId, pool, encounters }
}
