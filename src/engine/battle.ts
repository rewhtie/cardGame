import {
  addCardsToDiscard,
  addStatus,
  applyBlock,
  convertCorpseBlock,
  parasiteTotal,
  spearStrip,
  stripEnemyBuff,
  heal,
  applyDamage,
  draft,
  drawCards,
  firstLivingEnemy,
  resolveCardEffect,
  isAlive,
  loseHp,
  resolveEffect,
  spawnCardInstance,
  spawnEnemy,
  livingCount,
  splitEnemies,
  willSplit,
  runTiming,
  shiftStatus,
  snapshotAttack,
  consumeAttackBuffs,
  guardOnAttack,
} from './effects'
import { growCard, progressOf, resolveCards, toInstanceIds } from './enchant'
import { POTION_RULES } from './potions'
import { fireRelics, modifyEffect, relicMaxEnergy } from './relics'
import { shuffle } from './rng'
import { attackBonusAt, intentIndexAt } from './intents'
import { calcBlock, STATUSES, statusById } from './statuses'
import { enemyAttack, hasDamage } from './blades'
import { afterPlay, playCost, SWORD_MANUAL } from './swordSaint'
import type { Action, BattleConfig, BattleState, DispatchResult, GameEvent, IntentAction, Side } from './types'

const DEFAULT_MAX_HP = 80
const DEFAULT_MAX_ENERGY = 3
const DEFAULT_HAND_SIZE = 5

function startPlayerTurn(s: BattleState, events: GameEvent[]) {
  s.turn += 1
  s.phase = 'player'
  s.commanded = []
  s.turnAttacks = 0
  s.turnSkills = 0
  s.turnDiscarded = false
  delete s.discarded
  s.player.block = 0
  const energyDown = s.player.statuses.energyDown ?? 0
  const drawDown = s.player.statuses.drawDown ?? 0
  s.player.energy = Math.max(0, s.player.maxEnergy - energyDown)
  if (energyDown) shiftStatus(s, 'player', 0, 'energyDown', -energyDown, events)
  if (drawDown) shiftStatus(s, 'player', 0, 'drawDown', -drawDown, events)
  events.push({ type: 'turnStarted', turn: s.turn })
  runTiming(s, 'playerStart', events)
  if (s.player.hp <= 0) return
  // 直觉：上回合存下的格挡（此时直觉标记已清空，不会再被存走）
  const stored = s.player.statuses.intuitionStore ?? 0
  if (stored > 0) {
    delete s.player.statuses.intuitionStore
    events.push({ type: 'statusRemoved', target: 'player', status: 'intuitionStore' })
    applyBlock(s, 'player', stored, events)
  }
  turnStartPassives(s, 'player', 0, events)
  fireRelics(s, 'onTurnStart', events)
  drawCards(s, Math.max(0, s.handSize - drawDown), events)
}

/** 回合开始的被动：瘟疫之喙（弃牌堆伤口 → 力量）、古树之躯（全场寄生 → 荆棘）。玩家、敌人带着都生效 */
function turnStartPassives(s: BattleState, side: 'player' | 'enemy', idx: number, events: GameEvent[]) {
  const st = side === 'player' ? s.player.statuses : s.enemies[idx]!.statuses
  const beak = st.plagueBeak ?? 0
  if (beak > 0) {
    const wounds = s.discardPile.filter((c) => c === 'wound').length
    addStatus(s, side, idx, 'strength', Math.floor(wounds / 3) * beak, events)
  }
  const body = st.ancientBody ?? 0
  if (body > 0) addStatus(s, side, idx, 'thorns', Math.floor(parasiteTotal(s) / 4) * body, events)
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
  const deck = toInstanceIds(config.deck, config.cards)
  const [shuffled, rngState] = shuffle(deck, config.seed >>> 0)
  // 固有：开局先抽到手里（洗牌之后把固有牌挪到抽牌堆顶）
  const cards = resolveCards(config.cards, deck)
  const innate = (id: string) => !!cards[id]?.innate
  const drawPile = [...shuffled.filter(innate), ...shuffled.filter((c) => !innate(c))]
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
    cards,
    evolveCounts: {},
    drawPile,
    hand: [],
    discardPile: [],
    exhaustPile: [],
    handSize: config.handSize ?? DEFAULT_HAND_SIZE,
    relics,
    relicState: { ...config.relicState },
    rngState,
    gold: config.playerGold ?? 0,
    ...(config.discoverPool && { discoverPool: config.discoverPool }),
  }
  const events: GameEvent[] = []
  fireRelics(s, 'onBattleStart', events)
  startPlayerTurn(s, events)
  return { state: s, events }
}

