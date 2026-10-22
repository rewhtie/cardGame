export type Statuses = Record<string, number>
export type StatusKind = 'buff' | 'debuff'

/** 数值修正：先把所有 add 相加，再乘上所有 mul，最后取整（由 calc* 完成） */
export interface Mod {
  add?: number
  mul?: number
  /** 带此标记的修正使最终结果四舍五入（默认向下取整） */
  round?: boolean
}

/** 回合开始/结束触发的结果描述，由 effects.ts 解释执行 */
export type TurnTrigger =
  | { type: 'loseHp'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'block'; amount: number }
  | { type: 'gainStatus'; status: string; stacks: number }

/** 战斗里的四个结算时点；敌方时点对每个敌人各触发一次（行动前 / 行动后） */
export type Timing = 'playerStart' | 'playerEnd' | 'enemyStart' | 'enemyEnd'
export type Decay = 'none' | 'tick' | 'turnEnd' | 'playerTurnStart' | 'halve' | 'condition'

export interface StatusDef {
  id: string
  name: string
  icon: string
  /** 悬浮说明，N 会被替换为层数 */
  text: string
  kind: StatusKind
  /** number：层数就是数值，直接显示数字（力量、敏捷…）；count：能力型，层数是份数，叠加后显示成小号 ×N；value：纯数值（没有“层”的概念），显示数字，说明只有一句 */
  display?: 'number' | 'count' | 'value'
  /**
   * none：层数永久常驻；turnEnd：到时点清空（默认玩家回合结束）；playerTurnStart：到时点清空（默认玩家回合开始）；
   * tick：到时点 -1，减到 0 移除；halve：到时点减半（向下取整），减到 0 移除；
   * condition：满足条件时才消耗，逻辑写在引擎里（剑意、感电之类），状态面板里不能新建
   */
  decay: Decay
  /** 衰减 / 清空发生的时点；缺省：tick、halve 跟所有者的回合走（玩家回合结束、敌人行动前），turnEnd 为玩家回合结束，playerTurnStart 为玩家回合开始 */
  decayAt?: Timing
  /** onTurnStart / onTurnEnd 触发的时点；缺省：所有者自己回合的开始 / 结束 */
  triggerAt?: Timing
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
  /** 玩家打出一张牌、结算完之后：本回合削弱玩家的力量和敏捷 */
  /** 玩家打出一张牌、结算完之后：给自己（所有者）加状态层 */
  onPlayerCard?: (stacks: number) => { status: string; stacks: number }
  afterPlayerCard?: (stacks: number) => { strength: number; dexterity: number }
  /** 每个敌方回合开始（敌人行动之前），所有者的该状态层数增加这么多 */
  turnStartGrow?: number
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
    id: 'swordIntent',
    name: '剑意',
    icon: '🗡️',
    text: '攻击伤害 +10%×N，每层使下一张技能牌费用变为零',
    kind: 'buff',
    decay: 'condition',
    modifyDamageDealt: (n) => ({ mul: 1 + n / 10, round: true }),
  },
  {
    id: 'swordFlow',
    display: 'count',
    name: '剑流',
    icon: '🌊',
    text: '下一张剑击费用变为零',
    kind: 'buff',
    decay: 'condition',
  },
  {
    id: 'swordMaster',
    display: 'count',
    name: '万剑归宗',
    icon: '⚔️',
    text: '每个回合开始，获得 N 层剑意',
    kind: 'buff',
    decay: 'none',
    onTurnStart: (n) => ({ type: 'gainStatus', status: 'swordIntent', stacks: n }),
  },
  {
    id: 'lastStand',
    display: 'count',
    name: '背水',
    icon: '🩹',
    text: '生命不高于 30% 时，攻击伤害 +50%×N（四舍五入）',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'bloodDrain',
    name: '汲血',
    icon: '🩸',
    text: '每段攻击伤害恢复实际损失生命的 10%×N（四舍五入，至少 1 点），回合结束清空',
    kind: 'buff',
    decay: 'turnEnd',
  },
  {
    id: 'bladeMaster',
    display: 'count',
    name: '英勇',
    icon: '🛡️',
    text: '每打出一张攻击牌，获得 N 点格挡',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'frost',
    name: '冰霜',
    icon: '❄️',
    text: '敌人有格挡时，攻击能穿透格挡，且受到的伤害 +10%×N（四舍五入）',
    kind: 'debuff',
    decay: 'turnEnd',
  },
  {
    id: 'shock',
    name: '感电',
    icon: '⚡',
    text: '下一张伤害牌的伤害 +50%×N（四舍五入），打出后失去 1 层',
    kind: 'buff',
    decay: 'condition',
  },
  {
    id: 'vigor',
    display: 'value',
    name: '活力',
    icon: '🔥',
    text: '下一张攻击牌造成的伤害 +N',
    kind: 'buff',
    decay: 'condition',
  },
  {
    id: 'thunderGod',
    display: 'count',
    name: '雷神降世',
    icon: '🌩️',
    text: '每个回合开始，获得 N 层感电',
    kind: 'buff',
    decay: 'none',
    onTurnStart: (n) => ({ type: 'gainStatus', status: 'shock', stacks: n }),
  },
  {
    id: 'burn',
    name: '灼伤',
    icon: '🔥',
    text: '回合开始时失去 N 点生命，然后层数减半',
    kind: 'debuff',
    decay: 'halve',
    onTurnStart: (n) => ({ type: 'loseHp', amount: n }),
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
    display: 'count',
    name: '旧伤',
    icon: '🥀',
    text: '每次受到未被格挡的攻击伤害、损失生命时，将 N 张伤口置入弃牌堆',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'pus',
    display: 'count',
    name: '脓血',
    icon: '🧫',
    text: '每当一张伤口被消耗，恢复 N 点生命',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'plagueBeak',
    display: 'count',
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
    id: 'incorporeal',
    display: 'count',
    name: '无实体',
    icon: '👻',
    text: '每次受到的伤害降为 1，每个回合 -1 层',
    kind: 'buff',
    decay: 'tick',
    decayAt: 'playerStart',
  },
  {
    id: 'woundSpawn',
    display: 'count',
    name: '伤口滋生',
    icon: '🩸',
    text: '每次受到伤害，往抽牌堆随机位置塞入 N 张伤口',
    kind: 'buff',
    decay: 'turnEnd',
    decayAt: 'playerStart',
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
    display: 'count',
    name: '毒针',
    icon: '🐝',
    text: '每次被攻击，往玩家弃牌堆置入 N 张晕眩',
    kind: 'buff',
    decay: 'none',
    onHit: (n) => ({ cardId: 'stun', count: n }),
  },
  {
    id: 'carapace',
    display: 'count',
    name: '舍身',
    icon: '🪲',
    text: '攻击未造成生命值损伤时，自己晕眩一回合',
    kind: 'debuff',
    decay: 'none',
  },
  {
    id: 'perfectGuard',
    display: 'count',
    name: '完美防御',
    icon: '🛡️',
    text: '敌人的攻击未对你造成生命值损伤时，该敌人晕眩 N 回合',
    kind: 'buff',
    decay: 'playerTurnStart',
  },
  {
    id: 'stunned',
    name: '晕眩',
    icon: '💫',
    text: '跳过接下来 N 次行动，每跳过一次 -1 层',
    kind: 'debuff',
    decay: 'condition',
  },
  {
    id: 'split',
    display: 'count',
    name: '分裂',
    icon: '🧬',
    text: '玩家回合结束时，若生命在一半以下，分裂成两只小怪',
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
  {
    id: 'drain',
    name: '汲取',
    icon: '🩸',
    text: '玩家每打出一张牌，本回合力量 -N、敏捷 -N',
    kind: 'buff',
    decay: 'none',
    afterPlayerCard: (n) => ({ strength: n, dexterity: n }),
  },
  {
    id: 'drained',
    name: '枯竭',
    icon: '🥀',
    text: '回合结束时恢复 N 点力量和敏捷',
    kind: 'debuff',
    decay: 'none',
  },
  {
    id: 'crack',
    display: 'count',
    name: '裂纹',
    icon: '🗿',
    text: '玩家每打出一张牌，本回合受到的伤害 +20%，可叠加',
    kind: 'buff',
    decay: 'none',
    onPlayerCard: () => ({ status: 'cracked', stacks: 1 }),
  },
  {
    id: 'cracked',
    name: '受创',
    icon: '💢',
    text: '受到的伤害 +20%×N（四舍五入），回合结束清零',
    kind: 'debuff',
    decay: 'turnEnd',
    modifyDamageTaken: (n) => ({ mul: 1 + 0.2 * n, round: true }),
  },
  {
    id: 'parasite',
    name: '寄生种子',
    icon: '🌱',
    text: '每个敌方回合开始层数 +1；被你的攻击命中时，你恢复层数的 50% 点生命（至少 1 点），然后清空',
    kind: 'debuff',
    decay: 'condition',
    turnStartGrow: 1,
  },
  {
    id: 'ancientBody',
    display: 'count',
    name: '古树之躯',
    icon: '🌳',
    text: '回合开始时，全场寄生种子每有 4 层，获得 N 层荆棘',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'rootGrow',
    display: 'count',
    name: '生根',
    icon: '🪴',
    text: '每个敌方回合开始，已被寄生的敌人额外获得 N 层寄生种子',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'legendSpear',
    display: 'count',
    name: '传说中的长枪',
    icon: '🔱',
    text: '每回合的前 N 张攻击牌，随机移除目标一个增益，并在本回合获得等量层数的英勇',
    kind: 'buff',
    decay: 'none',
  },
  {
    id: 'tit4tat',
    display: 'count',
    name: '以牙还牙',
    icon: '🦷',
    text: '受到的攻击伤害，会反弹给攻击者',
    kind: 'buff',
    decay: 'playerTurnStart',
  },
  {
    id: 'nutrient',
    display: 'count',
    name: '营养',
    icon: '🍃',
    text: '该敌人获得的寄生种子层数 ×1.5（向下取整）；下个敌方回合开始时，寄生自增改为当前层数的 10%（至少比平时多 1 层），随后清零',
    kind: 'debuff',
    decay: 'condition',
  },
  {
    id: 'energyDown',
    name: '能量不足',
    icon: '🔋',
    text: '下个回合开始时，能量临时 -N',
    kind: 'debuff',
    decay: 'condition',
  },
  {
    id: 'drawDown',
    name: '抽牌受限',
    icon: '🃏',
    text: '下个回合开始时，少抽 N 张牌',
    kind: 'debuff',
    decay: 'condition',
  },
  {
    id: 'overdraftDex',
    name: '敏捷透支',
    icon: '📉',
    text: '敏捷被透支了 N 点，将在下个回合结束时恢复',
    kind: 'debuff',
    decay: 'condition',
  },
  {
    id: 'overdraft',
    name: '透支',
    icon: '📉',
    text: '力量被透支了 N 点，将在下个回合结束时恢复',
    kind: 'debuff',
    decay: 'condition',
  },
]

