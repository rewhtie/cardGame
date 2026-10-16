import { createBattle, dispatch as dispatchBattle } from './battle'
import { enchantedId, isEnchanted, isUpgraded, upgradedId } from './enchant'
import { findNode, generateMap, type GameMap } from './map'
import { RELIC_RULES, relicNeedsPick, relicPotionSlots } from './relics'
import { createRng, deriveSeed, sample } from './seed'
import type { Action, BattleState, CardDef, EnemyDef, GameEvent } from './types'

export type RunScreen =
  | 'map'
  | 'ancient'
  | 'enchant'
  | 'battle'
  | 'reward'
  | 'rest'
  | 'forge'
  | 'placeholder'
  | 'victory'
  | 'defeat'

/** 战斗胜利后的奖励项 */
export type Reward =
  | { type: 'gold'; amount: number }
  | { type: 'cards'; choices: string[] }
  | { type: 'potion'; id: string }
  | { type: 'relic'; id: string }

/** 由调用方注入的内容，引擎不依赖 data 目录 */
export interface RunContent {
  cards: Record<string, CardDef>
  deck: string[]
  enemy: EnemyDef
  /** 普通战斗的敌人组；缺省为只有 enemy 一只 */
  enemies?: EnemyDef[]
  /** 可作为卡牌奖励出现的卡牌 id */
  rewardCards?: string[]
  potionIds?: string[]
  relicIds?: string[]
}

export interface RunState {
  seed: string
  map: GameMap
  /** 当前所在节点 id；null 表示尚未出发 */
  current: string | null
  visited: string[]
  player: { hp: number; maxHp: number }
  gold: number
  potions: string[]
  relics: string[]
  /** 奖励界面上尚未领取的奖励 */
  rewards: Reward[]
  /** 先古房提供的三个遗物 */
  ancientChoices: string[]
  screen: RunScreen
  /** 遗物需要选牌时，等待选牌的遗物及选完后回到的界面（由遗物决定，与房间无关） */
  pendingRelic?: { id: string; back: RunScreen } | null
  battle: BattleState | null
  content: RunContent
}

export type RunAction =
  | { type: 'chooseNode'; id: string; god?: boolean }
  /** 先古房三选一 */
  | { type: 'chooseAncient'; id: string }
  /** 训练指南：选牌组中第 deckIndex 张牌附魔 */
  | { type: 'enchantCard'; deckIndex: number }
  | { type: 'battle'; action: Action }
  /** 战斗中使用药水栏第 index 个药水；投掷类用 target 指定敌人下标 */
  | { type: 'usePotion'; index: number; target?: number }
  | { type: 'continue' }
  /** 领取第 index 项奖励；卡牌奖励需要用 pick 指定选哪一张 */
  | { type: 'claimReward'; index: number; pick?: number }
  | { type: 'finishRewards' }
  | { type: 'rest' }
  /** 火堆：进入锻造选牌界面 */
  | { type: 'openForge' }
  /** 火堆：锻造（升级）牌组中第 deckIndex 张牌 */
  | { type: 'forgeCard'; deckIndex: number }
  | { type: 'leave' }
  /** 开发模式上帝模式：直接获得卡牌 / 药水 / 遗物（不检查屏幕） */
  | { type: 'cheatGrant'; kind: 'card' | 'potion' | 'relic'; id: string }

export interface RunResult {
  state: RunState
  events: GameEvent[]
  /** 战斗回合结束的中间状态：界面先显示它演出敌人行动，再切到 state */
  pre?: RunState
}

export interface RunConfig extends RunContent {
  seed: string
  playerMaxHp?: number
}

const DEFAULT_MAX_HP = 80
const REST_HEAL_RATIO = 0.3
export const MAX_POTIONS = 3
/** 药水栏位数：基础栏位 + 遗物加成 */
export const maxPotions = (relics: readonly string[]) => MAX_POTIONS + relicPotionSlots(relics)
/** 先古房固定提供的三个遗物 */
export const ANCIENT_RELIC_IDS = ['goldPouch', 'trainingGuide', 'roundShield']
/** claimReward 的 pick 传此值表示放弃这组卡牌奖励 */
export const SKIP_PICK = -1
const CARD_CHOICES = 3
const POTION_CHANCE = { monster: 0.3, elite: 0.7, boss: 1 } as const
const GOLD = { monster: 30, elite: 90, boss: 150 } as const