/** 出牌结算完后，存活敌人身上的"汲取"类被动削弱玩家的力量和敏捷，削弱量记在玩家的"枯竭"上 */
function drainPlayer(s: BattleState, events: GameEvent[]) {
  for (const enemy of s.enemies) {
    if (!isAlive(enemy)) continue
    for (const def of STATUSES) {
      const stacks = enemy.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.afterPlayerCard) continue
      const d = def.afterPlayerCard(stacks)
      shiftStatus(s, 'player', 0, 'strength', -d.strength, events)
      shiftStatus(s, 'player', 0, 'dexterity', -d.dexterity, events)
      shiftStatus(s, 'player', 0, 'drained', d.strength, events)
    }
  }
}

/** 出牌结算完后，存活敌人身上带 onPlayerCard 的被动给自己加层（如雕像的"受创"） */
function crackEnemies(s: BattleState, events: GameEvent[]) {
  s.enemies.forEach((enemy, enemyIndex) => {
    if (!isAlive(enemy)) return
    for (const def of STATUSES) {
      const stacks = enemy.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.onPlayerCard) continue
      const r = def.onPlayerCard(stacks)
      addStatus(s, 'enemy', enemyIndex, r.status, r.stacks, events)
    }
  })
}

/** 透支：打出的当回合结束先记下「已过一回合」，下个回合结束时把透支的力量还回去 */
function restoreOverdraft(s: BattleState, events: GameEvent[]) {
  for (const [status, stat] of [['overdraft', 'strength'], ['overdraftDex', 'dexterity']] as const) {
    const n = s.player.statuses[status] ?? 0
    if (n <= 0) continue
    const wait = `wait:${status}`
    if (!s.player.statuses[wait]) {
      s.player.statuses[wait] = 1
      continue
    }
    delete s.player.statuses[wait]
    shiftStatus(s, 'player', 0, stat, n, events)
    shiftStatus(s, 'player', 0, status, -n, events)
  }
}

/** 玩家回合结束：把本回合被汲取的力量和敏捷加回去 */
function restoreDrained(s: BattleState, events: GameEvent[]) {
  const n = s.player.statuses.drained ?? 0
  if (n <= 0) return
  shiftStatus(s, 'player', 0, 'strength', n, events)
  shiftStatus(s, 'player', 0, 'dexterity', n, events)
  shiftStatus(s, 'player', 0, 'drained', -n, events)
}

function invalid(state: BattleState, reason: string): DispatchResult {
  return { state, events: [{ type: 'invalidAction', reason }] }
}

