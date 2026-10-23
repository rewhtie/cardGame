import { addStatus, applyBlock, applyDamage, countWounds, drawCards, heal, isAlive, WOUND } from './effects'
import { isForgeable, isUpgraded, rawId, resolveCards, upgradedId, withEnchant } from './enchant'
import { canEnchant } from './enchants'
import { sample, type Rng } from './seed'
import type { RunState } from './run'
import type { BattleState, CardDef, Effect, GameEvent } from './types'

/** 战斗中的遗物钩子：在对应时机由 battle 统一触发，遗物只声明自己关心的时机 */
export interface BattleHooks {
  onBattleStart(s: BattleState, events: GameEvent[]): void
  /** 玩家回合开始（状态结算之后、抽牌之前） */
  onTurnStart(s: BattleState, events: GameEvent[]): void
  onTurnEnd(s: BattleState, events: GameEvent[]): void
  onBattleWon(s: BattleState, events: GameEvent[]): void
  /** 完美格挡：enemyIndex 为发动攻击的敌人 */
  onPerfectBlock(s: BattleState, events: GameEvent[], enemyIndex: number): void
  /** 玩家实际恢复了生命之后 */
  onHealed(s: BattleState, events: GameEvent[]): void
  /** 一张牌的效果结算完之后 */
  onCardPlayed(s: BattleState, events: GameEvent[], card: CardDef): void
  /** 效果让玩家主动弃牌之后（换手 / 预知等；回合结束的整手弃牌不算） */
  onDiscard(s: BattleState, events: GameEvent[], cards: string[]): void
}

/** 钩子在 (s, events) 之外的额外参数 */
type HookExtra<K extends keyof BattleHooks> =
  Parameters<BattleHooks[K]> extends [unknown, unknown, ...infer R] ? R : never

/** 获得遗物时的结算结果：cards / heal 用于界面演出 */
export interface AcquireResult {
  run: RunState
  cards?: { from: string; to: string }[]
  heal?: number
}

/** 遗物获得时的选牌规则：选 count 张满足 eligible 的牌，每张牌经 apply 变成新牌 id */
export interface PickSpec {
  /** 选牌界面的提示文案 */
  hint: string
  count: number
  eligible(cardId: string, cards: Readonly<Record<string, CardDef>>): boolean
  apply(cardId: string): string
}

export interface RelicRule extends Partial<BattleHooks> {
  /** 在遗物图标右下角显示 relicState 里的计数 */
  showCounter?: boolean
  /** 最大能量加成 */
  maxEnergy?: number
  /** 药水栏位加成 */
  potionSlots?: number
  /** 洗牌时弃牌堆里的伤口留在原处，不进抽牌堆 */
  keepWounds?: boolean
  /** 获得时需要玩家先选牌（选完才获得）；无法让玩家选时（作弊发放等）由 onAcquire 随机选 */
  pick?: PickSpec
  /** 改写出牌时即将结算的效果（如伤害翻倍） */
  modifyEffect?(s: BattleState, card: CardDef, effect: Effect): Effect
  /** 获得时的一次性结算 */
  onAcquire?(run: RunState, rng: Rng): AcquireResult
  /** 获得之后，加入牌组的该种类的牌自动升级（不回头改已有的牌） */
  upgradeOnAdd?: CardDef['kind']
}

/** 遗物的计数 / 标记存放处：BattleState.relicState[id] */
const getState = (s: BattleState, id: string) => s.relicState[id] ?? 0

/** 计数 +1；到达 every 时清零并返回 true */
function tickCounter(s: BattleState, id: string, every: number): boolean {
  const n = getState(s, id) + 1
  const fire = n >= every
  s.relicState = { ...s.relicState, [id]: fire ? 0 : n }
  return fire
}

const PEN_NIB_EVERY = 10
const WHETSTONE_CARDS = 2
const WAR_PAINT_CARDS = 2

/** 获得时随机升级牌组里 count 张指定种类、尚未升级的牌 */
function upgradeRandomCards(kind: CardDef['kind'], count: number): NonNullable<RelicRule['onAcquire']> {
  return (run, rng) => {
    const idx = run.content.deck
      .map((_, i) => i)
      .filter((i) => {
        const c = run.content.deck[i] as string
        return !isUpgraded(c) && run.content.cards[rawId(c)]?.kind === kind
      })
    const picked = new Set(sample(idx, count, rng))
    const cards: { from: string; to: string }[] = []
    const deck = run.content.deck.map((c, i) => {
      if (!picked.has(i)) return c
      cards.push({ from: c, to: upgradedId(c) })
      return upgradedId(c)
    })
    return { run: { ...run, content: { ...run.content, deck } }, cards }
  }
}
const STRAWBERRY_HP = 7
const woundsIn = (pile: readonly string[]) => pile.filter((c) => c === WOUND).length