export function createRun(config: RunConfig): RunState {
  const maxHp = config.playerMaxHp ?? DEFAULT_MAX_HP
  return {
    seed: config.seed,
    map: generateMap(config.seed),
    current: null,
    visited: [],
    player: { hp: maxHp, maxHp },
    gold: 0,
    potions: [],
    relics: [],
    rewards: [],
    ancientChoices: [],
    screen: 'map',
    battle: null,
    content: {
      cards: config.cards,
      deck: config.deck,
      enemy: config.enemy,
      enemies: config.enemies,
      rewardCards: config.rewardCards,
      potionIds: config.potionIds,
      relicIds: config.relicIds,
    },
  }
}

/** 地图界面上当前可以选择的节点 id */
export function reachableIds(run: RunState): string[] {
  if (run.screen !== 'map') return []
  if (run.current === null) return (run.map.floors[0] ?? []).map((n) => n.id)
  return findNode(run.map, run.current)?.next ?? []
}

function invalid(state: RunState, reason: string): RunResult {
  return { state, events: [{ type: 'invalidAction', reason }] }
}

function chooseNode(run: RunState, id: string, god = false): RunResult {
  // 开发模式上帝模式：地图界面可进入任意节点
  const allowed = god ? run.screen === 'map' : reachableIds(run).includes(id)
  if (!allowed) return invalid(run, '该节点当前不可选择')
  const node = findNode(run.map, id)
  if (!node) return invalid(run, '节点不存在')

  const next: RunState = { ...run, current: id, visited: [...run.visited, id] }
  switch (node.type) {
    case 'monster':
    case 'elite':
    case 'boss': {
      const { state: battle, events } = createBattle({
        seed: deriveSeed(run.seed, `battle:${id}`),
        deck: run.content.deck,
        enemies: run.content.enemies ?? [run.content.enemy],
        cards: run.content.cards,
        playerMaxHp: run.player.maxHp,
        playerHp: run.player.hp,
        relics: run.relics,
      })
      return { state: { ...next, screen: 'battle', battle }, events }
    }
    case 'rest':
      return { state: { ...next, screen: 'rest' }, events: [] }
    case 'ancient':
      return {
        state: { ...next, screen: 'ancient', ancientChoices: ANCIENT_RELIC_IDS },
        events: [],
      }
    default:
      return { state: { ...next, screen: 'placeholder' }, events: [] }
  }
}

function chooseAncient(run: RunState, id: string): RunResult {
  if (run.screen !== 'ancient') return invalid(run, '当前不在先古房')
  if (!run.ancientChoices.includes(id)) return invalid(run, '该遗物不可选')
  return acquireRelic({ ...run, screen: 'map', ancientChoices: [] }, id)
}

/**
 * 获得遗物的统一入口：需要选牌的遗物（训练指南）先进入选牌界面，选完才获得，
 * 选完回到当前界面；牌组里没有可选的牌时直接获得、无事发生。与所在房间无关。
 */
function acquireRelic(run: RunState, id: string): RunResult {
  const pickable = run.screen !== 'enchant' && run.screen !== 'victory' && run.screen !== 'defeat'
  if (relicNeedsPick(id) && pickable && run.content.deck.some((c) => !isEnchanted(c))) {
    return {
      state: { ...run, screen: 'enchant', pendingRelic: { id, back: run.screen } },
      events: [],
    }
  }
  return grantRelic(run, id)
}

/** 获得遗物并结算"获得时"效果；遗物可重复获得（掉落池会排除已拥有的） */
export function grantRelic(run: RunState, id: string): RunResult {
  const rng = createRng(deriveSeed(run.seed, `relic:${id}`))
  const base: RunState = { ...run, relics: [...run.relics, id] }
  const { run: next, cards, heal } = RELIC_RULES[id]?.onAcquire?.(base, rng) ?? { run: base }
  return {
    state: next,
    events: [{ type: 'relicGained', id, ...(cards?.length && { cards }), ...(heal && { heal }) }],
  }
}

