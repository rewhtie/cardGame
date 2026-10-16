export type Statuses = Record<string, number>
export type StatusKind = 'buff' | 'debuff'

/** 数值修正：先把所有 add 相加，再乘上所有 mul，最后取整（由 calc* 完成） */
export interface Mod {
  add?: number
  mul?: number
}

/** 回合开始/结束触发的结果描述，由 effects.ts 解释执行 */
export type TurnTrigger =
  | { type: 'loseHp'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'block'; amount: number }

export interface StatusDef {
  id: string
  name: string
  icon: string
  /** 悬浮说明，N 会被替换为层数 */
  text: string
  kind: StatusKind
  /** none：层数永久；tick：每个所有者回合 -1，减到 0 移除 */
  decay: 'none' | 'tick'
  modifyDamageDealt?: (stacks: number) => Mod
  modifyDamageTaken?: (stacks: number) => Mod
  modifyBlock?: (stacks: number) => Mod
  onTurnStart?: (stacks: number) => TurnTrigger
  onTurnEnd?: (stacks: number) => TurnTrigger
  /** 被攻击时对攻击者造成的反伤 */
  onDamaged?: (stacks: number) => { type: 'reflect'; amount: number }
}

/** 声明顺序即结算顺序，不要随意调换 */
export const STATUSES: StatusDef[] = [
  {
    id: 'strength',
    name: '力量',
    icon: '💪',
    text: '造成的攻击伤害 +N',
    kind: 'buff',
    decay: 'none',
    modifyDamageDealt: (n) => ({ add: n }),
  },
  {
    id: 'dexterity',
    name: '敏捷',
    icon: '🦶',
    text: '获得的格挡 +N',
    kind: 'buff',
    decay: 'none',
    modifyBlock: (n) => ({ add: n }),
  },
  {
    id: 'weak',
    name: '虚弱',
    icon: '🐌',
    text: '造成的攻击伤害 ×0.75，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageDealt: () => ({ mul: 0.75 }),
  },
  {
    id: 'vulnerable',
    name: '易伤',
    icon: '💔',
    text: '受到的攻击伤害 ×1.5，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageTaken: () => ({ mul: 1.5 }),
  },
  {
    id: 'poison',
    name: '中毒',
    icon: '☠️',
    text: '回合开始时失去 N 点生命，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    onTurnStart: (n) => ({ type: 'loseHp', amount: n }),
  },
  {
    id: 'regen',
    name: '再生',
    icon: '🌿',
    text: '回合结束时恢复 N 点生命，每回合 -1',
    kind: 'buff',
    decay: 'tick',
    onTurnEnd: (n) => ({ type: 'heal', amount: n }),
  },
  {
    id: 'thorns',
    name: '荆棘',
    icon: '🌵',
    text: '被攻击时对攻击者造成 N 点伤害',
    kind: 'buff',
    decay: 'none',
    onDamaged: (n) => ({ type: 'reflect', amount: n }),
  },
  {
    id: 'metallicize',
    name: '钢铁之躯',
    icon: '🛡️',
    text: '回合结束时获得 N 点格挡',
    kind: 'buff',
    decay: 'none',
    onTurnEnd: (n) => ({ type: 'block', amount: n }),
  },
]

export const statusById: Record<string, StatusDef> = Object.fromEntries(
  STATUSES.map((d) => [d.id, d]),
)

export const statusDescription = (id: string, stacks: number) =>
  `${statusById[id]?.name ?? id} ${stacks}：${(statusById[id]?.text ?? '').replaceAll('N', String(stacks))}`

type ModHook = 'modifyDamageDealt' | 'modifyDamageTaken' | 'modifyBlock'

/** 按注册表顺序收集某个钩子的修正 */
function collect(owner: Statuses | undefined, hook: ModHook): Mod[] {
  if (!owner) return []
  const mods: Mod[] = []
  for (const def of STATUSES) {
    const stacks = owner[def.id] ?? 0
    const fn = def[hook]
    if (stacks > 0 && fn) mods.push(fn(stacks))
  }
  return mods
}

/** 先加算，再乘算，最后向下取整，不低于 0 */
function fold(base: number, mods: Mod[]): number {
  const add = mods.reduce((sum, m) => sum + (m.add ?? 0), 0)
  const mul = mods.reduce((prod, m) => prod * (m.mul ?? 1), 1)
  return Math.max(0, Math.floor((base + add) * mul))
}

/** 攻击伤害：攻击者的"造成伤害"修正 + 防御者的"受到伤害"修正 */
export function calcAttack(
  base: number,
  attacker: Statuses | undefined,
  defender: Statuses,
): number {
  return fold(base, [
    ...collect(attacker, 'modifyDamageDealt'),
    ...collect(defender, 'modifyDamageTaken'),
  ])
}

export function calcBlock(base: number, owner: Statuses): number {
  return fold(base, collect(owner, 'modifyBlock'))
}
