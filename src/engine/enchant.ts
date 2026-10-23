import { applyEnchant } from './enchants'
import type { CardDef, Effect } from './types'

/**
 * 附魔后缀：strike@grow 表示这张牌带「增量」附魔（名字见 enchants.ts）。
 * id 规范顺序：基础id + 可选 + + 可选 @名 + 可选 ~N；战斗实例 id 再加 #下标。
 * 注意：卡牌名后加 + 是火堆升级的样式，附魔只在卡面显示宝石标识。
 */
export const ENCHANT_MARK = '@'
const ENCHANT_RE = /@[A-Za-z]+/

/** 火堆锻造后的卡牌 id = 原卡 id + 此后缀，例如 strike+；与附魔可叠加（strike+@grow） */
export const UPGRADE_SUFFIX = '+'

/** 进化进度后缀：strike~7 表示这张牌已打出 7 次。 */
export const PROGRESS_SUFFIX = '~'

const stripInstance = (id: string) => id.split('#')[0] as string
const PROGRESS_RE = /~\d+$/
const stripProgress = (id: string) => stripInstance(id).replace(PROGRESS_RE, '')
const stripEnchant = (id: string) => stripProgress(id).replace(ENCHANT_RE, '')
export const isUpgraded = (id: string) => stripEnchant(id).endsWith(UPGRADE_SUFFIX)

/** 这张牌带的附魔名（无则 undefined） */
export const enchantOf = (id: string): string | undefined =>
  stripProgress(id).match(ENCHANT_RE)?.[0].slice(1)