function enchantCard(run: RunState, deckIndex: number): RunResult {
  const pending = run.pendingRelic
  if (run.screen !== 'enchant' || !pending) return invalid(run, '当前不在附魔界面')
  const cardId = run.content.deck[deckIndex]
  if (cardId === undefined || isEnchanted(cardId)) return invalid(run, '该牌不可附魔')
  const deck = run.content.deck.map((c, i) => (i === deckIndex ? enchantedId(c) : c))
  return {
    state: {
      ...run,
      screen: pending.back,
      pendingRelic: null,
      relics: [...run.relics, pending.id],
      content: { ...run.content, deck },
    },
    events: [
      {
        type: 'relicGained',
        id: pending.id,
        cards: [{ from: cardId, to: deck[deckIndex] as string }],
      },
    ],
  }
}

function battleAction(run: RunState, action: Action): RunResult {
  if (run.screen !== 'battle' || !run.battle) return invalid(run, '当前不在战斗中')
  const { state: battle, events, pre } = dispatchBattle(run.battle, action)
  return {
    state: { ...run, battle },
    events,
    ...(pre && { pre: { ...run, battle: pre } }),
  }
}

/** 战斗中使用第 index 个药水：效果由战斗引擎结算，成功后从药水栏消耗 */
function usePotion(run: RunState, index: number, target?: number): RunResult {
  if (run.screen !== 'battle' || !run.battle) return invalid(run, '当前不在战斗中')
  const potionId = run.potions[index]
  if (potionId === undefined) return invalid(run, '药水不存在')
  const { state: battle, events } = dispatchBattle(run.battle, {
    type: 'usePotion',
    potionId,
    target,
  })
  if (events.some((e) => e.type === 'invalidAction')) return { state: run, events }
  const potions = run.potions.filter((_, i) => i !== index)
  return { state: { ...run, battle, potions }, events }
}

function continueRun(run: RunState): RunResult {
  const battle = run.battle
  if (run.screen !== 'battle' || !battle) return invalid(run, '当前不在战斗中')
  if (battle.phase === 'lost') {
    return {
      state: { ...run, screen: 'defeat', battle: null, player: { ...run.player, hp: 0 } },
      events: [],
    }
  }
  if (battle.phase !== 'won') return invalid(run, '战斗尚未结束')

  const player = { ...run.player, hp: battle.player.hp }
  const node = run.current ? findNode(run.map, run.current) : undefined
  const rewards = generateRewards(run, node?.type ?? 'monster')
  return { state: { ...run, screen: 'reward', battle: null, player, rewards }, events: [] }
}

function generateRewards(run: RunState, type: string): Reward[] {
  const rng = createRng(deriveSeed(run.seed, `reward:${run.current}`))
  const kind = type === 'elite' || type === 'boss' ? type : 'monster'
  const rewards: Reward[] = [{ type: 'gold', amount: GOLD[kind] }]

  // Boss 必掉遗物和药水；精英必掉遗物、70% 掉药水；普通怪物 30% 掉药水
  const potionDrop = kind === 'boss' || rng.float() < POTION_CHANCE[kind]
  if (potionDrop) {
    const [id] = sample(run.content.potionIds ?? [], 1, rng)
    if (id) rewards.push({ type: 'potion', id })
  }
  if (kind === 'boss' || kind === 'elite') {
    const unowned = (run.content.relicIds ?? []).filter((id) => !run.relics.includes(id))
    const [id] = sample(unowned, 1, rng)
    if (id) rewards.push({ type: 'relic', id })
  }

  const choices = sample(run.content.rewardCards ?? [], CARD_CHOICES, rng)
  if (choices.length > 0) rewards.push({ type: 'cards', choices })
  return rewards
}

