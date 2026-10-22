import { nextRandom, shuffle } from './rng'
import { attackBonusAt } from './intents'
import { POTION_RULES } from './potions'
import { attackerOf, attackMods, attacksThisTurn, enemyAttack } from './blades'
import { fireRelics, relicKeepsWounds } from './relics'
import { calcAttack, calcBlock, capHpLoss, decayTiming, STATUSES, statusById, triggerTiming, type Timing } from './statuses'
import type { BattleState, CardDef, Effect, EnemyDef, EnemyState, GameEvent, Side } from './types'

/** 内部使用：浅拷贝出可变草稿，保证 dispatch 不修改入参 */
export function draft(state: BattleState): BattleState {
  return {
    ...state,
    player: { ...state.player, statuses: { ...state.player.statuses } },
    enemies: state.enemies.map((e) => ({ ...e, statuses: { ...e.statuses } })),
    drawPile: [...state.drawPile],
    hand: [...state.hand],
    discardPile: [...state.discardPile],
    exhaustPile: [...state.exhaustPile],
    ...(state.minions && { minions: state.minions.map((m) => ({ ...m })) }),
    ...(state.commanded && { commanded: [...state.commanded] }),
    relicState: { ...state.relicState },
    ...(state.evolveCounts && { evolveCounts: { ...state.evolveCounts } }),
  }
}

export const WOUND = 'wound'
const isWound = (id: string) => id === WOUND

/** 三个牌堆（手牌 / 抽牌堆 / 弃牌堆）里的伤口数 */
export const countWounds = (s: BattleState) =>
  [...s.hand, ...s.drawPile, ...s.discardPile].filter(isWound).length

export const isAlive = (e: { hp: number }) => e.hp > 0

/** 敌人是否处于"即将分裂"：带分裂、生命在一半以下、且分裂后不超过敌人上限。此时它的原意图被打断 */
export function willSplit(e: EnemyState, living: number): boolean {
  const targets = e.def.splitInto ?? []
  return (
    isAlive(e) &&
    (e.statuses.split ?? 0) > 0 &&
    targets.length > 0 &&
    e.hp * 2 <= e.def.maxHp &&
    living - 1 + targets.length <= MAX_ENEMIES
  )
}

/** 玩家回合结束时：生命降到一半以下且带"分裂"的敌人分裂（本回合不再行动），各带剩余生命 */
export function splitEnemies(s: BattleState, events: GameEvent[]) {
  const count = s.enemies.length
  for (let enemyIndex = 0; enemyIndex < count; enemyIndex++) {
    const e = s.enemies[enemyIndex]!
    const targets = e.def.splitInto ?? []
    if (!willSplit(e, livingCount(s))) continue
    const rest = e.hp
    e.hp = 0
    e.vanishOnDeath = true
    const spawned = targets.map((def) => spawnEnemy(s, def, events, rest))
    events.push({ type: 'enemySplit', enemyIndex, spawned })
  }
}

/** 同时存活的敌人上限 */
export const MAX_ENEMIES = 4

export const livingCount = (s: BattleState) => s.enemies.filter(isAlive).length

/** 战斗中追加一只敌人；已达上限返回 -1，否则返回新敌人的下标 */
export function spawnEnemy(s: BattleState, def: EnemyDef, events: GameEvent[], hp?: number): number {
  if (livingCount(s) >= MAX_ENEMIES) return -1
  s.enemies.push({
    def,
    hp: hp ?? def.maxHp,
    block: 0,
    intentIndex: 0,
    statuses: { ...def.startStatuses },
    vanishOnDeath: true,
  })
  const enemyIndex = s.enemies.length - 1
  events.push({ type: 'enemySpawned', enemyIndex })
  return enemyIndex
}

/** 往玩家弃牌堆塞牌 */
export function addCardsToDiscard(s: BattleState, cardId: string, count: number, events: GameEvent[]) {
  for (let i = 0; i < count; i++) s.discardPile.push(cardId)
  events.push({ type: 'cardAdded', cardId, count })
}

/** 敌人生命归零时：归还偷走的金币 */
export function onEnemyDeath(s: BattleState, enemyIndex: number, events: GameEvent[]) {
  const e = s.enemies[enemyIndex]
  if (!e?.stolenGold) return
  s.gold += e.stolenGold
  events.push({ type: 'goldReturned', amount: e.stolenGold })
  e.stolenGold = 0
}

/** 第一只存活敌人的下标；全部死亡返回 -1 */
export function firstLivingEnemy(s: BattleState): number {
  return s.enemies.findIndex(isAlive)
}

export interface DamageOpts {
  /** 攻击来源；缺省表示无来源的伤害（作弊、反伤），不吃"造成伤害"修正也不触发反伤 */
  source?: { side: Side; enemyIndex?: number }
  /** 反伤自身产生的伤害要传 false，避免荆棘互相无限反弹 */
  reflect?: boolean
}

const statusesOf = (s: BattleState, side: Side, enemyIndex = 0) =>
  side === 'player' ? s.player.statuses : s.enemies[enemyIndex]?.statuses

