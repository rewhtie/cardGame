import { createRng, deriveSeed, sample, type Rng } from './seed'
import type { RunState } from './run'

/** 商店里的一件商品；buy 之后 sold 为 true，位置保留 */
export interface ShopItem {
  id: string
  price: number
  sold?: boolean
  /** 特价：折扣百分比（减免的比例）与折前价格 */
  discount?: number
  original?: number
}

export interface ShopState {
  /** 7 个卡位：前 5 张角色卡（第 5 张 50% 为能力牌），后 2 张无色卡（没有无色卡池时为 null） */
  cards: (ShopItem | null)[]
  relics: ShopItem[]
  potions: ShopItem[]
  removeCost: number
  removed: boolean
}

export const SHOP_CLASS_CARDS = 5
export const SHOP_COLORLESS_CARDS = 2
const POWER_CHANCE = 0.5
/** 各类商品的价格区间（含两端）；同一类商品里最多一件取到最高价 */
/** 角色卡按稀有度定价 */
const CARD_PRICE = { white: 50, blue: 75, gold: 150 } as const
const PRICE_RANGE = {
  colorless: [90, 180],
  relic: [150, 280],
  potion: [25, 69],
} as const

function rollPrices(count: number, [min, max]: readonly [number, number], rng: Rng): number[] {
  let maxTaken = false
  return Array.from({ length: count }, () => {
    const price = min + rng.int(max - min + 1)
    if (price < max) return price
    if (!maxTaken) {
      maxTaken = true
      return price
    }
    return min + rng.int(max - min)
  })
}
const REMOVE_PRICE = 75
const SHOP_RELICS = 3
const SHOP_POTIONS = 3
const MAX_SALES = 2
const DISCOUNT_RANGE = { min: 10, max: 90 }
/** 特价商品所在区域的权重（百分比）；已出现过特价后整体减半，剩余概率表示不再出现特价 */
const SALE_WEIGHTS = { class: 60, colorless: 10, potion: 30 } as const
const SALE_DECAY = 0.5

/** 按种子给 1-2 件商品打折：第 n 次的概率为基础权重 × 0.5^n，落空则不再继续 */
function applySales(shop: ShopState, rng: Rng) {
  const groups: Record<keyof typeof SALE_WEIGHTS, ShopItem[]> = {
    class: shop.cards.slice(0, SHOP_CLASS_CARDS).filter((c): c is ShopItem => !!c),
    colorless: shop.cards.slice(SHOP_CLASS_CARDS).filter((c): c is ShopItem => !!c),
    potion: shop.potions,
  }
  for (let n = 0; n < MAX_SALES; n++) {
    const scale = SALE_DECAY ** n
    // 只在有可打折商品的区域里抽（如没有无色卡池时的无色卡区会被跳过）
    const kinds = (Object.keys(SALE_WEIGHTS) as (keyof typeof SALE_WEIGHTS)[]).filter((k) =>
      groups[k].some((it) => it.discount === undefined),
    )
    const total = kinds.reduce((sum, k) => sum + SALE_WEIGHTS[k], 0)
    if (!total) break
    // 第一件特价必定出现（权重归一化）；之后每件的出现概率按 0.5^n 衰减
    let roll = rng.float() * (n === 0 ? total : 100)
    const kind = kinds.find((k) => {
      roll -= SALE_WEIGHTS[k] * scale
      return roll < 0
    })
    if (!kind) break
    const candidates = groups[kind].filter((it) => it.discount === undefined)
    const item = candidates[rng.int(candidates.length)]!
    const discount = DISCOUNT_RANGE.min + rng.int(DISCOUNT_RANGE.max - DISCOUNT_RANGE.min + 1)
    item.original = item.price
    item.discount = discount
    item.price = Math.max(1, Math.round((item.price * (100 - discount)) / 100))
  }
}

function priced(ids: string[], range: readonly [number, number], rng: Rng): ShopItem[] {
  const prices = rollPrices(ids.length, range, rng)
  return ids.map((id, i) => ({ id, price: prices[i]! }))
}

export function generateShop(run: RunState): ShopState {
  const rng = createRng(deriveSeed(run.seed, `shop:${run.current}`))
  const defs = run.content.cards
  const colorlessPool = (run.content.colorlessCards ?? []).filter((id) => defs[id])
  // 角色卡位只从角色自己的卡里抽，无色卡留给后 2 个卡位
  const pool = (run.content.rewardCards ?? []).filter((id) => !colorlessPool.includes(id))
  const powers = pool.filter((id) => defs[id]?.kind === 'power')
  const others = pool.filter((id) => defs[id] && defs[id].kind !== 'power')

  const wantPower = powers.length > 0 && rng.float() < POWER_CHANCE
  const picked = sample(others, wantPower ? SHOP_CLASS_CARDS - 1 : SHOP_CLASS_CARDS, rng)
  if (wantPower) picked.push(...sample(powers, 1, rng))
  // 非能力牌不足时用剩余卡补齐，保证卡位尽量满
  const rest = pool.filter((id) => defs[id] && !picked.includes(id))
  picked.push(...sample(rest, SHOP_CLASS_CARDS - picked.length, rng))

  const price = (id: string) =>
    CARD_PRICE[defs[id]?.rarity as keyof typeof CARD_PRICE] ?? CARD_PRICE.gold
  const unownedRelics = (run.content.relicIds ?? []).filter((id) => !run.relics.includes(id))

  const colorless = sample(colorlessPool, SHOP_COLORLESS_CARDS, rng)
  const colorlessItems = priced(colorless, PRICE_RANGE.colorless, rng)

  const shop: ShopState = {
    cards: [
      ...picked.map((id) => ({ id, price: price(id) })),
      ...colorlessItems,
      ...Array<null>(SHOP_COLORLESS_CARDS - colorlessItems.length).fill(null),
    ],
    relics: priced(sample(unownedRelics, SHOP_RELICS, rng), PRICE_RANGE.relic, rng),
    potions: priced(sample(run.content.potionIds ?? [], SHOP_POTIONS, rng), PRICE_RANGE.potion, rng),
    removeCost: REMOVE_PRICE,
    removed: false,
  }
  applySales(shop, rng)
  return shop
}