const withGold = (amount: number) => (run: RunState) => ({
  run: { ...run, gold: run.gold + amount },
})

/** 牌组中满足 spec 的牌的下标 */
const eligibleIndices = (run: RunState, spec: PickSpec) =>
  run.content.deck.flatMap((c, i) => (spec.eligible(c, run.content.cards) ? [i] : []))

/** 该牌当前的样子（含锻造 / 附魔）；可附魔只看这个 */
const canEnchantId = (cards: Readonly<Record<string, CardDef>>, id: string, enchant: string) => {
  const def = resolveCards(cards, [id])[id]
  return !!def && canEnchant(def, enchant)
}

/** 实际需要选的张数：可选牌不足时选全部 */
const pickCount = (run: RunState, spec: PickSpec) =>
  Math.min(spec.count, eligibleIndices(run, spec).length)

/** 该遗物此刻是否需要玩家选牌：有选牌规则且牌组里有可选的牌 */
export function relicNeedsPick(run: RunState, id: string): boolean {
  const spec = RELIC_RULES[id]?.pick
  return !!spec && pickCount(run, spec) > 0
}

/** 选牌界面用的规则 */
export const relicPickSpec = (id: string) => RELIC_RULES[id]?.pick

/** 玩家选完牌后结算该遗物（含 onAcquire 以外的变换）；选择不合法返回 undefined */
export function resolveRelicPick(
  run: RunState,
  id: string,
  indices: number[],
): AcquireResult | undefined {
  const spec = RELIC_RULES[id]?.pick
  if (!spec) return undefined
  const eligible = eligibleIndices(run, spec)
  if (
    new Set(indices).size !== indices.length ||
    indices.length !== pickCount(run, spec) ||
    !indices.every((i) => eligible.includes(i))
  ) {
    return undefined
  }
  return applyPick(run, spec, indices)
}

/** 把选中的牌（牌组下标）按 spec 变换 */
function applyPick(run: RunState, spec: PickSpec, indices: number[]): AcquireResult {
  const picked = new Set(indices)
  const cards: { from: string; to: string }[] = []
  const deck = run.content.deck.map((c, i) => {
    if (!picked.has(i)) return c
    const to = spec.apply(c)
    cards.push({ from: c, to })
    return to
  })
  return { run: { ...run, content: { ...run.content, deck } }, cards }
}

/** 需要选牌的遗物：界面选牌；不能选时随机选 */
function pickRelic(spec: PickSpec): RelicRule {
  return {
    pick: spec,
    onAcquire: (run, rng) =>
      applyPick(run, spec, sample(eligibleIndices(run, spec), spec.count, rng)),
  }
}

/**
 * 遗物的规则。名称、图标、文案等展示信息在 data/items.ts。
 * 同一遗物持有多个时，战斗钩子只触发一次。
 */
