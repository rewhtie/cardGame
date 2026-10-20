import { shuffle } from './rng'
import { fireRelics } from './relics'
import { calcAttack, calcBlock, capHpLoss, STATUSES, statusById } from './statuses'
import type { BattleState, Effect, EnemyDef, GameEvent, Side } from './types'

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
    relicState: { ...state.relicState },
  }
}

export const WOUND = 'wound'
const isWound = (id: string) => id === WOUND

/** 三个牌堆（手牌 / 抽牌堆 / 弃牌堆）里的伤口数 */
export const countWounds = (s: BattleState) =>
  [...s.hand, ...s.drawPile, ...s.discardPile].filter(isWound).length

/** 玩家回合结束时清空 decay 为 turnEnd 的状态 */
export function clearTurnEndStatuses(s: BattleState, events: GameEvent[]) {
  s.enemies.forEach((e, enemyIndex) => {
    if (!isAlive(e)) return
    for (const def of STATUSES) {
      if (def.decay !== 'turnEnd' || (e.statuses[def.id] ?? 0) <= 0) continue
      delete e.statuses[def.id]
      events.push({ type: 'statusRemoved', target: 'enemy', status: def.id, enemyIndex })
    }
  })
}

export const isAlive = (e: { hp: number }) => e.hp > 0

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
  amount = calcAttack(amount, attacker, t.statuses)
  const blocked = Math.min(t.block, amount)
  t.block -= blocked
  const hpLost = Math.min(t.hp, capHpLoss(t.statuses, amount - blocked))
  t.hp -= hpLost
  if (target === 'enemy' && hpLost > 0 && t.hp <= 0) onEnemyDeath(s, enemyIndex, events)
  if (target === 'player' && hpLost > 0) {
    for (let i = 0; i < (t.statuses.oldWounds ?? 0); i++) s.discardPile.push(WOUND)
  }
  events.push({
    type: 'damageDealt',
    target,
    amount: hpLost,
    blocked,
    ...(target === 'enemy' ? { enemyIndex } : {}),
  })

  const src = opts.source
  if (target === 'enemy' && src?.side === 'player') {
    for (const def of STATUSES) {
      const stacks = t.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.onHit) continue
      const { cardId, count } = def.onHit(stacks)
      events.push({ type: 'statusTriggered', target, status: def.id, enemyIndex })
      addCardsToDiscard(s, cardId, count, events)
    }
  }
  if (target === 'enemy' && hpLost > 0 && t.hp > 0) {
    const e = s.enemies[enemyIndex]!
    const targets = e.def.splitInto ?? []
    if (
      (e.statuses.split ?? 0) > 0 &&
      targets.length > 0 &&
      e.hp * 2 <= e.def.maxHp &&
      livingCount(s) - 1 + targets.length <= MAX_ENEMIES
    ) {
      const rest = e.hp
      e.hp = 0
      const spawned = targets.map((def) => spawnEnemy(s, def, events, rest))
      events.push({ type: 'enemySplit', enemyIndex, spawned })
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
  owner.statuses[id] = (owner.statuses[id] ?? 0) + stacks
  events.push({
    type: 'statusApplied',
    target: side,
    status: id,
    stacks,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
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
  events.push({
    type: 'healed',
    target: side,
    amount: gained,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
  if (side === 'player' && gained > 0) fireRelics(s, 'onHealed', events)
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
}

/** 触发所有者身上带 hook 的状态（按注册表顺序） */
export function runTurnTriggers(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  hook: 'onTurnStart' | 'onTurnEnd',
  events: GameEvent[],
) {
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    const fn = def[hook]
    if (stacks <= 0 || !fn) continue
    const trigger = fn(stacks)
    events.push({
      type: 'statusTriggered',
      target: side,
      status: def.id,
      ...(side === 'enemy' ? { enemyIndex } : {}),
    })
    if (trigger.type === 'loseHp') loseHp(s, side, enemyIndex, trigger.amount, events)
    else if (trigger.type === 'heal') heal(s, side, enemyIndex, trigger.amount, events)
    else applyBlock(s, side, trigger.amount, events, enemyIndex)
  }
}

/** 所有者回合的衰减：tick 状态 -1，减到 0 移除 */
export function tickStatuses(s: BattleState, side: Side, enemyIndex: number, events: GameEvent[]) {
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    if (stacks <= 0 || def.decay !== 'tick') continue
    if (stacks > 1) owner.statuses[def.id] = stacks - 1
    else {
      delete owner.statuses[def.id]
      events.push({
        type: 'statusRemoved',
        target: side,
        status: def.id,
        ...(side === 'enemy' ? { enemyIndex } : {}),
      })
    }
  }
}

export function drawCards(s: BattleState, count: number, events: GameEvent[]) {
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      if (s.discardPile.length === 0) return
      const [pile, rngState] = shuffle(s.discardPile, s.rngState)
      s.drawPile = pile
      s.discardPile = []
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
export function resolveEffect(
  s: BattleState,
  effect: Effect,
  events: GameEvent[],
  x = 0,
  enemyIndex = 0,
) {
  switch (effect.type) {
    case 'damage': {
      const base = effect.perX ? effect.amount * x : effect.amount
      const bonus = (effect.woundBonus ?? 0) * countWounds(s)
      applyDamage(s, 'enemy', base + bonus, events, enemyIndex, { source: { side: 'player' } })
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
      else drawCards(s, total, events)
      const pus = s.player.statuses.pus ?? 0
      if (pus > 0) heal(s, 'player', 0, pus * n, events)
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
      if (effect.to === 'self') addStatus(s, 'player', 0, effect.status, effect.stacks, events)
      else if (effect.to === 'target')
        addStatus(s, 'enemy', enemyIndex, effect.status, effect.stacks, events)
      else
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) addStatus(s, 'enemy', i, effect.status, effect.stacks, events)
        })
      break
    case 'heal':
      heal(s, 'player', 0, effect.amount, events)
      break
    case 'loseHp':
      loseHp(s, 'player', 0, effect.amount, events)
      break
    case 'draw':
      drawCards(s, effect.count, events)
      break
    case 'gainEnergy':
      s.player.energy += effect.amount
      events.push({ type: 'energyGained', amount: effect.amount })
      break
  }
}