/** target 为 'enemy' 时用 enemyIndex 指定是哪一只 */
export function applyDamage(
  s: BattleState,
  target: Side,
  amount: number,
  events: GameEvent[],
  enemyIndex = 0,
  opts: DamageOpts = {},
) {
  const t = target === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const attacker = opts.source ? statusesOf(s, opts.source.side, opts.source.enemyIndex) : undefined
  // 出手方（玩家或敌人）身上的背水 / 感电 / 活力 / 冰霜穿甲等一律按出手方自己的状态算，增益跟着状态走
  const from =
    opts.source?.side === 'player'
      ? { hp: s.player.hp, maxHp: s.player.maxHp, statuses: s.player.statuses }
      : opts.source?.side === 'enemy' && s.enemies[opts.source.enemyIndex ?? 0]
        ? attackerOf(s.enemies[opts.source.enemyIndex ?? 0]!)
        : undefined
  const blade = from ? attackMods(from, t.block, t.statuses) : { mods: [], pierce: false }
  amount = calcAttack(amount, attacker, t.statuses, blade.mods)
  const hurt = target === 'player' && amount > 0
  const blocked = blade.pierce ? 0 : Math.min(t.block, amount)
  t.block -= blocked
  const hpLost = Math.min(t.hp, capHpLoss(t.statuses, amount - blocked))
  t.hp -= hpLost
  // 以牙还牙：敌方回合受到的每次攻击，按层数 × 100% 把伤害反弹给攻击者，不消耗层数
  let titBack = 0
  const tit = t.statuses.tit4tat ?? 0
  if (opts.source && opts.source.side !== target && amount > 0 && tit > 0) {
    events.push({ type: 'statusTriggered', target, status: 'tit4tat', ...(target === 'enemy' ? { enemyIndex } : {}) })
    titBack = amount * tit
  }
  if (target === 'enemy' && hpLost > 0 && t.hp <= 0) {
    // 斩杀：致命一击来自玩家自己的伤害（有来源），中毒 / 反伤 / 遗物等无来源伤害不算
    if (opts.source?.side === 'player') s.cardKill = true
    onEnemyDeath(s, enemyIndex, events)
  }
  if (target === 'player' && hpLost > 0) {
    for (let i = 0; i < (t.statuses.oldWounds ?? 0); i++) s.discardPile.push(WOUND)
  }
  if (hurt && (t.statuses.woundSpawn ?? 0) > 0) {
    // 伤口滋生：每次受伤往抽牌堆随机位置塞 N 张伤口
    const n = t.statuses.woundSpawn!
    for (let i = 0; i < n; i++) {
      const r = nextRandom(s.rngState)
      s.rngState = r[1]
      s.drawPile.splice(Math.floor(r[0] * (s.drawPile.length + 1)), 0, WOUND)
    }
    events.push({ type: 'cardAdded', cardId: WOUND, count: n })
  }
  events.push({
    type: 'damageDealt',
    target,
    amount: hpLost,
    blocked,
    ...(target === 'enemy' ? { enemyIndex } : {}),
  })
  if (target === 'enemy') legendVestAdd(s, hpLost + blocked, events)

  const src = opts.source
  // 汲血：出手方每段伤害各恢复实际损失生命的 10%×层数，至少 1 点（玩家、敌人通用）
  if (src && from && hpLost > 0) {
    const drain = from.statuses.bloodDrain ?? 0
    if (drain > 0) heal(s, src.side, src.enemyIndex ?? 0, Math.max(1, Math.round(hpLost * 0.1 * drain + 1e-9)), events)
  }
  if (target === 'enemy' && src?.side === 'player') {
    // 寄生种子：被玩家攻击命中（哪怕全被格挡）→ 回复层数的一半，然后清空
    const seeds = t.statuses.parasite ?? 0
    if (seeds > 0 && hpLost + blocked > 0) {
      heal(s, 'player', 0, Math.max(1, Math.floor(seeds / 2)), events)
      delete t.statuses.parasite
      events.push({ type: 'statusRemoved', target, status: 'parasite', enemyIndex })
    }
    for (const def of STATUSES) {
      const stacks = t.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.onHit) continue
      const { cardId, count } = def.onHit(stacks)
      events.push({ type: 'statusTriggered', target, status: def.id, enemyIndex })
      addCardsToDiscard(s, cardId, count, events)
    }
  }
  if (
    src &&
    opts.reflect !== false &&
    !(src.side === target && (src.enemyIndex ?? 0) === enemyIndex)
  ) {
    for (const def of STATUSES) {
      const stacks = t.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.onDamaged) continue
      const back = def.onDamaged(stacks).amount
      events.push({
        type: 'statusTriggered',
        target,
        status: def.id,
        ...(target === 'enemy' ? { enemyIndex } : {}),
      })
      applyDamage(s, src.side, back, events, src.enemyIndex ?? 0, { reflect: false })
    }
    if (titBack > 0) applyDamage(s, src.side, titBack, events, src.enemyIndex ?? 0, { reflect: false })
  }
}

export function applyBlock(
  s: BattleState,
  target: Side,
  amount: number,
  events: GameEvent[],
  enemyIndex = 0,
) {
  const t = target === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  t.block += amount
  events.push({
    type: 'blockGained',
    target,
    amount,
    ...(target === 'enemy' ? { enemyIndex } : {}),
  })
  if (target === 'player') legendVestAdd(s, amount, events)
}

export const LEGEND_VEST_EVERY = 100

/** 传说背心：敌人受到的一切伤害（攻击、反伤、药水、中毒等，含被格挡吸收的部分）与玩家获得的格挡共用一个计数，每满 100 点得 1 层完美防御 */
function legendVestAdd(s: BattleState, amount: number, events: GameEvent[]) {
  if (amount <= 0 || !s.relics.includes('legendVest')) return
  const total = (s.relicState.legendVest ?? 0) + amount
  const layers = Math.floor(total / LEGEND_VEST_EVERY)
  s.relicState = { ...s.relicState, legendVest: total % LEGEND_VEST_EVERY }
  if (layers > 0) addStatus(s, 'player', 0, 'perfectGuard', layers, events)
}

