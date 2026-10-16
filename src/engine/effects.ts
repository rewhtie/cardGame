import { shuffle } from './rng'
import { calcAttack, calcBlock, STATUSES, statusById } from './statuses'
import type { BattleState, Effect, GameEvent, Side } from './types'

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

export const isAlive = (e: { hp: number }) => e.hp > 0

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
  const hpLost = Math.min(t.hp, amount - blocked)
  t.hp -= hpLost
  events.push({
    type: 'damageDealt',
    target,
    amount: hpLost,
    blocked,
    ...(target === 'enemy' ? { enemyIndex } : {}),
  })

  const src = opts.source
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
    case 'damage':
      applyDamage(s, 'enemy', effect.perX ? effect.amount * x : effect.amount, events, enemyIndex, {
        source: { side: 'player' },
      })
      break
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
    case 'draw':
      drawCards(s, effect.count, events)
      break
    case 'gainEnergy':
      s.player.energy += effect.amount
      events.push({ type: 'energyGained', amount: effect.amount })
      break
  }
}
