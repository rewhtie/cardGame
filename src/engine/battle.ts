import {
  addCardsToDiscard,
  addStatus,
  applyBlock,
  clearTurnEndStatuses,
  applyDamage,
  draft,
  drawCards,
  firstLivingEnemy,
  isAlive,
  loseHp,
  resolveEffect,
  spawnEnemy,
  runTurnTriggers,
  tickStatuses,
} from './effects'
import { growCard, isEnchanted, resolveCards, toInstanceIds } from './enchant'
import { POTION_RULES } from './potions'
import { fireRelics, modifyEffect, relicMaxEnergy } from './relics'
import { shuffle } from './rng'
import { calcAttack } from './statuses'
import type { Action, BattleConfig, BattleState, DispatchResult, GameEvent } from './types'

const DEFAULT_MAX_HP = 80
const DEFAULT_MAX_ENERGY = 3
const DEFAULT_HAND_SIZE = 5

function startPlayerTurn(s: BattleState, events: GameEvent[]) {
  s.turn += 1
  s.phase = 'player'
  s.player.block = 0
  s.player.energy = s.player.maxEnergy
  events.push({ type: 'turnStarted', turn: s.turn })
  runTurnTriggers(s, 'player', 0, 'onTurnStart', events)
  if (s.player.hp <= 0) return
  const beak = s.player.statuses.plagueBeak ?? 0
  if (beak > 0) {
    const wounds = s.discardPile.filter((c) => c === 'wound').length
    addStatus(s, 'player', 0, 'strength', Math.floor(wounds / 3) * beak, events)
  }
  fireRelics(s, 'onTurnStart', events)
  drawCards(s, s.handSize, events)
}

function endBattleIfOver(s: BattleState, events: GameEvent[]): boolean {
  if (!s.enemies.some(isAlive)) {
    s.phase = 'won'
    fireRelics(s, 'onBattleWon', events)
    events.push({ type: 'battleEnded', result: 'won' })
    return true
  }
  if (s.player.hp <= 0) {
    s.phase = 'lost'
    events.push({ type: 'battleEnded', result: 'lost' })
    return true
  }
  return false
}

export function createBattle(config: BattleConfig): DispatchResult {
  const deck = toInstanceIds(config.deck)
  const [drawPile, rngState] = shuffle(deck, config.seed >>> 0)
  const maxHp = config.playerMaxHp ?? DEFAULT_MAX_HP
  const relics = config.relics ?? []
  const maxEnergy = (config.maxEnergy ?? DEFAULT_MAX_ENERGY) + relicMaxEnergy(relics)
  const s: BattleState = {
    turn: 0,
    phase: 'player',
    player: {
      hp: config.playerHp ?? maxHp,
      maxHp,
      block: 0,
      energy: maxEnergy,
      maxEnergy,
      statuses: {},
    },
    enemies: (config.enemies ?? (config.enemy ? [config.enemy] : [])).map((def) => ({
      def,
      hp: def.maxHp,
      block: 0,
      intentIndex: 0,
      statuses: { ...def.startStatuses },
    })),
    cards: resolveCards(config.cards, deck),
    drawPile,
    hand: [],
    discardPile: [],
    exhaustPile: [],
    handSize: config.handSize ?? DEFAULT_HAND_SIZE,
    relics,
    relicState: { ...config.relicState },
    rngState,
    gold: config.playerGold ?? 0,
  }
  const events: GameEvent[] = []
  fireRelics(s, 'onBattleStart', events)
  startPlayerTurn(s, events)
  return { state: s, events }
}

function invalid(state: BattleState, reason: string): DispatchResult {
  return { state, events: [{ type: 'invalidAction', reason }] }
}

function playCard(state: BattleState, handIndex: number, target?: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const cardId = state.hand[handIndex]
  if (!Number.isInteger(handIndex) || cardId === undefined) return invalid(state, '手牌索引无效')
  const card = state.cards[cardId]
  if (!card) return invalid(state, `未知卡牌 ${cardId}`)
  if (card.unplayable) return invalid(state, '这张牌无法打出')
  if (card.cost !== 'X' && card.cost > state.player.energy) return invalid(state, '能量不足')

  // 单体攻击牌：未指定目标时打第一只存活的敌人
  let enemyIndex = 0
  if (card.target === 'enemy') {
    enemyIndex = target ?? firstLivingEnemy(state)
    const t = state.enemies[enemyIndex]
    if (!Number.isInteger(enemyIndex) || !t || !isAlive(t)) return invalid(state, '目标无效')
  }

  const s = draft(state)
  const events: GameEvent[] = [{ type: 'cardPlayed', cardId, handIndex }]
  // X 牌：花掉全部剩余能量，X = 花掉的能量 + 附魔加成
  const x = card.cost === 'X' ? s.player.energy + (card.xBonus ?? 0) : 0
  s.player.energy = card.cost === 'X' ? 0 : s.player.energy - card.cost
  s.hand.splice(handIndex, 1)
  if (card.kind === 'power') {
    // 能力牌：不进任何牌堆，效果由状态承担
  } else if (card.exhaust) s.exhaustPile.push(cardId)
  else s.discardPile.push(cardId)
  for (const effect of card.effects) {
    resolveEffect(s, modifyEffect(s, card, effect), events, x, enemyIndex)
  }
  fireRelics(s, 'onCardPlayed', events, card)
  if (isEnchanted(cardId)) {
    s.cards = { ...s.cards, [cardId]: growCard(card) }
    events.push({ type: 'cardEnchantGrew', cardId })
  }
  endBattleIfOver(s, events)
  return { state: s, events }
}