/** 给某一方加状态；stacks <= 0 忽略，未知状态 id 直接报错（定义阶段的笔误） */
export function addStatus(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  id: string,
  stacks: number,
  events: GameEvent[],
) {
  if (stacks <= 0) return
  if (!statusById[id]) throw new Error(`未知状态：${id}`)
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  // 营养：敌人获得的寄生种子层数 ×1.5（向下取整）
  if (id === 'parasite' && (owner.statuses.nutrient ?? 0) > 0) stacks = Math.floor(stacks * 1.5)
  owner.statuses[id] = (owner.statuses[id] ?? 0) + stacks
  events.push({
    type: 'statusApplied',
    target: side,
    status: id,
    stacks,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
}

/**
 * 传说中的长枪：打出的第 1..N 张攻击牌（N = 长枪层数）随机剥掉目标一个增益，自己本回合获得等量层数的英勇（回合结束失去）。
 * 只认 kind 为 buff 且层数为正的状态，所以玩家施加的减益（含负的力量 / 敏捷）不会被误剥。
 */
export function stripEnemyBuff(s: BattleState, enemyIndex: number, events: GameEvent[]) {
  const spear = s.player.statuses.legendSpear ?? 0
  if (spear <= 0 || (s.turnAttacks ?? 0) > spear) return
  spearStrip(s, 'enemy', enemyIndex, 'player', 0, events)
}

/** 长枪的一次剥除：随机拿走 victim 一个增益，让 holder 本回合获得等量层数的英勇（双方通用） */
export function spearStrip(s: BattleState, victim: Side, vIdx: number, holder: Side, hIdx: number, events: GameEvent[]) {
  const v = victim === 'player' ? s.player : s.enemies[vIdx]
  if (!v) return
  const buffs = Object.keys(v.statuses).filter((id) => statusById[id]?.kind === 'buff' && v.statuses[id]! > 0)
  if (buffs.length === 0) return
  const r = nextRandom(s.rngState)
  s.rngState = r[1]
  const id = buffs[Math.floor(r[0] * buffs.length)]!
  const stacks = v.statuses[id]!
  delete v.statuses[id]
  delete v.statuses[TEMP_PREFIX + id]
  events.push({ type: 'statusRemoved', target: victim, status: id, ...(victim === 'enemy' ? { enemyIndex: vIdx } : {}) })
  addTempStatus(s, holder, hIdx, 'bladeMaster', stacks, events)
}

/** 临时状态在 statuses 里的记账键：值 = 本回合临时加的层数，玩家回合结束时扣回去 */
export const TEMP_PREFIX = 'temp:'

/** 获得「回合结束失去」的临时层数：状态本身照常叠加，另记一笔供回合结束扣除 */
export function addTempStatus(s: BattleState, side: Side, enemyIndex: number, id: string, stacks: number, events: GameEvent[]) {
  if (stacks <= 0) return
  addStatus(s, side, enemyIndex, id, stacks, events)
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (owner) owner.statuses[TEMP_PREFIX + id] = (owner.statuses[TEMP_PREFIX + id] ?? 0) + stacks
}

/** 玩家回合结束：扣掉所有临时层数（状态已被别的效果消耗掉的，最多扣到 0） */
function expireTempStatuses(s: BattleState, events: GameEvent[], side: Side = 'player', idx = 0) {
  const owner = side === 'player' ? s.player : s.enemies[idx]
  if (!owner) return
  for (const key of Object.keys(owner.statuses)) {
    if (!key.startsWith(TEMP_PREFIX)) continue
    const id = key.slice(TEMP_PREFIX.length)
    const temp = owner.statuses[key]!
    delete owner.statuses[key]
    const have = owner.statuses[id] ?? 0
    if (have > 0) shiftStatus(s, side, idx, id, -Math.min(temp, have), events)
  }
}

/** 场上所有增益的层数总和：玩家 + 存活敌人，只数 kind 为 buff 且层数为正的状态（临时记账键不算） */
export function fieldBuffTotal(s: BattleState): number {
  const sum = (st: Record<string, number>) =>
    Object.entries(st).reduce((n, [id, v]) => (statusById[id]?.kind === 'buff' && v > 0 ? n + v : n), 0)
  return sum(s.player.statuses) + s.enemies.reduce((n, e) => (isAlive(e) ? n + sum(e.statuses) : n), 0)
}

type DamageEffect = Extract<Effect, { type: 'damage' }>

/**
 * 伤害牌单段的基数（尚未套状态修正）：基础值 + 伤口 / 层数 / 目标状态 / 目标格挡 / 本回合攻击数等追加。
 * 结算（resolveEffect）与卡面预览（preview.ts）共用，保证两边口径一致。
 */
export function damageBase(s: BattleState, effect: DamageEffect, enemyIndex: number, x: number, own: number): number {
  const field = effect.buffTotal ? fieldBuffTotal(s) : 0
  const base = effect.buffTotal
    ? field > 0
      ? field
      : own
    : effect.maxHpPct
      ? Math.round((s.player.maxHp * effect.maxHpPct) / 100 + 1e-9)
      : effect.perX
        ? own * x
        : own
  const target = s.enemies[enemyIndex]
  const tExtra = effect.perTargetStatus
    ? Math.max(0, target?.statuses[effect.perTargetStatus.status] ?? 0) * effect.perTargetStatus.per
    : 0
  const bonus = (effect.woundBonus ?? 0) * countWounds(s)
  const extra = effect.perStack
    ? Math.max(0, s.player.statuses[effect.perStack.status] ?? 0) * effect.perStack.per
    : 0
  const blockBonus = effect.ifTargetBlock && (target?.block ?? 0) > 0 ? effect.ifTargetBlock.bonus : 0
  const attackBonus = effect.perAttackPlayed ? attacksThisTurn(s) * effect.perAttackPlayed.per : 0
  return base + bonus + extra + tExtra + blockBonus + attackBonus
}

/** 改变状态层数，delta 可为负（力量、敏捷允许为负）；结果为 0 时移除状态 */
export function shiftStatus(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  id: string,
  delta: number,
  events: GameEvent[],
) {
  if (delta === 0) return
  if (!statusById[id]) throw new Error(`未知状态：${id}`)
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  const next = (owner.statuses[id] ?? 0) + delta
  const at = side === 'enemy' ? { enemyIndex } : {}
  if (next === 0) {
    delete owner.statuses[id]
    events.push({ type: 'statusRemoved', target: side, status: id, ...at })
    return
  }
  owner.statuses[id] = next
  events.push({ type: 'statusApplied', target: side, status: id, stacks: delta, ...at })
}

export function heal(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  amount: number,
  events: GameEvent[],
) {
  const t = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const max = side === 'player' ? s.player.maxHp : s.enemies[enemyIndex]!.def.maxHp
  const gained = Math.max(0, Math.min(max - t.hp, amount))
  t.hp += gained
  // 实际没回复（已满血）就不发事件，否则界面会飘 "+0 ❤"、音效也会误响
  if (gained <= 0) return
  events.push({
    type: 'healed',
    target: side,
    amount: gained,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
  if (side === 'player') fireRelics(s, 'onHealed', events)
}

/** 直接失去生命（中毒等）：无视格挡，不吃任何修正，不触发反伤 */
export function loseHp(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  amount: number,
  events: GameEvent[],
) {
  const t = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const lost = Math.min(t.hp, amount)
  t.hp -= lost
  if (side === 'enemy' && lost > 0 && t.hp <= 0) onEnemyDeath(s, enemyIndex, events)
  events.push({
    type: 'damageDealt',
    target: side,
    amount: lost,
    blocked: 0,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
  if (side === 'enemy') legendVestAdd(s, lost, events)
}

type Owner = { statuses: Record<string, number> }

function ownerOf(s: BattleState, side: Side, enemyIndex: number): Owner | undefined {
  return side === 'player' ? s.player : s.enemies[enemyIndex]
}

/**
 * 「跟着持有者走」的出手状态结算：玩家与敌人共用同一套，新增类似状态只改这里。
 * 约定：状态的数值修正在 statuses.ts / blades.ts 里按持有者的 statuses 算（calcAttack / attackMods），
 * 状态的"用后消耗"在这里按持有者结算，两处都不区分玩家还是敌人。
 */
export interface AttackSnapshot {
  shock: number
  vigor: number
}

/** 出手前记下一次性增益的层数：只有这一击之前就有的层数才会被这一击用掉（这一击自己给的不算） */
export function snapshotAttack(s: BattleState, side: Side, enemyIndex: number): AttackSnapshot {
  const st = ownerOf(s, side, enemyIndex)?.statuses ?? {}
  return { shock: st.shock ?? 0, vigor: st.vigor ?? 0 }
}

/** 英勇：持有者每打出一次攻击，获得 N 点格挡 */
export function guardOnAttack(s: BattleState, side: Side, enemyIndex: number, events: GameEvent[]) {
  const n = ownerOf(s, side, enemyIndex)?.statuses.bladeMaster ?? 0
  if (n > 0) applyBlock(s, side, n, events, enemyIndex)
}

/**
 * 出手结算完后，持有者用掉一次性增益。
 * damaging：这次出手含伤害（感电只被伤害消耗，-1 层）；attack：算攻击（活力只被攻击消耗，整体用掉）。
 */
export function consumeAttackBuffs(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  before: AttackSnapshot,
  opts: { damaging: boolean; attack: boolean },
  events: GameEvent[],
) {
  const owner = ownerOf(s, side, enemyIndex)
  if (!owner) return
  if (before.shock > 0 && opts.damaging) shiftStatus(s, side, enemyIndex, 'shock', -1, events)
  if (before.vigor > 0 && opts.attack && opts.damaging) {
    delete owner.statuses.vigor
    events.push(removedEvent(side, 'vigor', enemyIndex))
  }
}

const removedEvent = (side: Side, status: string, enemyIndex: number): GameEvent => ({
  type: 'statusRemoved',
  target: side,
  status,
  ...(side === 'enemy' ? { enemyIndex } : {}),
})

function fireStatus(
  s: BattleState,
  def: (typeof STATUSES)[number],
  stacks: number,
  hook: 'onTurnStart' | 'onTurnEnd',
  side: Side,
  enemyIndex: number,
  events: GameEvent[],
) {
  const trigger = def[hook]!(stacks)
  events.push({
    type: 'statusTriggered',
    target: side,
    status: def.id,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
  if (trigger.type === 'loseHp') loseHp(s, side, enemyIndex, trigger.amount, events)
  else if (trigger.type === 'heal') heal(s, side, enemyIndex, trigger.amount, events)
  else if (trigger.type === 'gainStatus') addStatus(s, side, enemyIndex, trigger.status, trigger.stacks, events)
  else applyBlock(s, side, trigger.amount, events, enemyIndex)
}

/** 触发所有者身上带 hook 的状态（按注册表顺序），不看时点；单元测试和 runTiming 之外的直接调用用 */
export function runTurnTriggers(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  hook: 'onTurnStart' | 'onTurnEnd',
  events: GameEvent[],
) {
  const owner = ownerOf(s, side, enemyIndex)
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    if (stacks <= 0 || !def[hook]) continue
    fireStatus(s, def, stacks, hook, side, enemyIndex, events)
  }
}

/** 所有者回合的衰减：tick 状态 -1，halve 状态减半（向下取整），减到 0 移除；不看时点 */
export function tickStatuses(s: BattleState, side: Side, enemyIndex: number, events: GameEvent[]) {
  const owner = ownerOf(s, side, enemyIndex)
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    if (stacks > 0 && (def.decay === 'tick' || def.decay === 'halve')) stepStatus(owner, def, stacks, side, enemyIndex, events)
  }
}

function stepStatus(
  owner: Owner,
  def: (typeof STATUSES)[number],
  stacks: number,
  side: Side,
  enemyIndex: number,
  events: GameEvent[],
) {
  const next = def.decay === 'halve' ? Math.floor(stacks / 2) : stacks - 1
  if (next > 0) owner.statuses[def.id] = next
  else {
    delete owner.statuses[def.id]
    events.push(removedEvent(side, def.id, enemyIndex))
  }
}

/**
 * 某个时点的状态结算。开始类时点：清空 → 触发 → 衰减；结束类时点：触发 → 衰减 → 清空。
 * 不给 enemyIndex：玩家身上落在该时点的状态结算一次，玩家时点还会结算所有存活敌人身上的；
 * 给了 enemyIndex：只结算这个敌人身上落在敌方时点的状态（每个敌人行动前 / 后各一次）。
 */
export function runTiming(s: BattleState, timing: Timing, events: GameEvent[], enemyIndex?: number) {
  const owners: [Side, number][] = []
  if (enemyIndex === undefined) {
    owners.push(['player', 0])
    if (timing === 'playerStart' || timing === 'playerEnd') {
      s.enemies.forEach((e, i) => isAlive(e) && owners.push(['enemy', i]))
    }
  } else if (timing === 'enemyStart' || timing === 'enemyEnd') {
    const e = s.enemies[enemyIndex]
    if (e && isAlive(e)) owners.push(['enemy', enemyIndex])
  }
  if (timing === 'enemyEnd' && enemyIndex !== undefined) {
    expireTempStatuses(s, events, 'enemy', enemyIndex)
    // 震慑：敌人行动结束，恢复被临时削掉的力量
    const e = s.enemies[enemyIndex]
    const back = e?.statuses['restore:strength'] ?? 0
    if (e && back > 0) {
      delete e.statuses['restore:strength']
      shiftStatus(s, 'enemy', enemyIndex, 'strength', back, events)
    }
  }
  const start = timing === 'playerStart' || timing === 'enemyStart'
  if (timing === 'playerEnd') expireTempStatuses(s, events)
  const clear = (side: Side, idx: number) => {
    const owner = ownerOf(s, side, idx)!
    for (const def of STATUSES) {
      if (def.decay !== 'turnEnd' && def.decay !== 'playerTurnStart') continue
      if ((owner.statuses[def.id] ?? 0) <= 0 || decayTiming(def, side) !== timing) continue
      // 默认的回合结束清空只清玩家的增益：敌人加在玩家身上的减益要撑过敌方回合
      if (side === 'player' && def.decay === 'turnEnd' && !def.decayAt && def.kind !== 'buff') continue
      delete owner.statuses[def.id]
      events.push(removedEvent(side, def.id, idx))
    }
  }
  const trigger = (side: Side, idx: number) => {
    const owner = ownerOf(s, side, idx)!
    for (const def of STATUSES) {
      const stacks = owner.statuses[def.id] ?? 0
      const hook = def.onTurnStart ? 'onTurnStart' : 'onTurnEnd'
      if (stacks <= 0 || !def[hook] || triggerTiming(def, side) !== timing) continue
      fireStatus(s, def, stacks, hook, side, idx, events)
    }
  }
  const step = (side: Side, idx: number) => {
    const owner = ownerOf(s, side, idx)!
    for (const def of STATUSES) {
      const stacks = owner.statuses[def.id] ?? 0
      if (stacks <= 0 || (def.decay !== 'tick' && def.decay !== 'halve')) continue
      if (decayTiming(def, side) === timing) stepStatus(owner, def, stacks, side, idx, events)
    }
  }
  const order = start ? [clear, trigger, step] : [trigger, step, clear]
  for (const phase of order) {
    for (const [side, idx] of owners) if (ownerOf(s, side, idx)) phase(side, idx)
  }
}

export function drawCards(s: BattleState, count: number, events: GameEvent[]) {
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      // 带"留住伤口"的遗物：伤口不参与洗牌，原样留在弃牌堆
      const kept = relicKeepsWounds(s.relics) ? s.discardPile.filter(isWound) : []
      const reshuffle = kept.length ? s.discardPile.filter((c) => !isWound(c)) : s.discardPile
      if (reshuffle.length === 0) return
      const [pile, rngState] = shuffle(reshuffle, s.rngState)
      s.drawPile = pile
      s.discardPile = kept
      s.rngState = rngState
      events.push({ type: 'reshuffled' })
    }
    const cardId = s.drawPile.shift() as string
    s.hand.push(cardId)
    events.push({ type: 'cardDrawn', cardId })
  }
}

/** 结算玩家打出的卡牌效果 */
/** enemyIndex：玩家选定的目标敌人 */
/** 全场存活敌人的寄生层数合计 */
export const parasiteTotal = (s: BattleState) =>
  s.enemies.reduce((n, e) => n + (isAlive(e) ? (e.statuses.parasite ?? 0) : 0), 0)

export const MAX_MINIONS = 3
export const MINION_HP = 20
export const livingMinions = (s: BattleState) => (s.minions ?? []).filter((m) => m.hp > 0).length

/** 转化尸体能否生效：返回拒绝原因，null 表示可以 */
export function convertCorpseBlock(s: BattleState, enemyIndex: number): string | null {
  const e = s.enemies[enemyIndex]
  if (!e || !isAlive(e)) return '目标无效'
  if (e.vanishOnDeath) return '召唤 / 分裂出的敌人不留尸体'
  if ((e.statuses.parasite ?? 0) * 2 < e.hp) return '寄生层数不足以斩杀'
  if (livingCount(s) > 1 && livingMinions(s) >= MAX_MINIONS) return '随从已满'
  return null
}

/** 新生成一张牌实例：给定定义的副本，id 带唯一后缀，登记进 s.cards */
export function spawnCardInstance(s: BattleState, baseId: string, tag: string, patch: Partial<CardDef> = {}): string {
  s.spawned = (s.spawned ?? 0) + 1
  const id = `${baseId.split('#')[0]}#${tag}${s.spawned}`
  const def = s.cards[baseId] ?? s.cards[baseId.split('#')[0] as string]
  if (def) s.cards = { ...s.cards, [id]: { ...def, ...patch, id } }
  return id
}

/** 打出后让玩家选择：写入 s.pending，之后只能 resolve */
function openChoice(
  s: BattleState,
  mode: 'exhaust' | 'copy' | 'scry' | 'discover' | 'retrieve',
  count: number,
  playedId?: string,
) {
  if (mode === 'retrieve') {
    // 正在打出的牌已先进了弃牌堆，不能把自己捞回来
    const slots = s.discardPile.map((_, k) => k).filter((k) => !isWound(s.discardPile[k] as string) && !(s.discardPile[k] === playedId && k === s.discardPile.length - 1))
    if (slots.length > 0)
      s.pending = { kind: 'retrieve', count: Math.min(count, slots.length), cards: slots.map((k) => s.discardPile[k] as string), slots }
    return
  }
  if (mode === 'exhaust' || mode === 'copy') {
    if (s.hand.length === 0) return
    s.pending = mode === 'exhaust' ? { kind: 'exhaust', count: Math.min(count, s.hand.length) } : { kind: 'copy' }
  } else if (mode === 'scry') {
    if (s.drawPile.length === 0 && s.discardPile.length > 0) {
      const [pile, rngState] = shuffle(s.discardPile, s.rngState)
      s.drawPile = pile
      s.discardPile = []
      s.rngState = rngState
    }
    const cards = s.drawPile.slice(0, count)
    if (cards.length > 0) s.pending = { kind: 'scry', cards }
  } else {
    const pool = (s.discoverPool ?? []).filter((id) => s.cards[id])
    const options: string[] = []
    while (options.length < 3 && pool.length > 0) {
      const r = nextRandom(s.rngState)
      s.rngState = r[1]
      options.push(pool.splice(Math.floor(r[0] * pool.length), 1)[0] as string)
    }
    if (options.length > 0) s.pending = { kind: 'discover', options }
  }
}

/** 以「目标敌人」为作用对象的效果：群体牌对每只存活敌人各结算一次 */
const hitsTarget = (e: Effect) =>
  e.type === 'damage' ||
  e.type === 'meltBlock' ||
  e.type === 'sapStrength' ||
  e.type === 'multiplyStatus' ||
  (e.type === 'applyStatus' && e.to === 'target') ||
  (e.type === 'woundStatus' && e.to === 'target')

/**
 * 结算一张牌的一个效果。群体牌（target 为 allEnemies）把以目标为对象的效果逐个施加给存活敌人，
 * 其余效果只结算一次；lastDamage 累加所有目标，「按造成的伤害获得格挡」才算得对。
 */
export function resolveCardEffect(
  s: BattleState,
  card: CardDef,
  effect: Effect,
  events: GameEvent[],
  x: number,
  enemyIndex: number,
  playedId?: string,
) {
  if (card.target !== 'allEnemies' || !hitsTarget(effect)) {
    resolveEffect(s, effect, events, x, enemyIndex, playedId)
    return
  }
  let total = 0
  s.enemies.forEach((e, i) => {
    if (!isAlive(e)) return
    resolveEffect(s, effect, events, x, i, playedId)
    if (effect.type === 'damage') total += s.lastDamage ?? 0
  })
  if (effect.type === 'damage') s.lastDamage = total
}

export function resolveEffect(
  s: BattleState,
  effect: Effect,
  events: GameEvent[],
  x = 0,
  enemyIndex = 0,
  /** 正在打出的牌：它已先进了弃牌堆，捞牌时不能把自己捞回来 */
  playedId?: string,
) {
  switch (effect.type) {
    case 'convertCorpse': {
      const e = s.enemies[enemyIndex]!
      const last = livingCount(s) === 1
      e.hp = 0
      e.statuses = {}
      onEnemyDeath(s, enemyIndex, events)
      if (!last) {
        s.minions = [...(s.minions ?? []), { hp: MINION_HP, enemyIndex }]
        events.push({ type: 'minionRaised', enemyIndex })
      }
      break
    }
    case 'parasiteBurst': {
      const e = s.enemies[enemyIndex]
      const layers = e?.statuses.parasite ?? 0
      if (!e || layers <= 0) break
      delete e.statuses.parasite
      events.push({ type: 'statusRemoved', target: 'enemy', status: 'parasite', enemyIndex })
      applyDamage(s, 'enemy', layers, events, enemyIndex, { source: { side: 'player' } })
      break
    }
    case 'devourParasite': {
      const e = s.enemies[enemyIndex]
      const have = e?.statuses.parasite ?? 0
      if (!e || have <= 0) break
      const eaten = Math.min(have, effect.max)
      // 剩余层数先收起来：吞食是"消耗"，不能触发被攻击时的寄生回血并清空
      if (have > eaten) e.statuses.parasite = have - eaten
      else {
        delete e.statuses.parasite
        events.push({ type: 'statusRemoved', target: 'enemy', status: 'parasite', enemyIndex })
      }
      const rest = e.statuses.parasite
      delete e.statuses.parasite
      applyDamage(s, 'enemy', eaten * effect.per, events, enemyIndex, { source: { side: 'player' } })
      if (rest !== undefined) e.statuses.parasite = rest
      break
    }
    case 'drawIfParasite':
      if (parasiteTotal(s) >= effect.min) drawCards(s, effect.count, events)
      break
    case 'parasiteStatus': {
      const layers = s.enemies[enemyIndex]?.statuses.parasite ?? 0
      if (layers <= 0) break
      addStatus(s, 'enemy', enemyIndex, effect.status, Math.max(1, Math.floor(layers / effect.divisor)), events)
      break
    }
    case 'blockFromDamage':
      if ((s.lastDamage ?? 0) > 0) applyBlock(s, 'player', s.lastDamage!, events)
      break
    case 'overdraft':
      shiftStatus(s, 'player', 0, 'strength', -effect.amount, events)
      addStatus(s, 'player', 0, 'overdraft', effect.amount, events)
      break
    case 'meltBlock': {
      const e = s.enemies[enemyIndex]
      if (e) e.block = 0
      break
    }
    case 'sapStrength': {
      const e = s.enemies[enemyIndex]
      if (!e || effect.amount <= 0) break
      shiftStatus(s, 'enemy', enemyIndex, 'strength', -effect.amount, events)
      e.statuses['restore:strength'] = (e.statuses['restore:strength'] ?? 0) + effect.amount
      break
    }
    case 'purgeSelfBuff': {
      // 增益减益都算；临时记账键不是真状态，跳过
      const ids = Object.keys(s.player.statuses).filter((id) => statusById[id] && s.player.statuses[id]! > 0)
      if (ids.length === 0) break
      const r = nextRandom(s.rngState)
      s.rngState = r[1]
      const id = ids[Math.floor(r[0] * ids.length)]!
      const stacks = s.player.statuses[id]!
      delete s.player.statuses[id]
      delete s.player.statuses[TEMP_PREFIX + id] // 临时层数的记账一并清掉
      events.push({ type: 'statusRemoved', target: 'player', status: id })
      applyBlock(s, 'player', stacks, events)
      break
    }
    case 'spreadParasite': {
      const layers = s.enemies[enemyIndex]?.statuses.parasite ?? 0
      if (layers <= 0) break
      s.enemies.forEach((e, i) => {
        if (i === enemyIndex || !isAlive(e)) return
        const have = e.statuses.parasite ?? 0
        if (have < layers) addStatus(s, 'enemy', i, 'parasite', layers - have, events)
      })
      break
    }
    case 'consumeParasite': {
      const e = s.enemies[enemyIndex]
      if (!e) break
      const left = (e.statuses.parasite ?? 0) - effect.amount
      if (left > 0) e.statuses.parasite = left
      else {
        delete e.statuses.parasite
        events.push({ type: 'statusRemoved', target: 'enemy', status: 'parasite', enemyIndex })
      }
      break
    }
    case 'stealMaxHp': {
      const e = s.enemies[enemyIndex]
      if (!e || !isAlive(e)) break
      const cur = e.maxHpOverride ?? e.def.maxHp
      const got = Math.max(0, Math.min(effect.amount, cur - 1))
      if (got === 0) break
      e.maxHpOverride = cur - got
      e.hp = Math.min(e.hp, e.maxHpOverride)
      s.player.maxHp += got
      s.player.hp += got
      events.push({ type: 'maxHpStolen', amount: got, enemyIndex })
      break
    }
    case 'damage': {
      const lowHp = effect.lowHp && s.player.hp * 2 <= s.player.maxHp
      const base = damageBase(s, effect, enemyIndex, x, lowHp ? effect.lowHp!.amount : effect.amount)
      const tStacks = effect.perTargetStatus
        ? Math.max(0, s.enemies[enemyIndex]?.statuses[effect.perTargetStatus.status] ?? 0)
        : 0
      // 按层数追加：基数 += 层数 × per，结算完后清零该状态
      const stacks = effect.perStack ? (s.player.statuses[effect.perStack.status] ?? 0) : 0
      const hits = Math.max(1, Math.floor(Number(effect.hits) || 1))
      const evFrom = events.length
      for (let h = 0; h < hits; h++) {
        if (h > 0 && (s.enemies[enemyIndex]?.hp ?? 0) <= 0) break // 前一段已击杀，不再补刀
        applyDamage(s, 'enemy', base, events, enemyIndex, {
          source: { side: 'player' },
        })
      }
      s.lastDamage = events
        .slice(evFrom)
        .reduce((n, ev) => (ev.type === 'damageDealt' && ev.target === 'enemy' ? n + ev.amount + ev.blocked : n), 0)
      if (effect.perTargetStatus && tStacks > 0) {
        const after = effect.perTargetStatus.after ?? 'double'
        if (after === 'double') shiftStatus(s, 'enemy', enemyIndex, effect.perTargetStatus.status, tStacks, events)
        else if (after === 'clear') shiftStatus(s, 'enemy', enemyIndex, effect.perTargetStatus.status, -tStacks, events)
      }
      if (effect.perStack && stacks > 0) {
        delete s.player.statuses[effect.perStack.status]
        events.push({ type: 'statusRemoved', target: 'player', status: effect.perStack.status })
      }
      break
    }
    case 'multiplyStatus': {
      const cur = s.enemies[enemyIndex]?.statuses[effect.status] ?? 0
      if (cur > 0) shiftStatus(s, 'enemy', enemyIndex, effect.status, cur * (effect.factor - 1), events)
      break
    }
    case 'addCard': {
      const n = Math.max(0, Math.floor(effect.count))
      for (let i = 0; i < n; i++) {
        if (effect.to === 'draw') {
          const r = nextRandom(s.rngState)
          s.rngState = r[1]
          s.drawPile.splice(Math.floor(r[0] * (s.drawPile.length + 1)), 0, effect.cardId)
        } else if (effect.to === 'hand') s.hand.push(effect.cardId)
        else s.discardPile.push(effect.cardId)
      }
      if (n > 0) events.push({ type: 'cardAdded', cardId: effect.cardId, count: n })
      break
    }
    case 'penalty': {
      const n = Math.floor(effect.amount)
      if (n <= 0) break
      if (effect.stat === 'energy') addStatus(s, 'player', 0, 'energyDown', n, events)
      else if (effect.stat === 'draw') addStatus(s, 'player', 0, 'drawDown', n, events)
      else {
        shiftStatus(s, 'player', 0, effect.stat, -n, events)
        addStatus(s, 'player', 0, effect.stat === 'strength' ? 'overdraft' : 'overdraftDex', n, events)
      }
      break
    }
    case 'addWound':
      for (let i = 0; i < effect.count; i++) s.discardPile.push(WOUND)
      break
    case 'exhaustWounds': {
      const pile = effect.from === 'hand' ? s.hand : s.discardPile
      const n = pile.filter(isWound).length
      if (n === 0) break
      const rest = pile.filter((c) => !isWound(c))
      pile.length = 0
      pile.push(...rest)
      for (let i = 0; i < n; i++) s.exhaustPile.push(WOUND)
      const total = effect.per * n
      if (effect.gain === 'block')
        applyBlock(s, 'player', calcBlock(total, s.player.statuses), events)
      else if (effect.gain === 'gash') addStatus(s, 'enemy', enemyIndex, 'gash', total, events)
      else if (effect.gain === 'gashAll')
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) addStatus(s, 'enemy', i, 'gash', total, events)
        })
      else if (effect.gain === 'damage')
        applyDamage(s, 'enemy', total, events, enemyIndex, { source: { side: 'player' } })
      else if (effect.gain === 'damageAll')
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) applyDamage(s, 'enemy', total, events, i, { source: { side: 'player' } })
        })
      else drawCards(s, total, events)
      const pus = s.player.statuses.pus ?? 0
      if (pus > 0) heal(s, 'player', 0, pus * n, events)
      break
    }
    case 'exhaustStatusCard':
    case 'playTop':
      break // 由 playCard 在出牌时处理
    case 'choose':
      openChoice(s, effect.mode, effect.count, playedId)
      break
    case 'redraw': {
      const n = s.hand.length
      if (n > 0) {
        events.push({ type: 'handDiscarded', count: n })
        ;(s.discarded ??= []).push(...s.hand)
        s.discardPile.push(...s.hand)
        s.hand = []
      }
      drawCards(s, n + effect.extra, events)
      break
    }
    case 'exhaustCards': {
      const match = (id: string) => {
        const rarity = s.cards[id]?.rarity
        switch (effect.kind) {
          case 'wound':
            return isWound(id)
          case 'status':
            return isWound(id) || rarity === 'status'
          case 'curse':
            return rarity === 'curse'
          case 'other':
            return !isWound(id) && rarity !== 'status' && rarity !== 'curse'
          default:
            return true
        }
      }
      const piles =
        effect.from === 'all'
          ? [s.hand, s.drawPile, s.discardPile]
          : [effect.from === 'hand' ? s.hand : effect.from === 'draw' ? s.drawPile : s.discardPile]
      let left = effect.count === undefined ? Infinity : Math.max(0, Math.floor(effect.count))
      let exhausted = 0
      for (const pile of piles) {
        if (left <= 0) break
        // 正在打出的牌已先进弃牌堆，不能把自己消耗掉
        const self = pile === s.discardPile && pile.at(-1) === playedId ? pile.length - 1 : -1
        const order = pile.map((_, k) => k).filter((k) => k !== self && match(pile[k] as string))
        const picked = (pile === s.discardPile ? order.reverse() : order).slice(0, left)
        if (picked.length === 0) continue
        left -= picked.length
        exhausted += picked.length
        const chosen = new Set(picked)
        for (const k of picked) s.exhaustPile.push(pile[k] as string)
        const rest = pile.filter((_, k) => !chosen.has(k))
        pile.length = 0
        pile.push(...rest)
      }
      // 衍生效果：每消耗一张结算一遍（单体目标取当前目标）
      for (let i = 0; i < exhausted; i++)
        for (const sub of effect.perCard ?? []) resolveEffect(s, sub, events, x, enemyIndex, playedId)
      break
    }
    case 'reshuffle': {
      const all = [...s.drawPile, ...s.discardPile]
      if (all.length === 0) break
      const [pile, rngState] = shuffle(all, s.rngState)
      s.drawPile = pile
      s.discardPile = []
      s.rngState = rngState
      events.push({ type: 'reshuffled' })
      break
    }
    case 'blockByIntent': {
      const e = s.enemies[enemyIndex]
      const intent = e?.def.intents[e.intentIndex]
      if (!e || intent?.type !== 'attack') break
      const base = intent.damage + attackBonusAt(e.def, e.turns ?? 0)
      applyBlock(s, 'player', enemyAttack(base, e, s.player).damage, events)
      break
    }
    case 'goldIfKill':
      if ((s.enemies[enemyIndex]?.hp ?? 1) <= 0) s.gold += effect.gold
      break
    case 'gainPotion': {
      const ids = Object.keys(POTION_RULES)
      const r = nextRandom(s.rngState)
      s.rngState = r[1]
      const potionId = ids[Math.floor(r[0] * ids.length)] as string
      s.newPotions = [...(s.newPotions ?? []), potionId]
      events.push({ type: 'potionGained', potionId })
      break
    }
    case 'fetch': {
      const pile = effect.from === 'draw' ? s.drawPile : s.discardPile
      // 弃牌堆从尾部（最近进入）取，抽牌堆从顶部取
      const self = effect.from === 'discard' && pile.at(-1) === playedId ? pile.length - 1 : -1
      const order = pile.map((_, k) => k).filter((k) => k !== self && !isWound(pile[k] as string))
      const picked = (effect.from === 'draw' ? order : order.reverse()).slice(0, effect.count)
      const chosen = new Set(picked)
      for (const k of picked) {
        const cardId = pile[k] as string
        s.hand.push(cardId)
        events.push({ type: 'cardDrawn', cardId })
      }
      const rest = pile.filter((_, k) => !chosen.has(k))
      pile.length = 0
      pile.push(...rest)
      break
    }
    case 'block':
      applyBlock(
        s,
        'player',
        calcBlock(effect.perX ? effect.amount * x : effect.amount, s.player.statuses),
        events,
      )
      break
    case 'applyStatus':
      if (effect.to === 'self' && effect.temp) addTempStatus(s, 'player', 0, effect.status, effect.stacks, events)
      else if (effect.to === 'self') addStatus(s, 'player', 0, effect.status, effect.stacks, events)
      else if (effect.to === 'target')
        addStatus(s, 'enemy', enemyIndex, effect.status, effect.stacks, events)
      else
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) addStatus(s, 'enemy', i, effect.status, effect.stacks, events)
        })
      break
    case 'woundStatus': {
      const stacks = countWounds(s) * effect.per
      if (effect.to === 'self') addStatus(s, 'player', 0, effect.status, stacks, events)
      else if (effect.to === 'target') addStatus(s, 'enemy', enemyIndex, effect.status, stacks, events)
      else
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) addStatus(s, 'enemy', i, effect.status, stacks, events)
        })
      break
    }
    case 'heal':
      heal(s, 'player', 0, effect.amount, events)
      break
    case 'loseHp':
      loseHp(s, 'player', 0, effect.amount, events)
      break
    case 'draw':
      drawCards(s, effect.count, events)
      break
    case 'drawIfAttacks':
      if (attacksThisTurn(s) >= effect.min) drawCards(s, effect.count, events)
      break
    case 'gainEnergy':
      s.player.energy += effect.amount
      events.push({ type: 'energyGained', amount: effect.amount })
      break
  }
}