export const statusById: Record<string, StatusDef> = Object.fromEntries(
  STATUSES.map((d) => [d.id, d]),
)

/** 把文案里的 N 换成层数；"+N" 遇到负层数写成 "-3"，不出现 "+-3" */
export const fillStacks = (text: string, stacks: number | string) =>
  text.replaceAll('+N', Number(stacks) < 0 ? String(stacks) : `+${stacks}`).replaceAll('N', String(stacks))

export const statusDescription = (id: string, stacks: number) =>
  `${statusById[id]?.name ?? id} ${stacks}：${fillStacks(statusById[id]?.text ?? '', stacks)}`

export const TIMING_TEXT: Record<Timing, string> = {
  playerStart: '玩家回合开始时',
  playerEnd: '玩家回合结束时',
  enemyStart: '敌方回合开始时（敌人行动前）',
  enemyEnd: '敌方回合结束时（敌人行动后）',
}

export const DECAY_LABEL: Record<Decay, string> = {
  none: '永久常驻',
  turnEnd: '回合结束清空（临时）',
  playerTurnStart: '回合开始清空（临时，撑到下回合开始）',
  condition: '条件消耗（引擎内置）',
  tick: '每次 -1 层（结算型）',
  halve: '每次层数减半（结算型）',
}

type Owner = 'player' | 'enemy'