function claimReward(run: RunState, index: number, pick?: number): RunResult {
  if (run.screen !== 'reward') return invalid(run, '当前不在奖励界面')
  const reward = run.rewards[index]
  if (!reward) return invalid(run, '奖励不存在')

  const rewards = run.rewards.filter((_, i) => i !== index)
  const next: RunState = { ...run, rewards }
  switch (reward.type) {
    case 'gold':
      return { state: { ...next, gold: run.gold + reward.amount }, events: [] }
    case 'potion':
      if (run.potions.length >= maxPotions(run.relics)) return invalid(run, '药水栏已满')
      return { state: { ...next, potions: [...run.potions, reward.id] }, events: [] }
    case 'relic':
      return acquireRelic(next, reward.id)
    case 'cards': {
      if (pick === SKIP_PICK) return { state: next, events: [] }
      const cardId = pick === undefined ? undefined : reward.choices[pick]
      if (cardId === undefined) return invalid(run, '请选择一张卡牌')
      const content = { ...run.content, deck: [...run.content.deck, cardId] }
      return { state: { ...next, content }, events: [] }
    }
  }
}

function finishRewards(run: RunState): RunResult {
  if (run.screen !== 'reward') return invalid(run, '当前不在奖励界面')
  const screen: RunScreen = run.current === 'boss' ? 'victory' : 'map'
  return { state: { ...run, screen, rewards: [] }, events: [] }
}

function rest(run: RunState): RunResult {
  if (run.screen !== 'rest') return invalid(run, '当前不在休息点')
  const heal = Math.floor(run.player.maxHp * REST_HEAL_RATIO)
  const hp = Math.min(run.player.maxHp, run.player.hp + heal)
  return {
    state: { ...run, screen: 'map', player: { ...run.player, hp } },
    events: [{ type: 'healed', target: 'player', amount: hp - run.player.hp }],
  }
}

function openForge(run: RunState): RunResult {
  if (run.screen !== 'rest') return invalid(run, '当前不在休息点')
  if (!run.content.deck.some((c) => !isUpgraded(c))) return invalid(run, '没有可锻造的牌')
  return { state: { ...run, screen: 'forge' }, events: [] }
}

function forgeCard(run: RunState, deckIndex: number): RunResult {
  if (run.screen !== 'forge') return invalid(run, '当前不在锻造界面')
  const cardId = run.content.deck[deckIndex]
  if (cardId === undefined || isUpgraded(cardId)) return invalid(run, '该牌不可锻造')
  const deck = run.content.deck.map((c, i) => (i === deckIndex ? upgradedId(c) : c))
  return {
    state: { ...run, screen: 'map', content: { ...run.content, deck } },
    events: [{ type: 'cardsUpgraded', cards: [{ from: cardId, to: deck[deckIndex] as string }] }],
  }
}

function leave(run: RunState): RunResult {
  // 锻造界面返回火堆，可改选休息
  if (run.screen === 'forge') return { state: { ...run, screen: 'rest' }, events: [] }
  if (run.screen !== 'rest' && run.screen !== 'placeholder') return invalid(run, '当前无法离开')
  return { state: { ...run, screen: 'map' }, events: [] }
}

function cheatGrant(run: RunState, kind: 'card' | 'potion' | 'relic', id: string): RunResult {
  // 战斗中禁用一切加入卡组 / 获得物品的手段
  if (run.screen === 'battle') return invalid(run, '战斗中无法加入')
  switch (kind) {
    case 'card':
      return {
        state: { ...run, content: { ...run.content, deck: [...run.content.deck, id] } },
        events: [],
      }
    case 'potion':
      if (run.potions.length >= maxPotions(run.relics)) return invalid(run, '药水栏已满')
      return { state: { ...run, potions: [...run.potions, id] }, events: [] }
    case 'relic':
      return acquireRelic(run, id)
  }
}

export function dispatchRun(run: RunState, action: RunAction): RunResult {
  switch (action.type) {
    case 'cheatGrant':
      return cheatGrant(run, action.kind, action.id)
    case 'chooseNode':
      return chooseNode(run, action.id, action.god)
    case 'chooseAncient':
      return chooseAncient(run, action.id)
    case 'enchantCard':
      return enchantCard(run, action.deckIndex)
    case 'battle':
      return battleAction(run, action.action)
    case 'usePotion':
      return usePotion(run, action.index, action.target)
    case 'continue':
      return continueRun(run)
    case 'claimReward':
      return claimReward(run, action.index, action.pick)
    case 'finishRewards':
      return finishRewards(run)
    case 'rest':
      return rest(run)
    case 'openForge':
      return openForge(run)
    case 'forgeCard':
      return forgeCard(run, action.deckIndex)
    case 'leave':
      return leave(run)
  }
}