function playCard(state: BattleState, handIndex: number, target?: number, pick?: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const cardId = state.hand[handIndex]
  if (!Number.isInteger(handIndex) || cardId === undefined) return invalid(state, '手牌索引无效')
  const card = state.cards[cardId]
  if (!card) return invalid(state, `未知卡牌 ${cardId}`)
  if (card.unplayable) return invalid(state, '这张牌无法打出')
  if (state.pending) return invalid(state, '请先完成当前的选择')
  const paid = playCost(state, card)
  if (!paid.free && card.cost !== 'X' && card.cost > state.player.energy) return invalid(state, '能量不足')

  // 单体攻击牌：未指定目标时打第一只存活的敌人；群体牌不选目标，非目标类的检查 / 效果按第一只存活敌人算
  let enemyIndex = 0
  if (card.target === 'allEnemies') {
    enemyIndex = firstLivingEnemy(state)
    if (enemyIndex < 0) return invalid(state, '没有可攻击的敌人')
  } else if (card.target === 'enemy') {
    enemyIndex = target ?? firstLivingEnemy(state)
    const t = state.enemies[enemyIndex]
    if (!Number.isInteger(enemyIndex) || !t || !isAlive(t)) return invalid(state, '目标无效')
  }

  for (const effect of card.effects) {
    if (effect.type === 'convertCorpse') {
      const why = convertCorpseBlock(state, enemyIndex)
      if (why) return invalid(state, why)
    } else if (effect.type === 'devourParasite') {
      if ((state.enemies[enemyIndex]?.statuses.parasite ?? 0) <= 0) return invalid(state, '目标没有寄生层数')
    } else if (effect.type === 'purgeSelfBuff') {
      const has = Object.entries(state.player.statuses).some(([id, n]) => statusById[id] && n > 0)
      if (!has) return invalid(state, '自身没有可移除的状态')
    } else if (effect.type === 'consumeParasite') {
      if ((state.enemies[enemyIndex]?.statuses.parasite ?? 0) < effect.amount)
        return invalid(state, '寄生层数不足')
    }
  }

  // 需要选一张手牌里的状态牌消耗：pick 必须指向另一张状态牌
  const needsPick = card.effects.some((e) => e.type === 'exhaustStatusCard')
  if (needsPick) {
    const picked = pick === undefined ? undefined : state.cards[state.hand[pick] ?? '']
    if (pick === undefined || pick === handIndex || picked?.rarity !== 'status')
      return invalid(state, '需要选择手牌中的一张状态牌')
  }

  const s = draft(state)
  const events: GameEvent[] = [{ type: 'cardPlayed', cardId, handIndex }]
  // X 牌：花掉全部剩余能量，X = 花掉的能量 + 附魔加成
  // 被剑意 / 剑流免费时不花能量；免费的 X 牌 X = 0，只剩附魔加成
  const x = card.cost === 'X' ? (paid.free ? 0 : s.player.energy) + (card.xBonus ?? 0) : 0
  if (!paid.free) s.player.energy = card.cost === 'X' ? 0 : s.player.energy - card.cost
  if (paid.viaIntent) shiftStatus(s, 'player', 0, 'swordIntent', -1, events)
  // 剑流免费：平时一次清空（只有 1 层）；有剑谱时每张只消耗 1 层，叠高的层数能连续用
  if (paid.viaFlow) {
    const flow = s.player.statuses.swordFlow ?? 0
    shiftStatus(s, 'player', 0, 'swordFlow', -(s.relics.includes(SWORD_MANUAL) ? 1 : flow), events)
  }
  if (card.evolve) {
    const counts = (s.evolveCounts ??= {})
    counts[cardId] = (counts[cardId] ?? progressOf(cardId)) + 1
  }
  const pickedId = needsPick && pick !== undefined ? s.hand[pick] : undefined
  s.hand.splice(handIndex, 1)
  if (pickedId !== undefined && pick !== undefined) {
    s.hand.splice(pick > handIndex ? pick - 1 : pick, 1)
    s.exhaustPile.push(pickedId)
  }
  if (card.kind === 'power') {
    // 能力牌：不进任何牌堆，效果由状态承担
  } else if (card.exhaust) s.exhaustPile.push(restoreId(cardId))
  else s.discardPile.push(restoreId(cardId))
  if (card.kind === 'skill') s.turnSkills = (s.turnSkills ?? 0) + 1
  if (card.kind === 'attack') {
    s.turnAttacks = (s.turnAttacks ?? 0) + 1
    if (card.target === 'enemy') stripEnemyBuff(s, enemyIndex, events)
    else if (card.target === 'allEnemies')
      s.enemies.forEach((e, i) => e.hp > 0 && stripEnemyBuff(s, i, events))
    guardOnAttack(s, 'player', 0, events)
  }
  // 感电 / 活力：打出前就有的层数才加成这张牌；用后消耗按持有者结算（见 consumeAttackBuffs）
  const before = snapshotAttack(s, 'player', 0)
  s.cardKill = false
  for (const effect of card.effects) {
    resolveCardEffect(s, card, modifyEffect(s, card, effect), events, x, enemyIndex, cardId)
  }
  // 蜕变：带成长的攻击牌斩杀（这张牌的伤害打死了敌人），该牌成长层数额外 +2
  if (card.evolve && card.kind === 'attack' && s.cardKill && s.relics.includes('metamorphosis')) {
    const counts = (s.evolveCounts ??= {})
    counts[cardId] = (counts[cardId] ?? progressOf(cardId)) + 2
  }
  if (card.effects.some((e) => e.type === 'playTop')) playTopCard(s, events)
  consumeAttackBuffs(s, 'player', 0, before, { damaging: hasDamage(card), attack: card.kind === 'attack' }, events)
  afterPlay(s, card, paid, events)
  fireRelics(s, 'onCardPlayed', events, card)
  flushDiscards(s, events)
  drainPlayer(s, events)
  crackEnemies(s, events)
  if (card.grow) {
    s.cards = { ...s.cards, [cardId]: growCard(card) }
    events.push({ type: 'cardEnchantGrew', cardId })
  }
  endBattleIfOver(s, events)
  return { state: s, events }
}

