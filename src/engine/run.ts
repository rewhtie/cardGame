import { createBattle, dispatch as dispatchBattle } from './battle'
import { evolveDeck, isForgeable, progressOf, rawId, upgradedId } from './enchant'
import {
  NO_OPTION_TEXT,
  optionDisabled,
  pickEvent,
  resolveOutcomes,
  type EventBattle,
  type EventDef,
  type EventState,
} from './event'
import { pickEncounter } from './encounter'
import { findNode, generateMap, type GameMap } from './map'
import { fieldHeal } from './potions'
import { generateShop, type ShopState } from './shop'
import { RELIC_RULES, cardOnAdd, relicNeedsPick, relicPotionSlots, resolveRelicPick } from './relics'
import { createRng, deriveSeed, sample } from './seed'
import type { Action, BattleState, CardDef, EncounterDef, EnemyDef, GameEvent } from './types'

export type RunScreen =
  | 'map'
  | 'ancient'
  | 'pick'
  | 'battle'
  | 'reward'
  | 'rest'
  | 'forge'
  | 'shop'
  | 'event'
  | 'eventPick'
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
  /** Boss 节点的敌人；缺省时用 enemies */
  boss?: EnemyDef
  /** 精英节点出的怪 */
  elite?: EnemyDef
  /** 普通战斗节点的怪物池：每个节点按种子固定出一只；缺省时用 enemies */
  monsters?: EnemyDef[]
  /** 固定遭遇（组合怪）：楼层命中时按概率优先于威胁值预算 */
  encounters?: EncounterDef[]
  /** 可作为卡牌奖励出现的卡牌 id */
  rewardCards?: string[]
  /** 通用无色牌的奖励候选：商店后 2 个卡位从这里抽，角色卡位会排除它们 */
  colorlessCards?: string[]
  potionIds?: string[]
  relicIds?: string[]
  /** 随机事件池；缺省时事件节点退回占位界面 */
  events?: EventDef[]
}

export interface RunState {
  seed: string
  map: GameMap
  /** 当前所在节点 id；null 表示尚未出发 */
  current: string | null
  visited: string[]
  /** 职业 id；缺省为默认职业 */
  character?: string
  player: { hp: number; maxHp: number }
  gold: number
  potions: string[]
  /** 待选择的药水：界面弹框让玩家决定拿走或放弃，清空前不应继续前进 */
  potionOffer?: string[]
  relics: string[]
  /** 遗物的跨战斗计数（钢笔尖、开心花等），缺省视为全部为 0 */
  relicState?: Record<string, number>
  /** 奖励界面上尚未领取的奖励 */
  rewards: Reward[]
  /** 先古房提供的三个遗物 */
  ancientChoices: string[]
  screen: RunScreen
  /** 遗物需要选牌时，等待选牌的遗物及选完后回到的界面（由遗物决定，与房间无关） */
  pendingRelic?: { id: string; back: RunScreen } | null
  /** 当前商店房间的商品 */
  shop?: ShopState | null
  /** 当前事件房间的进度 */
  event: EventState | null
  /** 本局已出现过的事件 id */
  seenEvents: string[]
  /** 事件触发的战斗：胜利后奖励追加 bonus，领完奖励即清除 */
  eventBattle?: EventBattle | null
  battle: BattleState | null
  content: RunContent
}