/** 清空 / 衰减实际发生的时点 */
export function decayTiming(def: StatusDef, side: Owner): Timing | null {
  if (def.decay === 'none' || def.decay === 'condition') return null
  if (def.decayAt) return def.decayAt
  // 回合结束清空的增益跟着持有者走：敌人带着的撑到自己出手之后（减益仍在玩家回合结束清）
  if (def.decay === 'turnEnd') return side === 'enemy' && def.kind === 'buff' ? 'enemyEnd' : 'playerEnd'
  if (def.decay === 'playerTurnStart') return 'playerStart'
  return side === 'player' ? 'playerEnd' : 'enemyStart'
}

/** onTurnStart / onTurnEnd 触发的时点 */
export function triggerTiming(def: StatusDef, side: Owner): Timing | null {
  if (!def.onTurnStart && !def.onTurnEnd) return null
  if (def.triggerAt) return def.triggerAt
  const start = !!def.onTurnStart
  if (side === 'player') return start ? 'playerStart' : 'playerEnd'
  return start ? 'enemyStart' : 'enemyEnd'
}

/** 持续时间说明：由 decay 统一生成，不再手写进 text */
export function durationText(def: StatusDef): string {
  const at = def.decayAt ? TIMING_TEXT[def.decayAt] : null
  switch (def.decay) {
    case 'none':
      return ''
    case 'condition':
      return '满足条件时消耗（见说明）'
    case 'turnEnd':
      return `${TIMING_TEXT[def.decayAt ?? 'playerEnd']}清空`
    case 'playerTurnStart':
      return `${TIMING_TEXT[def.decayAt ?? 'playerStart']}清空`
    case 'tick':
      return at ? `${at}层数 -1，减到 0 消失` : '每个回合 -1 层，减到 0 消失'
    case 'halve':
      return at ? `${at}层数减半（向下取整），减到 0 消失` : '每个回合层数减半（向下取整），减到 0 消失'
  }
}