/** 把效果结算中主动弃掉的牌交给遗物（遗弃徽章）；回合结束的整手弃牌不算 */
function flushDiscards(s: BattleState, events: GameEvent[]) {
  const cards = s.discarded
  if (!cards?.length) return
  delete s.discarded
  fireRelics(s, 'onDiscard', events, cards)
}

/** 天命：无视费用打出抽牌堆顶的一张牌并将其消耗；不可打出的牌直接弃掉 */
function playTopCard(s: BattleState, events: GameEvent[]) {
  if (s.drawPile.length === 0 && s.discardPile.length > 0) {
    const [pile, rngState] = shuffle(s.discardPile, s.rngState)
    s.drawPile = pile
    s.discardPile = []
    s.rngState = rngState
    events.push({ type: 'reshuffled' })
  }
  const id = s.drawPile.shift()
  if (id === undefined) return
  const def = s.cards[id]
  const target = firstLivingEnemy(s)
  if (!def || def.unplayable || target < 0 || (def.target === 'enemy' && !s.enemies[target])) {
    s.discardPile.push(id)
    return
  }
  if (def.kind === 'power') {
    // 能力牌不进任何牌堆
  } else s.exhaustPile.push(id) // 天命打出的牌一律消耗
  if (def.kind === 'attack') {
    s.turnAttacks = (s.turnAttacks ?? 0) + 1
    if (def.target === 'enemy') stripEnemyBuff(s, target, events)
    else if (def.target === 'allEnemies')
      s.enemies.forEach((e, i) => e.hp > 0 && stripEnemyBuff(s, i, events))
  }
  const x = def.cost === 'X' ? (def.xBonus ?? 0) : 0
  for (const effect of def.effects) {
    if (effect.type === 'exhaustStatusCard') continue
    resolveCardEffect(s, def, modifyEffect(s, def, effect), events, x, target, id)
  }
}

/** 完成待选（净化 / 复制 / 预知 / 发现） */
function resolvePending(state: BattleState, picks: number[]): DispatchResult {
  const p = state.pending
  if (!p) return invalid(state, '当前没有待选择的内容')
  if (new Set(picks).size !== picks.length || picks.some((i) => !Number.isInteger(i) || i < 0))
    return invalid(state, '选择无效')
  const s = draft(state)
  const events: GameEvent[] = []
  if (p.kind === 'exhaust') {
    if (picks.length !== p.count || picks.some((i) => i >= s.hand.length)) return invalid(state, `需要选择 ${p.count} 张手牌`)
    const gone = new Set(picks)
    s.exhaustPile.push(...s.hand.filter((_, i) => gone.has(i)))
    s.hand = s.hand.filter((_, i) => !gone.has(i))
  } else if (p.kind === 'copy') {
    if (picks.length !== 1 || picks[0]! >= s.hand.length) return invalid(state, '需要选择一张手牌')
    const id = spawnCardInstance(s, s.hand[picks[0]!]!, 'c')
    s.hand.push(id)
    events.push({ type: 'cardDrawn', cardId: id })
  } else if (p.kind === 'retrieve') {
    if (picks.length !== p.count || picks.some((i) => i >= p.cards.length)) return invalid(state, `需要选择 ${p.count} 张牌`)
    const gone = new Set(picks.map((i) => p.slots[i]!))
    for (const k of gone) {
      const id = s.discardPile[k] as string
      s.hand.push(id)
      events.push({ type: 'cardDrawn', cardId: id })
    }
    s.discardPile = s.discardPile.filter((_, k) => !gone.has(k))
  } else if (p.kind === 'recover') {
    if (picks.length > 1 || picks.some((i) => i >= p.cards.length)) return invalid(state, '最多选择一张牌')
    if (picks.length === 1) {
      const id = p.cards[picks[0]!]
      const at = id === undefined ? -1 : s.discardPile.lastIndexOf(id)
      if (id !== undefined && at >= 0) {
        s.discardPile.splice(at, 1)
        s.hand.push(id)
        events.push({ type: 'cardDrawn', cardId: id })
      }
    }
  } else if (p.kind === 'scry') {
    if (picks.some((i) => i >= p.cards.length)) return invalid(state, '选择无效')
    const gone = new Set(picks)
    const top = s.drawPile.slice(0, p.cards.length)
    const tossed = top.filter((_, i) => gone.has(i))
    s.discardPile.push(...tossed)
    if (tossed.length) (s.discarded ??= []).push(...tossed)
    s.drawPile = [...top.filter((_, i) => !gone.has(i)), ...s.drawPile.slice(p.cards.length)]
  } else {
    if (picks.length !== 1 || picks[0]! >= p.options.length) return invalid(state, '需要选择一张牌')
    const id = spawnCardInstance(s, p.options[0 + picks[0]!]!, 'd', { cost: 0 })
    s.discovered = [...(s.discovered ?? []), id]
    s.hand.push(id)
    events.push({ type: 'cardDrawn', cardId: id })
  }
  delete s.pending
  flushDiscards(s, events)
  return { state: s, events }
}