export type RunAction =
  | { type: 'chooseNode'; id: string; god?: boolean }
  /** 先古房三选一 */
  | { type: 'chooseAncient'; id: string }
  /** 遗物选牌界面：确认选择牌组中的这些牌（张数由遗物的 pick 规则决定） */
  | { type: 'pickCards'; deckIndexes: number[] }
  | { type: 'battle'; action: Action }
  /** 使用药水栏第 index 个药水；战斗中投掷类用 target 指定敌人下标，战斗外仅限纯回血药水 */
  | { type: 'usePotion'; index: number; target?: number }
  /** 丢弃药水栏第 index 个药水 */
  | { type: 'discardPotion'; index: number }
  /** 从待选药水中拿走第 index 瓶（药水栏需有空位） */
  | { type: 'takePotion'; index: number }
  /** 放弃待选药水中的第 index 瓶；不传则全部放弃 */
  | { type: 'skipPotion'; index?: number }
  | { type: 'continue' }
  /** 领取第 index 项奖励；卡牌奖励需要用 pick 指定选哪一张 */
  | { type: 'claimReward'; index: number; pick?: number }
  | { type: 'finishRewards' }
  | { type: 'rest' }
  /** 火堆：进入锻造选牌界面 */
  | { type: 'openForge' }
  /** 火堆：锻造（升级）牌组中第 deckIndex 张牌 */
  | { type: 'forgeCard'; deckIndex: number }
  /** 火堆：职业专属选项（训练 / 药剂台 / 扎根） */
  | { type: 'campfireSpecial' }
  | { type: 'leave' }
  /** 商店：购买第 index 件商品 */
  | { type: 'buyShop'; kind: 'card' | 'relic' | 'potion'; index: number }
  /** 商店：付费删除牌组中第 deckIndex 张牌（每家商店一次） */
  | { type: 'shopRemove'; deckIndex: number }
  /** 事件：选第 index 个选项 */
  | { type: 'chooseEventOption'; index: number }
  /** 事件：在选牌界面选牌组中第 deckIndex 张牌（删除或升级，由事件决定） */
  | { type: 'eventPickCard'; deckIndex: number }
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
  /** 职业 id */
  character?: string
  /** 职业的初始遗物 */
  startRelics?: string[]
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
    ...(config.character && { character: config.character }),
    map: generateMap(config.seed),
    current: null,
    visited: [],
    player: { hp: maxHp, maxHp },
    gold: 0,
    potions: [],
    relics: [...(config.startRelics ?? [])],
    rewards: [],
    ancientChoices: [],
    screen: 'map',
    event: null,
    seenEvents: [],
    battle: null,
    content: {
      cards: config.cards,
      deck: config.deck,
      enemy: config.enemy,
      enemies: config.enemies,
      boss: config.boss,
      elite: config.elite,
      monsters: config.monsters,
      encounters: config.encounters,
      rewardCards: config.rewardCards,
      colorlessCards: config.colorlessCards,
      potionIds: config.potionIds,
      relicIds: config.relicIds,
      events: config.events,
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
    case 'boss':
      return startBattle(next, id)
    case 'rest':
      return { state: { ...next, screen: 'rest' }, events: [] }
    case 'ancient':
      return {
        state: { ...next, screen: 'ancient', ancientChoices: ANCIENT_RELIC_IDS },
        events: [],
      }
    case 'shop':
      return { state: { ...next, screen: 'shop', shop: generateShop(next) }, events: [] }
    case 'event': {
      if (!run.content.events?.length) return { state: { ...next, screen: 'placeholder' }, events: [] }
      const def = pickEvent(next, id)
      // 全部事件都见过后重新开始计数
      const allSeen = run.content.events.every((e) => run.seenEvents.includes(e.id))
      const seen = allSeen ? [] : run.seenEvents
      return {
        state: {
          ...next,
          screen: 'event',
          event: { id: def.id, result: [], pending: [], pick: null, optionIndex: null },
          seenEvents: [...new Set([...seen, def.id])],
        },
        events: [],
      }
    }
    default:
      return { state: { ...next, screen: 'placeholder' }, events: [] }
  }
}

/** 以当前节点创建一场战斗（地图战斗节点与事件战斗共用） */
function battleEnemies(run: RunState, nodeId: string): EnemyDef[] {
  const type = findNode(run.map, nodeId)?.type
  if (run.content.boss && !run.eventBattle && type === 'boss') return [run.content.boss]
  if (run.content.elite && !run.eventBattle && type === 'elite') return [run.content.elite]
  const pool = run.content.monsters
  if (pool?.length && !run.eventBattle && type === 'monster') {
    const floor = findNode(run.map, nodeId)?.floor ?? 1
    return pickEncounter(pool, floor, run.content.encounters ?? [], createRng(deriveSeed(run.seed, `enemy:${nodeId}`)))
  }
  return run.content.enemies ?? [run.content.enemy]
}