export const RELIC_RULES: Readonly<Record<string, RelicRule>> = {
  burningBlood: { onBattleWon: (s, ev) => heal(s, 'player', 0, 6, ev) },
  meatOnBone: {
    onBattleWon: (s, ev) => {
      if (s.player.hp <= s.player.maxHp / 2) heal(s, 'player', 0, 12, ev)
    },
  },
  bloodVial: { onBattleStart: (s, ev) => heal(s, 'player', 0, 2, ev) },
  bronzeScale: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'thorns', 3, ev) },
  vajra: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'strength', 1, ev) },
  smoothStone: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'dexterity', 1, ev) },
  energyCrystal: { maxEnergy: 1 },
  anchor: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) applyBlock(s, 'player', 10, ev)
    },
  },
  lantern: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) gainEnergy(s, 1, ev)
    },
  },
  // 开心花：每 3 个回合获得 1 点能量，回合数跨战斗累计
  happyFlower: {
    showCounter: true,
    onTurnStart: (s, ev) => {
      if (tickCounter(s, 'happyFlower', 3)) gainEnergy(s, 1, ev)
    },
  },
  preparedBag: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) drawCards(s, 2, ev)
    },
  },
  orichalcum: {
    onTurnEnd: (s, ev) => {
      if (s.player.block === 0) applyBlock(s, 'player', 6, ev)
    },
  },
  roundShield: {
    onPerfectBlock: (s, ev, enemyIndex) => addStatus(s, 'enemy', enemyIndex, 'vulnerable', 1, ev),
  },
  // 每打出 10 张攻击牌，下一张攻击牌伤害翻倍；翻倍的那张不计数
  penNib: {
    showCounter: true,
    modifyEffect: (s, card, effect) =>
      card.kind === 'attack' && effect.type === 'damage' && getState(s, 'penNib') >= PEN_NIB_EVERY
        ? { ...effect, amount: effect.amount * 2 }
        : effect,
    onCardPlayed: (s, _ev, card) => {
      if (card.kind !== 'attack') return
      const n = getState(s, 'penNib')
      s.relicState = { ...s.relicState, penNib: n >= PEN_NIB_EVERY ? 0 : n + 1 }
    },
  },
  // 寄生之种：开战给所有敌人 3 层寄生种子
  parasiteSeed: {
    onBattleStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'parasite', 3, ev)
      }),
  },
  // 剑心：每回合打出第三张攻击牌时获得 1 层剑意（回合计数在 BattleState，不跨战斗）
  swordHeart: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind !== 'attack') return
      // 万剑冢：触发阈值改为第 2 张
      if (s.turnAttacks === (s.relics.includes('bladeTomb') ? 2 : 3)) addStatus(s, 'player', 0, 'swordIntent', 1, ev)
    },
  },
  // 饮血剑：每回合开始获得 1 层汲血（汲血回合结束清空）
  bloodBlade: {
    onTurnStart: (s, ev) => addStatus(s, 'player', 0, 'bloodDrain', 1, ev),
  },
  // 霜剑：战斗开始时，所有敌人获得 5 层冰霜（冰霜回合结束清空，所以只管第一回合）
  frostBlade: {
    onBattleStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'frost', 5, ev)
      }),
  },
  // 雷剑：每场战斗第一回合开始，获得 2 层感电
  thunderBlade: {
    onTurnStart: (s, ev) => {
      if (s.turn === 1) addStatus(s, 'player', 0, 'shock', 2, ev)
    },
  },
  // 炎剑：战斗开始时，所有敌人获得 3 层灼伤
  flameBlade: {
    onBattleStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'burn', 3, ev)
      }),
  },
  // 毒剑：每回合开始，已经中毒的敌人额外获得 1 层中毒
  venomBlade2: {
    onTurnStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e) && (e.statuses.poison ?? 0) > 0) addStatus(s, 'enemy', i, 'poison', 1, ev)
      }),
  },
  // 剑鞘：每回合第一次打出技能牌，获得 3 点活力（回合内技能牌数由 turnSkills 计）
  scabbard: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind !== 'skill' || s.turnSkills !== 1) return
      addStatus(s, 'player', 0, 'vigor', 3, ev)
    },
  },
  // 王国公章：获得时选一张牌附上「固有」：第一回合必定抽上手
  kingdomSeal: pickRelic({
    hint: '选择一张牌附魔「固有」：每场战斗第一回合必定抽上手',
    count: 1,
    eligible: (c, cards) => canEnchantId(cards, c, 'innate'),
    apply: (c) => withEnchant(c, 'innate'),
  }),
  // 万剑冢（Boss）：最大能量 -1；剑心改为第 2 张攻击牌触发（见 swordHeart）
  bladeTomb: { maxEnergy: -1 },
  // 蜕变：带成长的攻击牌斩杀敌人时，该牌成长层数额外 +2（结算在 battle.ts 的 playCard，需要拿到牌实例 id）
  metamorphosis: {},
  // 无间（Boss）：每回合开始获得 1 层剑意，回合结束失去全部剑意
  nothingBetween: {
    onTurnStart: (s, ev) => addStatus(s, 'player', 0, 'swordIntent', 1, ev),
    onTurnEnd: (s, ev) => {
      if ((s.player.statuses.swordIntent ?? 0) <= 0) return
      delete s.player.statuses.swordIntent
      ev.push({ type: 'statusRemoved', target: 'player', status: 'swordIntent' })
    },
  },
  // 剑谱：战斗开始获得 1 点力量；剑击永远给剑流且不受 1 层上限（见 swordSaint.afterPlay）
  swordManual: {
    onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'strength', 1, ev),
  },
  // 包扎：每次恢复生命，把一张伤口置入弃牌堆
  bandaging: {
    onHealed: (s) => {
      s.discardPile.push('wound')
    },
  },
  // 勇士头巾（战士）：战斗开始获得 8 点活力
  valiantHood: { onBattleStart: (s, ev) => addStatus(s, 'player', 0, 'vigor', 8, ev) },
  // 勇者徽章（剑圣）：一回合内打出第 3 张攻击牌时，获得 8 点活力
  braveBadge: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind === 'attack' && s.turnAttacks === 3) addStatus(s, 'player', 0, 'vigor', 3, ev)
    },
  },
  // 遗弃徽章（鸦嘴）：每回合第一次弃牌时，可以把弃掉的牌（多张时选一张）放回手牌
  abandonBadge: {
    onDiscard: (s, _ev, cards) => {
      if (s.turnDiscarded || s.pending) return
      const back = cards.filter((id) => s.discardPile.includes(id))
      if (back.length === 0) return
      s.turnDiscarded = true
      s.pending = { kind: 'recover', cards: back }
    },
  },
  // 鸦嘴医生专属
  // 毒囊：战斗开始时给予所有敌人 6 层中毒
  toxinSac: {
    onBattleStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'poison', 6, ev)
      }),
  },
  // 解剖刀：第一回合额外抽 2 张牌，并将 1 张伤口置入弃牌堆
  scalpel: {
    onTurnStart: (s, ev) => {
      if (s.turn !== 1) return
      s.discardPile.push(WOUND)
      drawCards(s, 2, ev)
    },
  },
  // 病历簿：战斗胜利时，三个牌堆里每有 5 张伤口，恢复 2 点生命
  caseFile: {
    onBattleWon: (s, ev) => {
      const n = Math.floor(countWounds(s) / 5)
      if (n > 0) heal(s, 'player', 0, n * 2, ev)
    },
  },
  // 骨灰罐：回合结束时，弃牌堆每有 3 张伤口，获得 2 点格挡
  boneUrn: {
    onTurnEnd: (s, ev) => {
      const n = Math.floor(woundsIn(s.discardPile) / 3)
      if (n > 0) applyBlock(s, 'player', n * 2, ev)
    },
  },
  // 渡鸦面具：每回合额外获得 1 点能量；每个回合开始时将 2 张伤口置入弃牌堆
  ravenMask: {
    maxEnergy: 1,
    onTurnStart: (s) => {
      s.discardPile.push(WOUND, WOUND)
    },
  },
  // 裹尸布：伤口留在弃牌堆（洗牌时不进抽牌堆）
  shroud: { keepWounds: true },
  // 香囊：每当恢复生命，获得 2 点格挡
  herbalSachet: { onHealed: (s, ev) => applyBlock(s, 'player', 2, ev) },
  // 疫苗：战斗开始时获得 2 层再生，并将 1 张伤口置入弃牌堆
  vaccine: {
    onBattleStart: (s, ev) => {
      addStatus(s, 'player', 0, 'regen', 2, ev)
      s.discardPile.push(WOUND)
    },
  },
  // 培养皿：每打出一张能力牌，给予所有敌人 8 层中毒
  petriDish: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind !== 'power') return
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'poison', 8, ev)
      })
    },
  },
  // 瘟疫之钟：每 3 个回合，给予所有敌人 3 层中毒，回合数跨战斗累计
  plagueBell: {
    showCounter: true,
    onTurnStart: (s, ev) => {
      if (!tickCounter(s, 'plagueBell', 3)) return
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'poison', 3, ev)
      })
    },
  },
  // 手术包：每打出 5 张牌，恢复 1 点生命，计数跨战斗累计
  surgicalKit: {
    showCounter: true,
    onCardPlayed: (s, ev) => {
      if (tickCounter(s, 'surgicalKit', 5)) heal(s, 'player', 0, 1, ev)
    },
  },
  // 药箱：药水栏位 +2
  medicineChest: { potionSlots: 2 },
  // 病榻护符：回合结束时若生命不高于一半，恢复 3 点生命
  sickbedAmulet: {
    onTurnEnd: (s, ev) => {
      if (s.player.hp <= s.player.maxHp / 2) heal(s, 'player', 0, 3, ev)
    },
  },
  ancientCoin: { onAcquire: withGold(300) },
  goldPouch: { onAcquire: withGold(150) },
  strawberry: {
    onAcquire: (run) => ({
      run: {
        ...run,
        player: { hp: run.player.hp + STRAWBERRY_HP, maxHp: run.player.maxHp + STRAWBERRY_HP },
      },
      heal: STRAWBERRY_HP,
    }),
  },
  potionBelt: { potionSlots: 2 },
  whetstone: { onAcquire: upgradeRandomCards('attack', WHETSTONE_CARDS) },
  // 战争涂料：获得时升级牌组中的 2 张技能牌
  warPaint: { onAcquire: upgradeRandomCards('skill', WAR_PAINT_CARDS) },
  // 三个蛋：获得之后加入牌组的对应种类的牌自动升级（见 cardOnAdd）
  toxicEgg: { upgradeOnAdd: 'skill' },
  moltenEgg: { upgradeOnAdd: 'attack' },
  frozenEgg: { upgradeOnAdd: 'power' },
  // 弹珠袋：战斗开始时，所有敌人获得 1 层易伤
  marbleBag: {
    onBattleStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) addStatus(s, 'enemy', i, 'vulnerable', 1, ev)
      }),
  },
  // 手里剑：每回合打出第 3 张攻击牌时，获得 1 点力量
  shuriken: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind === 'attack' && s.turnAttacks === 3) addStatus(s, 'player', 0, 'strength', 1, ev)
    },
  },
  // 华丽折扇：每回合打出第 3 张攻击牌时，获得 4 点格挡
  ornateFan: {
    onCardPlayed: (s, ev, card) => {
      if (card.kind === 'attack' && s.turnAttacks === 3) applyBlock(s, 'player', 4, ev)
    },
  },
  // 号角扣：每场战斗第 2 回合开始时，获得 14 点格挡
  hornCleat: {
    onTurnStart: (s, ev) => {
      if (s.turn === 2) applyBlock(s, 'player', 14, ev)
    },
  },
  // 水银沙漏：每个回合开始时，对所有敌人造成 3 点伤害（无来源，不吃力量加成）
  mercuryHourglass: {
    onTurnStart: (s, ev) =>
      s.enemies.forEach((e, i) => {
        if (isAlive(e)) applyDamage(s, 'enemy', 3, ev, i)
      }),
  },
  // 计数与结算在 effects.ts 的 applyDamage / applyBlock 里（需要拿到实际伤害与格挡数值）
  legendVest: { showCounter: true },
  trainingGuide: pickRelic({
    hint: '选择一张牌附魔「增量」：每场战斗中每打出一次，卡面数值 +1',
    count: 1,
    eligible: (c, cards) => canEnchantId(cards, c, 'grow'),
    apply: (c) => withEnchant(c, 'grow'),
  }),
}