/** 战斗外的自动选择（模拟 / 测试用）：净化优先伤害状态牌，预知不弃，复制 / 发现取第一个 */
export function autoResolve(state: BattleState): DispatchResult | null {
  const p = state.pending
  if (!p) return null
  let picks: number[] = []
  if (p.kind === 'exhaust') {
    const order = state.hand
      .map((id, i) => ({ i, bad: state.cards[id]?.rarity === 'status' || state.cards[id]?.rarity === 'curse' }))
      .sort((a, b) => Number(b.bad) - Number(a.bad))
    picks = order.slice(0, p.count).map((x) => x.i)
  } else if (p.kind === 'copy' || p.kind === 'discover') picks = [0]
  else if (p.kind === 'retrieve') picks = Array.from({ length: p.count }, (_, i) => i)
  return resolvePending(state, picks)
}

const COMMAND_AMOUNT = 6

function command(state: BattleState, index: number, choice: 'block' | 'attack' | 'devote'): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  const minion = state.minions?.[index]
  if (!minion || minion.hp <= 0) return invalid(state, '随从无效')
  if (state.commanded?.includes(index)) return invalid(state, '这只随从本回合已指挥过')
  const s = draft(state)
  const events: GameEvent[] = [{ type: 'commanded', minion: index, choice }]
  const m = s.minions![index]!
  s.commanded = [...(s.commanded ?? []), index]
  if (choice === 'block') applyBlock(s, 'player', calcBlock(COMMAND_AMOUNT, s.player.statuses), events)
  else if (choice === 'attack') {
    const target = firstLivingEnemy(s)
    if (target >= 0)
      applyDamage(s, 'enemy', COMMAND_AMOUNT, events, target, { source: { side: 'player' } })
  } else {
    m.hp -= COMMAND_AMOUNT
    heal(s, 'player', 0, COMMAND_AMOUNT, events)
    if (m.hp <= 0) events.push({ type: 'minionDied', minion: index })
  }
  endBattleIfOver(s, events)
  return { state: s, events }
}