function startBattle(run: RunState, nodeId: string): RunResult {
  const { state: battle, events } = createBattle({
    seed: deriveSeed(run.seed, `battle:${nodeId}`),
    deck: run.content.deck,
    enemies: battleEnemies(run, nodeId),
    playerGold: run.gold,
    cards: run.content.cards,
    playerMaxHp: run.player.maxHp,
    playerHp: run.player.hp,
    relics: run.relics,
    relicState: run.relicState ?? {},
    ...(run.content.rewardCards && { discoverPool: run.content.rewardCards }),
  })
  return { state: { ...run, screen: 'battle', battle }, events }
}

function chooseAncient(run: RunState, id: string): RunResult {
  if (run.screen !== 'ancient') return invalid(run, '当前不在先古房')
  if (!run.ancientChoices.includes(id)) return invalid(run, '该遗物不可选')
  return acquireRelic({ ...run, screen: 'map', ancientChoices: [] }, id)
}

/**
 * 获得遗物的统一入口：需要选牌的遗物先进入选牌界面，选完才获得，
 * 选完回到当前界面；牌组里没有可选的牌时直接获得、无事发生。与所在房间无关。
 */
function acquireRelic(run: RunState, id: string): RunResult {
  const pickable = run.screen !== 'pick' && run.screen !== 'victory' && run.screen !== 'defeat'
  if (pickable && relicNeedsPick(run, id)) {
    return {
      state: { ...run, screen: 'pick', pendingRelic: { id, back: run.screen } },
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

function pickCards(run: RunState, deckIndexes: number[]): RunResult {
  const pending = run.pendingRelic
  if (run.screen !== 'pick' || !pending) return invalid(run, '当前不在选牌界面')
  const result = resolveRelicPick(run, pending.id, deckIndexes)
  if (!result) return invalid(run, '选择的牌不合法')
  return {
    state: {
      ...result.run,
      screen: pending.back,
      pendingRelic: null,
      relics: [...run.relics, pending.id],
    },
    events: [{ type: 'relicGained', id: pending.id, cards: result.cards }],
  }
}

function battleAction(run: RunState, action: Action): RunResult {
  if (run.screen !== 'battle' || !run.battle) return invalid(run, '当前不在战斗中')
  const { state: battle, events, pre } = dispatchBattle(run.battle, action)
  // 战斗里获得的药水（炼金）放进药水栏，栏满则丢失
  let potions = run.potions
  let settled = battle
  if (battle.newPotions?.length) {
    const room = Math.max(0, maxPotions(run.relics) - potions.length)
    potions = [...potions, ...battle.newPotions.slice(0, room)]
    settled = { ...battle, newPotions: [] }
  }
  return {
    state: { ...run, battle: settled, potions },
    events,
    ...(pre && { pre: { ...run, battle: pre } }),
  }
}

/** 战斗中使用第 index 个药水：效果由战斗引擎结算，成功后从药水栏消耗 */
function usePotion(run: RunState, index: number, target?: number): RunResult {
  const potionId = run.potions[index]
  if (potionId === undefined) return invalid(run, '药水不存在')
  if (run.screen !== 'battle' || !run.battle) {
    const heal = fieldHeal(potionId)
    if (heal === undefined || run.screen === 'victory' || run.screen === 'defeat')
      return invalid(run, '该药水只能在战斗中使用')
    const hp = Math.min(run.player.maxHp, run.player.hp + heal)
    return {
      state: { ...run, player: { ...run.player, hp }, potions: run.potions.filter((_, i) => i !== index) },
      events: [{ type: 'healed', target: 'player', amount: hp - run.player.hp }],
    }
  }
  const { state: battle, events } = dispatchBattle(run.battle, {
    type: 'usePotion',
    potionId,
    target,
  })
  if (events.some((e) => e.type === 'invalidAction')) return { state: run, events }
  const potions = run.potions.filter((_, i) => i !== index)
  return { state: { ...run, battle, potions }, events }
}

function discardPotion(run: RunState, index: number): RunResult {
  if (run.potions[index] === undefined) return invalid(run, '药水不存在')
  return { state: { ...run, potions: run.potions.filter((_, i) => i !== index) }, events: [] }
}

function takePotion(run: RunState, index: number): RunResult {
  const id = run.potionOffer?.[index]
  if (id === undefined) return invalid(run, '药水不存在')
  if (run.potions.length >= maxPotions(run.relics)) return invalid(run, '药水栏已满')
  return {
    state: {
      ...run,
      potions: [...run.potions, id],
      potionOffer: (run.potionOffer ?? []).filter((_, i) => i !== index),
    },
    events: [],
  }
}

function skipPotion(run: RunState, index?: number): RunResult {
  if (index === undefined) return { state: { ...run, potionOffer: [] }, events: [] }
  if (run.potionOffer?.[index] === undefined) return invalid(run, '药水不存在')
  return { state: { ...run, potionOffer: run.potionOffer.filter((_, i) => i !== index) }, events: [] }
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

  // 战斗内偷来的最大生命值随战斗结束还原：当前生命不超过整局的最大生命
  const player = { ...run.player, hp: Math.min(run.player.maxHp, battle.player.hp) }
  // 胜利（含敌人逃脱）后结算进化；战败不结算
  const evo = evolveDeck(run.content.cards, run.content.deck, battle.evolveCounts ?? {})
  const content = { ...run.content, deck: evo.deck }
  const evolvedEvents: GameEvent[] = evo.evolved.length ? [{ type: 'cardsEvolved', cards: evo.evolved }] : []
  if (battle.escaped) {
    // 敌人逃脱：没有奖励，被偷的金币拿不回来
    return {
      state: { ...run, content, screen: 'map', battle: null, player, gold: battle.gold, relicState: battle.relicState, rewards: [], eventBattle: null },
      events: evolvedEvents,
    }
  }
  const node = run.current ? findNode(run.map, run.current) : undefined
  const rewards = generateRewards({ ...run, content }, run.eventBattle?.kind ?? node?.type ?? 'monster')
  if (run.eventBattle?.bonus?.gold) {
    rewards.unshift({ type: 'gold', amount: run.eventBattle.bonus.gold })
  }
  if (run.eventBattle?.bonus?.relic) {
    const unowned = (run.content.relicIds ?? []).filter((id) => !run.relics.includes(id))
    const taken = new Set(rewards.flatMap((r) => (r.type === 'relic' ? [r.id] : [])))
    const rng = createRng(deriveSeed(run.seed, `eventRelic:${run.current}`))
    const [id] = sample(
      unowned.filter((r) => !taken.has(r)),
      1,
      rng,
    )
    if (id) rewards.push({ type: 'relic', id })
  }
  return { state: { ...run, content, screen: 'reward', battle: null, player, gold: battle.gold, relicState: battle.relicState, rewards }, events: evolvedEvents }
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
      return { state: { ...next, potionOffer: [...(run.potionOffer ?? []), reward.id] }, events: [] }
    case 'relic':
      return acquireRelic(next, reward.id)
    case 'cards': {
      if (pick === SKIP_PICK) return { state: next, events: [] }
      const cardId = pick === undefined ? undefined : reward.choices[pick]
      if (cardId === undefined) return invalid(run, '请选择一张卡牌')
      const content = { ...run.content, deck: [...run.content.deck, cardOnAdd(run, cardId)] }
      return { state: { ...next, content }, events: [] }
    }
  }
}

function finishRewards(run: RunState): RunResult {
  if (run.screen !== 'reward') return invalid(run, '当前不在奖励界面')
  const screen: RunScreen = run.current === 'boss' ? 'victory' : 'map'
  return { state: { ...run, screen, rewards: [], eventBattle: null, event: null }, events: [] }
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

/** 火堆的职业专属选项 */
export interface CampfireSpecial {
  name: string
  icon: string
  desc: string
}

export const TRAIN_PLAYS = 1
export const BREW_COUNT = 2
export const ROOT_RATIO = 0.2

export const CAMPFIRE_SPECIALS: Readonly<Record<string, CampfireSpecial>> = {
  swordSaint: { name: '训练', icon: '🥋', desc: `所有可成长的牌，成长进度 +${TRAIN_PLAYS}` },
  plagueDoctor: { name: '药剂台', icon: '⚗️', desc: `发现 ${BREW_COUNT} 瓶药水，自行选择拿走或放弃` },
  ancientTree: { name: '扎根', icon: '🌱', desc: `最大生命 +当前生命的 ${ROOT_RATIO * 100}%` },
}

/** 当前职业的火堆专属选项；没有则 null（界面隐藏） */
export const campfireSpecial = (run: RunState): CampfireSpecial | null =>
  CAMPFIRE_SPECIALS[run.character ?? ''] ?? null

/** 不能使用的原因；可用返回 null */
export function campfireSpecialBlocked(run: RunState): string | null {
  switch (run.character) {
    case 'swordSaint':
      return run.content.deck.some((c) => !!run.content.cards[rawId(c)]?.evolve) ? null : '没有可成长的牌'
    case 'plagueDoctor':
      return (run.content.potionIds ?? []).length ? null : '没有可制作的药水'
    case 'ancientTree':
      return null
    default:
      return '该职业没有专属选项'
  }
}

/** 火堆专属选项：用完直接回地图；存档只在地图 / 奖励界面写入，读档不会重复结算 */
function campfireSpecialUse(run: RunState): RunResult {
  if (run.screen !== 'rest') return invalid(run, '当前不在休息点')
  const blocked = campfireSpecialBlocked(run)
  if (blocked) return invalid(run, blocked)
  const done = (next: RunState, events: GameEvent[] = []): RunResult => ({
    state: { ...next, screen: 'map' },
    events,
  })
  switch (run.character) {
    case 'swordSaint': {
      const counts: Record<string, number> = {}
      run.content.deck.forEach((id, i) => {
        if (run.content.cards[rawId(id)]?.evolve) counts[`${id}#${i}`] = progressOf(id) + TRAIN_PLAYS
      })
      const evo = evolveDeck(run.content.cards, run.content.deck, counts)
      return done(
        { ...run, content: { ...run.content, deck: evo.deck } },
        evo.evolved.length ? [{ type: 'cardsEvolved', cards: evo.evolved }] : [],
      )
    }
    case 'plagueDoctor': {
      const rng = createRng(deriveSeed(run.seed, `campfire:${run.current}`))
      const pool = run.content.potionIds ?? []
      const made = sample(pool, Math.min(BREW_COUNT, pool.length), rng)
      // 与事件药水一致：进入待选列表，由玩家逐瓶决定拿走或放弃
      return done({ ...run, potionOffer: [...(run.potionOffer ?? []), ...made] })
    }
    default: {
      // 只涨上限，不回血
      const gain = Math.max(1, Math.round(run.player.hp * ROOT_RATIO + 1e-9))
      return done({ ...run, player: { ...run.player, maxHp: run.player.maxHp + gain } }, [{ type: 'maxHpGained', amount: gain }])
    }
  }
}

function openForge(run: RunState): RunResult {
  if (run.screen !== 'rest') return invalid(run, '当前不在休息点')
  if (!run.content.deck.some((c) => isForgeable(run.content.cards, c)))
    return invalid(run, '没有可锻造的牌')
  return { state: { ...run, screen: 'forge' }, events: [] }
}

function forgeCard(run: RunState, deckIndex: number): RunResult {
  if (run.screen !== 'forge') return invalid(run, '当前不在锻造界面')
  const cardId = run.content.deck[deckIndex]
  if (cardId === undefined || !isForgeable(run.content.cards, cardId))
    return invalid(run, '该牌不可锻造')
  const deck = run.content.deck.map((c, i) => (i === deckIndex ? upgradedId(c) : c))
  return {
    state: { ...run, screen: 'map', content: { ...run.content, deck } },
    events: [{ type: 'cardsUpgraded', cards: [{ from: cardId, to: deck[deckIndex] as string }] }],
  }
}

/** 事件：选第 index 个选项，扣除代价后结算结果 */
function chooseEventOption(run: RunState, index: number): RunResult {
  const ev = run.event
  const def = ev && run.content.events?.find((e) => e.id === ev.id)
  if (run.screen !== 'event' || !ev || !def) return invalid(run, '当前不在事件中')
  if (ev.optionIndex !== null) return invalid(run, '已经做出了选择')
  const opt = def.options[index]
  if (!opt) return invalid(run, '选项不存在')
  const reason = optionDisabled(run, opt)
  if (reason) return invalid(run, reason)

  const paid: RunState = {
    ...run,
    gold: run.gold - (opt.cost?.gold ?? 0),
    player: { ...run.player, hp: run.player.hp - (opt.cost?.hp ?? 0) },
    event: { ...ev, optionIndex: index, result: opt.outcomes.length === 0 ? [NO_OPTION_TEXT] : [] },
  }
  const costLines = [
    ...(opt.cost?.gold ? [`失去 ${opt.cost.gold} 金币`] : []),
    ...(opt.cost?.hp ? [`失去 ${opt.cost.hp} 点生命`] : []),
  ]
  const withCost = { ...paid, event: { ...paid.event!, result: [...costLines, ...paid.event!.result] } }
  const rng = createRng(deriveSeed(run.seed, `event:${run.current}:${index}`))
  const resolved = resolveOutcomes(withCost, opt.outcomes, rng, grantRelic)
  const costHp = opt.cost?.hp ?? 0
  return afterEventOutcomes(
    costHp > 0
      ? { ...resolved, events: [{ type: 'hpLost', amount: costHp }, ...resolved.events] }
      : resolved,
  )
}

/** 事件结果结算后：若触发了战斗则开战，否则停在事件界面 */
function afterEventOutcomes(r: RunResult): RunResult {
  if (r.state.screen === 'eventPick' || !r.state.eventBattle || r.state.screen === 'battle') return r
  const battle = startBattle(r.state, r.state.current as string)
  return { state: battle.state, events: [...r.events, ...battle.events] }
}

/** 事件选牌界面：删除或升级选中的牌，然后继续结算剩余结果 */
function eventPickCard(run: RunState, deckIndex: number): RunResult {
  const ev = run.event
  if (run.screen !== 'eventPick' || !ev || !ev.pick) return invalid(run, '当前不在选牌界面')
  const cardId = run.content.deck[deckIndex]
  if (cardId === undefined) return invalid(run, '牌不存在')
  const events: GameEvent[] = []
  let deck: string[]
  let line: string
  if (ev.pick === 'remove') {
    deck = run.content.deck.filter((_, i) => i !== deckIndex)
    line = `删除了 ${run.content.cards[rawId(cardId)]?.name ?? cardId}`
  } else {
    if (!isForgeable(run.content.cards, cardId)) return invalid(run, '该牌不可升级')
    deck = run.content.deck.map((c, i) => (i === deckIndex ? upgradedId(c) : c))
    events.push({ type: 'cardsUpgraded', cards: [{ from: cardId, to: deck[deckIndex] as string }] })
    line = `升级了 ${run.content.cards[rawId(cardId)]?.name ?? cardId}`
  }
  const pending = ev.pending
  const resumed: RunState = {
    ...run,
    screen: 'event',
    content: { ...run.content, deck },
    event: { ...ev, pick: null, pending: [], result: [...ev.result, line] },
  }
  const rng = createRng(deriveSeed(run.seed, `event:${run.current}:pick:${ev.result.length}`))
  const r = afterEventOutcomes(resolveOutcomes(resumed, pending, rng, grantRelic))
  return { ...r, events: [...events, ...r.events] }
}

function leave(run: RunState): RunResult {
  // 锻造界面返回火堆，可改选休息
  if (run.screen === 'forge') return { state: { ...run, screen: 'rest' }, events: [] }
  // 事件选完后才能离开
  if (run.screen === 'event') {
    if (run.event?.optionIndex == null) return invalid(run, '请先做出选择')
    return { state: { ...run, screen: 'map', event: null }, events: [] }
  }
  if (run.screen === 'shop') return { state: { ...run, screen: 'map', shop: null }, events: [] }
  if (run.screen !== 'rest' && run.screen !== 'placeholder') return invalid(run, '当前无法离开')
  return { state: { ...run, screen: 'map' }, events: [] }
}

function buyShop(run: RunState, kind: 'card' | 'relic' | 'potion', index: number): RunResult {
  const shop = run.shop
  if (run.screen !== 'shop' || !shop) return invalid(run, '当前不在商店')
  const list = kind === 'card' ? shop.cards : kind === 'relic' ? shop.relics : shop.potions
  const item = list[index]
  if (!item || item.sold) return invalid(run, '商品不存在')
  if (run.gold < item.price) return invalid(run, '金币不足')
  if (kind === 'potion' && run.potions.length >= maxPotions(run.relics))
    return invalid(run, '药水栏已满')

  const sold = list.map((it, i) => (i === index ? { ...item, sold: true } : it))
  const nextShop: ShopState = { ...shop, [kind === 'card' ? 'cards' : kind === 'relic' ? 'relics' : 'potions']: sold }
  const paid: RunState = { ...run, gold: run.gold - item.price, shop: nextShop }
  switch (kind) {
    case 'card':
      return { state: { ...paid, content: { ...paid.content, deck: [...paid.content.deck, cardOnAdd(paid, item.id)] } }, events: [] }
    case 'potion':
      return { state: { ...paid, potions: [...paid.potions, item.id] }, events: [] }
    case 'relic':
      return acquireRelic(paid, item.id)
  }
}

function shopRemove(run: RunState, deckIndex: number): RunResult {
  const shop = run.shop
  if (run.screen !== 'shop' || !shop) return invalid(run, '当前不在商店')
  if (shop.removed) return invalid(run, '本店已提供过删牌服务')
  if (run.gold < shop.removeCost) return invalid(run, '金币不足')
  if (run.content.deck[deckIndex] === undefined) return invalid(run, '牌不存在')
  return {
    state: {
      ...run,
      gold: run.gold - shop.removeCost,
      shop: { ...shop, removed: true },
      content: { ...run.content, deck: run.content.deck.filter((_, i) => i !== deckIndex) },
    },
    events: [],
  }
}

function cheatGrant(run: RunState, kind: 'card' | 'potion' | 'relic', id: string): RunResult {
  // 战斗中禁用一切加入卡组 / 获得物品的手段
  if (run.screen === 'battle') return invalid(run, '战斗中无法加入')
  switch (kind) {
    case 'card':
      return {
        state: { ...run, content: { ...run.content, deck: [...run.content.deck, cardOnAdd(run, id)] } },
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
    case 'pickCards':
      return pickCards(run, action.deckIndexes)
    case 'battle':
      return battleAction(run, action.action)
    case 'usePotion':
      return usePotion(run, action.index, action.target)
    case 'discardPotion':
      return discardPotion(run, action.index)
    case 'takePotion':
      return takePotion(run, action.index)
    case 'skipPotion':
      return skipPotion(run, action.index)
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
    case 'campfireSpecial':
      return campfireSpecialUse(run)
    case 'leave':
      return leave(run)
    case 'buyShop':
      return buyShop(run, action.kind, action.index)
    case 'shopRemove':
      return shopRemove(run, action.deckIndex)
    case 'chooseEventOption':
      return chooseEventOption(run, action.index)
    case 'eventPickCard':
      return eventPickCard(run, action.deckIndex)
  }
}