/** 把 id 拆成"标记部分"和"~N / #下标 尾巴"，插入新标记时放在尾巴之前 */
const splitTail = (id: string): [string, string] => {
  const i = id.search(/[~#]/)
  return i < 0 ? [id, ''] : [id.slice(0, i), id.slice(i)]
}

/** 进化进度（无后缀返回 0） */
export const progressOf = (id: string) => {
  const m = stripInstance(id).match(/~(\d+)$/)
  return m ? Number(m[1]) : 0
}
/** 写入进化进度：n ≤ 0 去掉后缀；后缀始终在 # 实例号之前 */
export const withProgress = (id: string, n: number) => {
  const inst = id.slice(stripInstance(id).length)
  const base = stripProgress(id)
  return (n > 0 ? `${base}${PROGRESS_SUFFIX}${n}` : base) + inst
}

/** 附魔：加 @名；已有附魔则原样返回（一牌一附魔） */
export const withEnchant = (id: string, name: string) => {
  if (enchantOf(id)) return id
  const [head, tail] = splitTail(id)
  return `${head}${ENCHANT_MARK}${name}${tail}`
}
/** 锻造：保留附魔标记，在原卡 id 后加 +（+ 总在 @名 之前） */
export const upgradedId = (id: string) => {
  if (isUpgraded(id)) return id
  const [head, tail] = splitTail(id)
  const at = head.indexOf(ENCHANT_MARK)
  return (at < 0 ? head + UPGRADE_SUFFIX : head.slice(0, at) + UPGRADE_SUFFIX + head.slice(at)) + tail
}
/** 去掉附魔、锻造、进度与实例标记后的原卡 id */
export const rawId = (id: string) => {
  const b = stripEnchant(id)
  return b.endsWith(UPGRADE_SUFFIX) ? b.slice(0, -1) : b
}
/** 进化：换成目标牌，保留升级 / 附魔标记，丢掉进度 */
export const evolvedId = (id: string, into: string) => {
  const e = enchantOf(id)
  return into + (isUpgraded(id) ? UPGRADE_SUFFIX : '') + (e ? ENCHANT_MARK + e : '')
}

/** 旧存档的 * / ^ 后缀转成 @grow / @innate；两者并存只留增量 */
export function migrateLegacyId(id: string): string {
  const [head, tail] = splitTail(id)
  if (!/[*^]/.test(head)) return id
  const name = head.includes('*') ? 'grow' : 'innate'
  return `${head.replace(/[*^]/g, '')}${ENCHANT_MARK}${name}${tail}`
}

/**
 * 这张牌能否被锻造 / 升级：已升级的牌、诅咒牌和状态牌都不行。
 * 这两类牌没有升级版，强行锻造只会得到一张"伤口+"之类的怪牌。
 */
export function isForgeable(cards: Readonly<Record<string, CardDef>>, id: string): boolean {
  if (isUpgraded(id)) return false
  const def = cards[rawId(id)]
  return !!def && def.rarity !== 'curse' && def.rarity !== 'status'
}

/** 牌组 -> 战斗用的牌实例 id：附魔牌和可进化的牌按牌组位置编号（各自计数） */
export const toInstanceIds = (
  deck: readonly string[],
  cards?: Readonly<Record<string, CardDef>>,
) =>
  deck.map((id, i) =>
    enchantOf(id) || cards?.[rawId(id)]?.evolve ? `${id}#${i}` : id,
  )

/**
 * 战斗胜利后结算进化。counts 以战斗实例 id（`${牌组里的id}#${下标}`）为键，
 * 值是累计后的总次数；达标换成目标牌，未达标把进度写回 id 后缀。
 */
export function evolveDeck(
  cards: Readonly<Record<string, CardDef>>,
  deck: readonly string[],
  counts: Readonly<Record<string, number>>,
): { deck: string[]; evolved: { from: string; to: string }[]; trained: { from: string; to: string }[] } {
  const evolved: { from: string; to: string }[] = []
  const trained: { from: string; to: string }[] = []
  const next = deck.map((id, i) => {
    const evolve = cards[rawId(id)]?.evolve
    if (!evolve) return id
    const total = counts[`${id}#${i}`] ?? progressOf(id)
    if (total >= evolve.plays) {
      const to = evolvedId(id, evolve.into)
      evolved.push({ from: id, to })
      return to
    }
    const kept = withProgress(id, total)
    if (kept !== id) trained.push({ from: id, to: kept })
    return kept
  })
  return { deck: next, evolved, trained }
}

const hasX = (card: CardDef) => card.effects.some((e) => 'perX' in e && e.perX)

function bumpEffect(e: Effect): Effect {
  switch (e.type) {
    case 'damage':
      return {
        ...e,
        amount: e.amount + 1,
        ...(e.perStack && { perStack: { ...e.perStack, per: e.perStack.per + 1 } }),
        ...(e.lowHp && { lowHp: { amount: e.lowHp.amount + 1 } }),
        ...(e.maxHpPct && { maxHpPct: e.maxHpPct + 1 }),
        ...(e.ifTargetBlock && { ifTargetBlock: { bonus: e.ifTargetBlock.bonus + 1 } }),
        ...(e.perAttackPlayed && { perAttackPlayed: { per: e.perAttackPlayed.per + 1 } }),
        ...(e.perTargetStatus && {
          perTargetStatus: { ...e.perTargetStatus, per: e.perTargetStatus.per + 1 },
        }),
      }
    case 'block':
    case 'gainEnergy':
    case 'heal':
    case 'stealMaxHp':
    case 'sapStrength':
      return { ...e, amount: e.amount + 1 }
    case 'draw':
    case 'fetch':
    case 'drawIfAttacks':
    case 'drawIfParasite':
      return { ...e, count: e.count + 1 }
    case 'applyStatus':
      return { ...e, stacks: e.stacks + 1 }
    case 'woundStatus':
      return { ...e, per: e.per + 1 }
    case 'loseHp':
    case 'addWound':
    case 'addCard':
    case 'penalty':
    case 'exhaustWounds':
    case 'multiplyStatus':
    case 'convertCorpse':
    case 'exhaustStatusCard':
    case 'choose':
    case 'redraw':
    case 'reshuffle':
    case 'exhaustCards':
    case 'blockByIntent':
    case 'goldIfKill':
    case 'gainPotion':
    case 'playTop':
    case 'consumeParasite':
    case 'parasiteBurst':
    case 'devourParasite':
    case 'parasiteStatus':
    case 'spreadParasite':
    case 'purgeSelfBuff':
    case 'meltBlock':
    case 'blockFromDamage':
    case 'overdraft':
      return e
  }
}

/**
 * 附魔牌每打出一次，卡面数值 +1；涉及 X 的牌则是 X 的加成 +1。
 * 数值和文字同步变化。
 */
export function growCard(card: CardDef): CardDef {
  if (hasX(card)) return { ...card, xBonus: (card.xBonus ?? 0) + 1 }
  return {
    ...card,
    effects: card.effects.map(bumpEffect),
    text: card.text.replace(/\d+/g, (n) => String(Number(n) + 1)),
  }
}

/** 锻造时各效果增加的数值 */
function upgradeAmount(e: Effect): number {
  switch (e.type) {
    case 'damage':
    case 'block':
      return e.perX ? 2 : 3
    case 'heal':
      return 2
    default:
      return 1
  }
}

function upgradeEffect(e: Effect): Effect {
  const n = upgradeAmount(e)
  switch (e.type) {
    case 'damage':
    case 'block':
    case 'gainEnergy':
    case 'heal':
    case 'stealMaxHp':
    case 'sapStrength':
      return { ...e, amount: e.amount + n }
    case 'draw':
    case 'fetch':
    case 'drawIfAttacks':
    case 'drawIfParasite':
      return { ...e, count: e.count + n }
    case 'applyStatus':
      return { ...e, stacks: e.stacks + n }
    case 'woundStatus':
      return { ...e, per: e.per + n }
    case 'loseHp':
    case 'addWound':
    case 'addCard':
    case 'penalty':
    case 'exhaustWounds':
    case 'multiplyStatus':
    case 'convertCorpse':
    case 'exhaustStatusCard':
    case 'choose':
    case 'redraw':
    case 'reshuffle':
    case 'exhaustCards':
    case 'blockByIntent':
    case 'goldIfKill':
    case 'gainPotion':
    case 'playTop':
    case 'consumeParasite':
    case 'parasiteBurst':
    case 'devourParasite':
    case 'parasiteStatus':
    case 'spreadParasite':
    case 'purgeSelfBuff':
    case 'meltBlock':
    case 'blockFromDamage':
    case 'overdraft':
      return e
  }
}

const effectNumber = (e: Effect) =>
  e.type === 'draw' || e.type === 'fetch' || e.type === 'drawIfAttacks' || e.type === 'drawIfParasite'
    ? e.count
    : e.type === 'applyStatus'
      ? e.stacks
      : e.type === 'woundStatus'
        ? e.per
        : e.type === 'addWound'
        ? e.count
        : e.type === 'exhaustWounds'
          ? e.per
          : e.type === 'multiplyStatus'
            ? e.factor
            : e.type === 'convertCorpse' || e.type === 'exhaustStatusCard' || e.type === 'choose' || e.type === 'redraw' || e.type === 'reshuffle' || e.type === 'exhaustCards' || e.type === 'blockByIntent' || e.type === 'goldIfKill' || e.type === 'gainPotion' || e.type === 'playTop' || e.type === 'parasiteBurst' || e.type === 'spreadParasite' || e.type === 'meltBlock' || e.type === 'blockFromDamage' || e.type === 'overdraft' || e.type === 'addCard' || e.type === 'penalty' || e.type === 'parasiteStatus' || e.type === 'purgeSelfBuff'
              ? 0
              : e.type === 'devourParasite'
                ? e.per
                : e.type === 'consumeParasite'
                  ? e.amount
              : e.amount

/**
 * 火堆锻造：卡面数值提升，名字后加 +。
 * 卡面文字里的数字与 effects 一一对应（按出现顺序），逐个替换；对不上时整体 +1 兜底。
 */
export function upgradeCard(card: CardDef): CardDef {
  const effects = card.effects.map(upgradeEffect)
  const nums = card.text.match(/\d+/g) ?? []
  let i = 0
  const text =
    nums.length === effects.length
      ? card.text.replace(/\d+/g, () => String(effectNumber(effects[i++] as Effect)))
      : card.text.replace(/\d+/g, (n) => String(Number(n) + 1))
  return { ...card, name: card.name + UPGRADE_SUFFIX, effects, text }
}

/** 锻造：有手写升级版就覆盖到原卡上，否则按通用规则自动加数值 */
function forge(card: CardDef): CardDef {
  if (!card.upgraded) return upgradeCard(card)
  const { upgraded, ...rest } = card
  const def: CardDef = { ...rest, ...upgraded, name: card.name + UPGRADE_SUFFIX }
  // 升级版去掉消耗时，要显式清掉标记
  if (upgraded.exhaust === false) delete def.exhaust
  return def
}

/**
 * 展开卡面文字里的 {x} 占位。「N×{x}」显示为「NX」（如 6X），有附魔加成时为「N(X+1)」；
 * 单独的 {x} 显示 X / (X+n)。
 */
export function cardText(card: CardDef): string {
  const x = card.xBonus ? `(X+${card.xBonus})` : 'X'
  return card.text.replaceAll('×{x}', x).replaceAll('{x}', x)
}

/** 为 ids 中出现的附魔 / 锻造 / 带进度或实例号的卡补出卡牌定义（基于原卡） */
export function resolveCards(
  cards: Readonly<Record<string, CardDef>>,
  ids: readonly string[],
): Record<string, CardDef> {
  const result: Record<string, CardDef> = { ...cards }
  for (const id of ids) {
    const enchant = enchantOf(id)
    const marked = enchant || isUpgraded(id) || /[~#]/.test(id)
    if (!marked || result[id]) continue
    const base = cards[rawId(id)]
    if (!base) continue
    const def = isUpgraded(id) ? forge(base) : base
    result[id] = { ...(enchant ? applyEnchant(def, enchant) : def), id }
  }
  return result
}