function gainEnergy(s: BattleState, amount: number, events: GameEvent[]) {
  s.player.energy += amount
  events.push({ type: 'energyGained', amount })
}

/** 去重后的持有遗物规则，保持获得顺序 */
function activeRules(relics: readonly string[]): RelicRule[] {
  return [...new Set(relics)].flatMap((id) => RELIC_RULES[id] ?? [])
}

/** 触发所有持有遗物的某个战斗钩子 */
export function fireRelics<K extends keyof BattleHooks>(
  s: BattleState,
  hook: K,
  events: GameEvent[],
  ...extra: HookExtra<K>
) {
  for (const rule of activeRules(s.relics)) {
    ;(rule[hook] as ((...a: unknown[]) => void) | undefined)?.(s, events, ...extra)
  }
}

/** 牌加入牌组前的改写：持有对应种类的"蛋"时自动升级；已升级、诅咒、状态牌保持原样 */
export function cardOnAdd(run: RunState, id: string): string {
  const def = run.content.cards[rawId(id)]
  if (!def || !isForgeable(run.content.cards, id)) return id
  return activeRules(run.relics).some((r) => r.upgradeOnAdd === def.kind) ? upgradedId(id) : id
}

/** 依次让持有遗物改写即将结算的效果 */
export function modifyEffect(s: BattleState, card: CardDef, effect: Effect): Effect {
  return activeRules(s.relics).reduce((e, r) => r.modifyEffect?.(s, card, e) ?? e, effect)
}

const sum = (relics: readonly string[], key: 'maxEnergy' | 'potionSlots') =>
  activeRules(relics).reduce((n, r) => n + (r[key] ?? 0), 0)

export const relicMaxEnergy = (relics: readonly string[]) => sum(relics, 'maxEnergy')
export const relicKeepsWounds = (relics: readonly string[]) =>
  activeRules(relics).some((r) => r.keepWounds)
export const relicPotionSlots = (relics: readonly string[]) => sum(relics, 'potionSlots')

/** 遗物图标右下角的计数；不显示计数的遗物返回 undefined */
export function relicCounter(id: string, relicState: Readonly<Record<string, number>>) {
  return RELIC_RULES[id]?.showCounter ? (relicState[id] ?? 0) : undefined
}
