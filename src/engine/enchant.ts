import type { CardDef, Effect } from './types'

/**
 * 被附魔的卡牌 id = 原卡 id + 此后缀，例如 strike*。
 * 注意：卡牌名后加 + 是火堆升级的样式，附魔只在卡面显示宝石标识。
 */
export const ENCHANT_SUFFIX = '*'

/** 战斗中每张附魔牌有独立的实例 id（strike*#3），各自累积，互不影响 */
export const isEnchanted = (id: string) => id.includes(ENCHANT_SUFFIX)
export const enchantedId = (id: string) => (isEnchanted(id) ? id : id + ENCHANT_SUFFIX)

/** 火堆锻造后的卡牌 id = 原卡 id + 此后缀，例如 strike+；与附魔可叠加（strike+*） */
export const UPGRADE_SUFFIX = '+'
const stripInstance = (id: string) => id.split('#')[0] as string
const stripEnchant = (id: string) => stripInstance(id).replace(ENCHANT_SUFFIX, '')
export const isUpgraded = (id: string) => stripEnchant(id).endsWith(UPGRADE_SUFFIX)
/** 锻造：保留附魔标记，在原卡 id 后加 + */
export const upgradedId = (id: string) => {
  if (isUpgraded(id)) return id
  return isEnchanted(id)
    ? id.replace(ENCHANT_SUFFIX, UPGRADE_SUFFIX + ENCHANT_SUFFIX)
    : id + UPGRADE_SUFFIX
}
/** 去掉附魔与锻造标记后的原卡 id */
export const rawId = (id: string) => {
  const b = stripEnchant(id)
  return b.endsWith(UPGRADE_SUFFIX) ? b.slice(0, -1) : b
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

/** 牌组 -> 战斗用的牌实例 id：附魔牌按牌组位置编号 */
export const toInstanceIds = (deck: readonly string[]) =>
  deck.map((id, i) => (isEnchanted(id) ? `${id}#${i}` : id))

const hasX = (card: CardDef) => card.effects.some((e) => 'perX' in e && e.perX)

function bumpEffect(e: Effect): Effect {
  switch (e.type) {
    case 'damage':
    case 'block':
    case 'gainEnergy':
    case 'heal':
      return { ...e, amount: e.amount + 1 }
    case 'draw':
      return { ...e, count: e.count + 1 }
    case 'applyStatus':
      return { ...e, stacks: e.stacks + 1 }
    case 'loseHp':
    case 'addWound':
    case 'exhaustWounds':
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
      return { ...e, amount: e.amount + n }
    case 'draw':
      return { ...e, count: e.count + n }
    case 'applyStatus':
      return { ...e, stacks: e.stacks + n }
    case 'loseHp':
    case 'addWound':
    case 'exhaustWounds':
      return e
  }
}

const effectNumber = (e: Effect) =>
  e.type === 'draw'
    ? e.count
    : e.type === 'applyStatus'
      ? e.stacks
      : e.type === 'addWound'
        ? e.count
        : e.type === 'exhaustWounds'
          ? e.per
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

/** 展开卡面文字里的 {x} 占位：X、(X+1)、(X+2)… */
export function cardText(card: CardDef): string {
  const x = card.xBonus ? `(X+${card.xBonus})` : 'X'
  return card.text.replaceAll('{x}', x)
}

/** 为 ids 中出现的附魔 / 锻造卡补出卡牌定义（基于原卡） */
export function resolveCards(
  cards: Readonly<Record<string, CardDef>>,
  ids: readonly string[],
): Record<string, CardDef> {
  const result: Record<string, CardDef> = { ...cards }
  for (const id of ids) {
    const enchanted = isEnchanted(id)
    if ((!enchanted && !isUpgraded(id)) || result[id]) continue
    const base = cards[rawId(id)]
    if (!base) continue
    const def = isUpgraded(id) ? forge(base) : base
    result[id] = { ...def, id, ...(enchanted && { enchanted: true }) }
  }
  return result
}