/** 蓄势的成长实例（#g）离开手牌后变回原牌，下次重新从头累积 */
const restoreId = (id: string) => id.replace(/#g\d+$/, '')

/** 蓄势：每在手里保留一回合，第一段伤害 +retainGrow；按实例各自累积 */
function growRetained(s: BattleState, id: string): string {
  const def = s.cards[id]
  const grow = def?.retainGrow
  if (!def || !grow) return id
  let done = false
  const effects = def.effects.map((e) => {
    if (done || e.type !== 'damage') return e
    done = true
    return { ...e, amount: e.amount + grow }
  })
  const first = effects.find((e) => e.type === 'damage')
  const text = first && first.type === 'damage' ? def.text.replace(/\d+/, String(first.amount)) : def.text
  const newId = id.includes('#') ? id : spawnCardInstance(s, id, 'g')
  s.cards = { ...s.cards, [newId]: { ...def, id: newId, effects, text } }
  return newId
}

function endTurn(state: BattleState): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  if (state.pending) return invalid(state, '请先完成当前的选择')

  const s = draft(state)
  const events: GameEvent[] = []

  // 发现的牌只在本回合免费
  for (const id of s.discovered ?? []) {
    const base = s.cards[id.split('#')[0] as string]
    if (s.cards[id] && base) s.cards = { ...s.cards, [id]: { ...s.cards[id]!, cost: base.cost } }
  }
  delete s.discovered

  for (const id of s.hand) {
    const lose = s.cards[id]?.endTurnLoseHp
    if (!lose) continue
    events.push({ type: 'cardTriggered', cardId: id })
    loseHp(s, 'player', 0, lose, events)
  }
  const kept = s.hand.filter((id) => s.cards[id]?.retain)
  const dropped = s.hand.filter((id) => !s.cards[id]?.retain)
  events.push({ type: 'handDiscarded', count: dropped.length })
  s.discardPile.push(...dropped.map(restoreId))
  s.hand = kept.map((id) => growRetained(s, id))

  fireRelics(s, 'onTurnEnd', events)
  restoreDrained(s, events)
  restoreOverdraft(s, events)
  runTiming(s, 'playerEnd', events)

  s.phase = 'enemy'
  // 即将分裂的敌人意图被打断：本回合不行动，直接分裂（在行动前判定，避免召唤等改变数量）
  const splitting = new Set(
    s.enemies.flatMap((enemy, i) => (willSplit(enemy, livingCount(s)) ? [i] : [])),
  )
  runTiming(s, 'enemyStart', events)
  // 敌方回合开始：寄生等状态长层（在任何敌人行动之前）
  s.enemies.forEach((enemy, enemyIndex) => {
    if (!isAlive(enemy)) return
    // 营养：这次自增改为当前层数的 10%（至少比平时多 1 层），随后清零
    const fed = (enemy.statuses.nutrient ?? 0) > 0
    if (fed) {
      delete enemy.statuses.nutrient
      events.push({ type: 'statusRemoved', target: 'enemy', status: 'nutrient', enemyIndex })
    }
    for (const def of STATUSES) {
      const cur = enemy.statuses[def.id] ?? 0
      if (!def.turnStartGrow || cur <= 0) continue
      const grow =
        fed && def.id === 'parasite'
          ? Math.max(def.turnStartGrow + 1, Math.floor(cur * 0.1))
          : def.turnStartGrow
      // 生根：谁带着都算（玩家或任一敌人身上的层数累加）
      const root =
        def.id === 'parasite'
          ? (s.player.statuses.rootGrow ?? 0) + s.enemies.reduce((n, e) => n + (isAlive(e) ? (e.statuses.rootGrow ?? 0) : 0), 0)
          : 0
      addStatus(s, 'enemy', enemyIndex, def.id, grow + root, events)
    }
    turnStartPassives(s, 'enemy', enemyIndex, events)
  })
  s.enemies.forEach((enemy, enemyIndex) => {
    if (!isAlive(enemy) || s.player.hp <= 0 || splitting.has(enemyIndex)) return
    enemy.block = 0
    // 敌人在意图之前结算并衰减：圆盾在意图里加的易伤才能撑过下一个玩家回合
    runTiming(s, 'enemyStart', events, enemyIndex)
    if (!isAlive(enemy)) return
    // 晕眩可叠加：每层跳过一次行动，用完一层 -1，减到 0 移除
    const stunStacks = enemy.statuses.stunned ?? 0
    if (stunStacks > 0) {
      if (stunStacks > 1) enemy.statuses.stunned = stunStacks - 1
      else {
        delete enemy.statuses.stunned
        events.push({ type: 'statusRemoved', target: 'enemy', status: 'stunned', enemyIndex })
      }
      return
    }
    const intent = enemy.def.intents[enemy.intentIndex]
    if (!intent) return
    events.push({ type: 'enemyActed', intent, enemyIndex })
    // 主动作之后依次执行 also（同一回合的多个动作）；中途逃跑或玩家倒下则停止
    for (const act of [intent, ...(intent.also ?? [])] as IntentAction[]) {
      if (s.player.hp <= 0 || enemy.fled) break
      runIntentAction(act)
    }
    function runIntentAction(intent: IntentAction) {
    switch (intent.type) {
      case 'attack': {
        const hits = Math.max(1, intent.hits ?? 1)
        const hpBefore = s.player.hp
        for (let h = 0; h < hits && s.player.hp > 0; h++) {
          const base = intent.damage + attackBonusAt(enemy.def, enemy.turns ?? 0)
          // 传说中的长枪：敌人带着也一样，出手前剥掉玩家一个增益，自己本回合获得等量英勇
          if ((enemy.statuses.legendSpear ?? 0) > 0) spearStrip(s, 'player', 0, 'enemy', enemyIndex, events)
          // 感电 / 活力 / 英勇：敌人带着也一样，与玩家出牌共用同一套结算（见 effects.ts）
          const before = snapshotAttack(s, 'enemy', enemyIndex)
          const dmg = enemyAttack(base, enemy, s.player).damage
          const perfect = dmg > 0 && s.player.block >= dmg
          applyDamage(s, 'player', base, events, 0, { source: { side: 'enemy', enemyIndex } })
          if (perfect) {
            events.push({ type: 'perfectBlock' })
            fireRelics(s, 'onPerfectBlock', events, enemyIndex)
          }
          consumeAttackBuffs(s, 'enemy', enemyIndex, before, { damaging: true, attack: true }, events)
          guardOnAttack(s, 'enemy', enemyIndex, events)
        }
        // 完美防御：这次攻击（所有段）没有造成生命损伤（含伤害为 0），攻击者晕眩一回合
        // 舍身（敌人自带）与完美防御（玩家身上）都以此为条件
        const noHpLoss = s.player.hp >= hpBefore
        const guardStun = enemy.statuses.carapace ? 1 : 0
        const stun = Math.max(guardStun, s.player.statuses.perfectGuard ?? 0)
        if (noHpLoss && stun > 0) {
          addStatus(s, 'enemy', enemyIndex, 'stunned', stun, events)
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
    }
    runTiming(s, 'enemyEnd', events, enemyIndex)
    enemy.turns = (enemy.turns ?? 0) + 1
    enemy.intentIndex = intentIndexAt(enemy.def, enemy.turns)
  })

  if (s.player.hp > 0) runTiming(s, 'enemyEnd', events)
  if (s.player.hp > 0) splitEnemies(s, events)
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
  if (state.pending) return invalid(state, '请先完成当前的选择')
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

function cheatStatus(state: BattleState, side: Side, enemyIndex: number, status: string, stacks: number): DispatchResult {
  if (state.phase !== 'player') return invalid(state, '当前不是玩家回合')
  if (!statusById[status]) return invalid(state, `未知状态：${status}`)
  if (stacks === 0) return invalid(state, '层数不能为 0')
  const s = draft(state)
  const events: GameEvent[] = []
  if (stacks > 0) {
    addStatus(s, side, enemyIndex, status, stacks, events)
    return { state: s, events }
  }
  // 负数：扣层，扣到 0 以下直接移除（不会变成负的力量 / 敏捷）
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  const have = owner?.statuses[status] ?? 0
  if (!owner || have === 0) return { state: s, events }
  if (have + stacks <= 0) {
    delete owner.statuses[status]
    events.push({ type: 'statusRemoved', target: side, status, ...(side === 'enemy' ? { enemyIndex } : {}) })
  } else {
    shiftStatus(s, side, enemyIndex, status, stacks, events)
  }
  return { state: s, events }
}

export function dispatch(state: BattleState, action: Action): DispatchResult {
  if (state.phase === 'won' || state.phase === 'lost') return invalid(state, '战斗已结束')
  switch (action.type) {
    case 'playCard':
      return playCard(state, action.handIndex, action.target, action.pick)
    case 'endTurn':
      return endTurn(state)
    case 'resolve':
      return resolvePending(state, action.picks)
    case 'command':
      return command(state, action.minion, action.choice)
    case 'usePotion':
      return usePotion(state, action.potionId, action.target)
    case 'cheatDamage':
      return cheatDamage(state, action.amount)
    case 'cheatDraw':
      return cheatDraw(state, action.count)
    case 'cheatEnergy':
      return cheatEnergy(state, action.amount)
    case 'cheatStatus':
      return cheatStatus(state, action.side, action.enemyIndex, action.status, action.stacks)
  }
}
