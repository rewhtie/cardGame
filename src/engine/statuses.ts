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
  /** none：层数永久；tick：每个所有者回合 -1，减到 0 移除；turnEnd：玩家回合结束时清空 */
  decay: 'none' | 'tick' | 'turnEnd'
  modifyDamageDealt?: (stacks: number) => Mod
  modifyDamageTaken?: (stacks: number) => Mod
  modifyBlock?: (stacks: number) => Mod
  onTurnStart?: (stacks: number) => TurnTrigger
  onTurnEnd?: (stacks: number) => TurnTrigger
  /** 被攻击时对攻击者造成的反伤 */
  onDamaged?: (stacks: number) => { type: 'reflect'; amount: number }
  /** 单次攻击最多损失的生命 */
  capDamage?: (stacks: number) => number
  /** 被玩家打中（哪怕全被格挡）时往玩家弃牌堆置入牌 */
  onHit?: (stacks: number) => { cardId: string; count: number }
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
    text: '造成的攻击伤害 ×0.75',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageDealt: () => ({ mul: 0.75 }),
  },
  {
    id: 'vulnerable',
    name: '易伤',
    icon: '💔',
    text: '受到的攻击伤害 ×1.5',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageTaken: () => ({ mul: 1.5 }),
  },
  {
    id: 'poison',
    name: '中毒',
    icon: '☠️',
    text: '回合开始时失去 N 点生命',
    kind: 'debuff',
    decay: 'tick',
    onTurnStart: (n) => ({ type: 'loseHp', amount: n }),
  },
  {
    id: 'regen',
    name: '再生',
    icon: '🌿',
    text: '回合结束时恢复 N 点生命',
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
    id: 'gash',
    name: '裂伤',
    icon: '🩸',
    text: '受到的每次攻击伤害 +N',
    kind: 'debuff',
    decay: 'turnEnd',
    modifyDamageTaken: (n) => ({ add: n }),
  },
  {
    id: 'oldWounds',
    name: '旧伤',
    icon: '🥀',
    text: '每次受到未被格挡的攻击伤害、损失生命时，将 N 张伤口置入弃牌堆',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'pus',
    name: '脓血',
    icon: '🧫',
    text: '每当一张伤口被消耗，恢复 N 点生命',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'plagueBeak',
    name: '瘟疫之喙',
    icon: '🐦‍⬛',
    text: '回合开始时，弃牌堆每有 3 张伤口，获得 N 点力量',
    kind: 'buff',
    decay: 'none',
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
  {
    id: 'damageCap',
    name: '众生平等',
    icon: '⚖️',
    text: '每次受到的攻击最多损失 N 点生命',
    kind: 'buff',
    decay: 'none',
    capDamage: (n) => n,
  },
  {
    id: 'hive',
    name: '毒针',
    icon: '🐝',
    text: '每次被攻击，往玩家弃牌堆置入 N 张晕眩',
    kind: 'buff',
    decay: 'none',
    onHit: (n) => ({ cardId: 'stun', count: n }),
  },
  {
    id: 'carapace',
    name: '硬壳',
    icon: '🪲',
    text: '攻击被完全格挡时，陷入晕眩一回合',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'stunned',
    name: '晕眩',
    icon: '💫',
    text: '跳过下一次行动',
    kind: 'debuff',
    decay: 'none',
  },
  {
    id: 'split',
    name: '分裂',
    icon: '🧬',
    text: '生命降到一半以下时分裂成两只小怪',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'frail',
    name: '脆弱',
    icon: '🫧',
    text: '获得的格挡 ×0.75，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    modifyBlock: () => ({ mul: 0.75 }),
  },
]

export const statusById: Record<string, StatusDef> = Object.fromEntries(
  STATUSES.map((d) => [d.id, d]),
)

export const statusDescription = (id: string, stacks: number) =>
  `${statusById[id]?.name ?? id} ${stacks}：${(statusById[id]?.text ?? '').replaceAll('N', String(stacks))}`

/** 持续时间说明：由 decay 统一生成，不再手写进 text */
export const DECAY_TEXT: Record<StatusDef['decay'], string> = {
  none: '',
  tick: '每个回合 -1 层，减到 0 消失',
  turnEnd: '玩家回合结束时清空',
}

/** 悬浮说明的两行内容：效果（N 换成层数，未知层数保留 N）与持续时间 */
export function statusTip(def: StatusDef, stacks?: number) {
  // 文案里有 N 说明效果随层数线性叠加：先说每层多少，再说当前层数的总和
  if (!def.text.includes('N')) {
    return { perLayer: def.text, total: undefined, stacks, duration: DECAY_TEXT[def.decay] }
  }
  return {
    perLayer: def.text.replaceAll('N', '1'),
    total: stacks !== undefined && stacks !== 1 ? def.text.replaceAll('N', String(stacks)) : undefined,
    stacks,
    duration: DECAY_TEXT[def.decay],
  }
}

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

/** 单次攻击的生命损失上限：取所有封顶中最小的 */
export function capHpLoss(owner: Statuses, loss: number): number {
  let cap = loss
  for (const def of STATUSES) {
    const stacks = owner[def.id] ?? 0
    if (stacks > 0 && def.capDamage) cap = Math.min(cap, def.capDamage(stacks))
  }
  return cap
}

/** 状态池按正负面分组；STATUSES 的顺序仍是结算顺序，这里只是视图 */
export const BUFFS = STATUSES.filter((d) => d.kind === 'buff')
export const DEBUFFS = STATUSES.filter((d) => d.kind === 'debuff')