function endTurn(state: BattleState): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')

  const s = draft(state)
  const events: GameEvent[] = []

  for (const id of s.hand) {
    const lose = s.cards[id]?.endTurnLoseHp
    if (!lose) continue
    events.push({ type: 'cardTriggered', cardId: id })
    loseHp(s, 'player', 0, lose, events)
  }
  events.push({ type: 'handDiscarded', count: s.hand.length })
  s.discardPile.push(...s.hand)
  s.hand = []

  runTurnTriggers(s, 'player', 0, 'onTurnEnd', events)
  fireRelics(s, 'onTurnEnd', events)
  tickStatuses(s, 'player', 0, events)
  clearTurnEndStatuses(s, events)

  s.phase = 'enemy'
  s.enemies.forEach((enemy, enemyIndex) => {
    if (!isAlive(enemy) || s.player.hp <= 0) return
    enemy.block = 0
    runTurnTriggers(s, 'enemy', enemyIndex, 'onTurnStart', events)
    if (!isAlive(enemy)) return
    // 敌人在意图之前衰减：圆盾在意图里加的易伤才能撑过下一个玩家回合
    tickStatuses(s, 'enemy', enemyIndex, events)
    if (enemy.statuses.stunned) {
      delete enemy.statuses.stunned
      events.push({ type: 'statusRemoved', target: 'enemy', status: 'stunned', enemyIndex })
      return
    }
    const intent = enemy.def.intents[enemy.intentIndex]
    if (!intent) return
    events.push({ type: 'enemyActed', intent, enemyIndex })
    switch (intent.type) {
      case 'attack': {
        const dmg = calcAttack(intent.damage, enemy.statuses, s.player.statuses)
        const perfect = dmg > 0 && s.player.block >= dmg
        applyDamage(s, 'player', intent.damage, events, 0, { source: { side: 'enemy', enemyIndex } })
        if (perfect) {
          events.push({ type: 'perfectBlock' })
          fireRelics(s, 'onPerfectBlock', events, enemyIndex)
          if (enemy.statuses.carapace) addStatus(s, 'enemy', enemyIndex, 'stunned', 1, events)
        }
        if (intent.addCards) addCardsToDiscard(s, intent.addCards.cardId, intent.addCards.count, events)
        break
      }
      case 'defend':
        applyBlock(s, 'enemy', intent.block, events, enemyIndex)
        break
      case 'debuff':
        addStatus(s, 'player', 0, intent.status, intent.stacks, events)
        break
      case 'buff':
        addStatus(s, 'enemy', enemyIndex, intent.status, intent.stacks, events)
        break
      case 'addCards':
        addCardsToDiscard(s, intent.cardId, intent.count, events)
        break
      case 'idle':
        break
      case 'summon':
        spawnEnemy(s, intent.enemy, events)
        break
      case 'steal': {
        const amount = Math.min(s.gold, intent.amount)
        s.gold -= amount
        enemy.stolenGold = (enemy.stolenGold ?? 0) + amount
        events.push({ type: 'goldStolen', amount, enemyIndex })
        break
      }
      case 'flee':
        enemy.hp = 0
        enemy.fled = true
        events.push({ type: 'enemyFled', enemyIndex })
        if (!s.enemies.some(isAlive)) s.escaped = true
        break
    }
    if (isAlive(enemy)) runTurnTriggers(s, 'enemy', enemyIndex, 'onTurnEnd', events)
    enemy.intentIndex = (enemy.intentIndex + 1) % enemy.def.intents.length
  })

  if (!endBattleIfOver(s, events)) {
    const pre = draft(s)
    startPlayerTurn(s, events)
    endBattleIfOver(s, events)
    return { state: s, events, pre }
  }
  return { state: s, events }
}

function usePotion(state: BattleState, potionId: string, target?: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const rule = POTION_RULES[potionId]
  if (!rule) return invalid(state, `未知药水 ${potionId}`)

  let enemyIndex = 0
  if (rule.target === 'enemy') {
    enemyIndex = target ?? firstLivingEnemy(state)
    const t = state.enemies[enemyIndex]
    if (!Number.isInteger(enemyIndex) || !t || !isAlive(t)) return invalid(state, '目标无效')
  }

  const s = draft(state)
  const events: GameEvent[] = [
    { type: 'potionUsed', potionId, ...(rule.target === 'enemy' && { enemyIndex }) },
  ]
  for (const effect of rule.effects) resolveEffect(s, effect, events, 0, enemyIndex)
  endBattleIfOver(s, events)
  return { state: s, events }
}

function cheatDamage(state: BattleState, amount: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const s = draft(state)
  const events: GameEvent[] = []
  s.enemies.forEach((_, i) => applyDamage(s, 'enemy', amount, events, i))
  endBattleIfOver(s, events)
  return { state: s, events }
}

function cheatDraw(state: BattleState, count: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const s = draft(state)
  const events: GameEvent[] = []
  drawCards(s, count, events)
  return { state: s, events }
}

function cheatEnergy(state: BattleState, amount: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const s = draft(state)
  s.player.energy += amount
  return { state: s, events: [] }
}

export function dispatch(state: BattleState, action: Action): DispatchResult {
  if (state.phase === 'won' || state.phase === 'lost') return invalid(state, '战斗已结束')
  switch (action.type) {
    case 'playCard':
      return playCard(state, action.handIndex, action.target)
    case 'endTurn':
      return endTurn(state)
    case 'usePotion':
      return usePotion(state, action.potionId, action.target)
    case 'cheatDamage':
      return cheatDamage(state, action.amount)
    case 'cheatDraw':
      return cheatDraw(state, action.count)
    case 'cheatEnergy':
      return cheatEnergy(state, action.amount)
  }
}