/**
 * 当前层数的简写：只留下含 N 的那几处算好的数值（"+N"→"+6"，"10%×N"→"60%"，"N 点"→"6 点"），
 * 不再把整句话重说一遍；抽不出来就退回整句
 */
function shortTotal(text: string, stacks: number): string {
  const parts = [...text.matchAll(/([+-]?)(\d+(?:\.\d+)?)%×N|([+-]?)N(\s?[点张层次])?/g)].map((m) =>
    m[2]
      ? `${m[1]}${Math.round(Number(m[2]) * stacks * 100) / 100}%`
      : `${m[3] ? (stacks < 0 ? String(stacks) : `+${stacks}`) : stacks}${m[4] ?? ''}`,
  )
  return parts.length ? [...new Set(parts)].join('、') : fillStacks(text, stacks)
}

/** 悬浮说明：每层的效果，加上当前层数的简写数值；持续时间由 decay 生成 */
export function statusTip(def: StatusDef, stacks?: number) {
  // 能力型（×N 角标）：层数只是份数，直接给一句已代入当前层数的说明，不分"每层 / 当前"
  if (def.display === 'count' || def.display === 'value') {
    return { perLayer: fillStacks(def.text, stacks ?? 1), total: undefined, stacks, duration: durationText(def), plain: true }
  }
  // 文案里有 N 说明效果随层数线性叠加：先说每层多少，再给当前层数的数值
  if (!def.text.includes('N')) {
    return { perLayer: def.text, total: undefined, stacks, duration: durationText(def), plain: true }
  }
  return {
    perLayer: def.text.replaceAll('N', '1'),
    total: stacks !== undefined && stacks !== 1 ? shortTotal(def.text, stacks) : undefined,
    stacks,
    duration: durationText(def),
    plain: false,
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
    if (stacks !== 0 && fn) mods.push(fn(stacks))
  }
  return mods
}

/** 先加算，再乘算，最后向下取整，不低于 0 */
function fold(base: number, mods: Mod[]): number {
  const add = mods.reduce((sum, m) => sum + (m.add ?? 0), 0)
  const mul = mods.reduce((prod, m) => prod * (m.mul ?? 1), 1)
  const raw = (base + add) * mul
  // 浮点容差：乘数（如 1 + 3/10）的结果可能差一丁点（12.999…），不能被向下取整吃掉 1 点
  return Math.max(0, mods.some((m) => m.round) ? Math.round(raw + 1e-9) : Math.floor(raw + 1e-9))
}

/** 攻击伤害：攻击者的"造成伤害"修正 + 防御者的"受到伤害"修正 */
export function calcAttack(
  base: number,
  attacker: Statuses | undefined,
  defender: Statuses,
  extra: Mod[] = [],
): number {
  const dmg = fold(base, [
    ...collect(attacker, 'modifyDamageDealt'),
    ...collect(defender, 'modifyDamageTaken'),
    ...extra,
  ])
  // 无实体：防御者每次受到的伤害降为 1（0 伤害保持 0）。放在这里，意图预览 / 卡面数字 / 实际结算口径一致
  return dmg > 0 && (defender.incorporeal ?? 0) > 0 ? 1 : dmg
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
