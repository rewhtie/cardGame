import type { CardDef } from './types'

/**
 * 链式修改一张已构建好的 CardDef，写法与卡牌构建器的 .retain() / .innate() 一致。
 * 附魔 = 登记一段这样的链式调用。
 */
export class CardMod {
  private def: CardDef
  constructor(def: CardDef) {
    this.def = { ...def }
  }
  /** 每打出一次，卡面数值 +n */
  grow(n: number) {
    this.def.grow = (this.def.grow ?? 0) + n
    return this
  }
  /** 第一回合必抽上手；不改费用 */
  innate() {
    this.def.innate = true
    this.def.text = `固有\n${this.def.text}`
    return this
  }
  retain() {
    this.def.retain = true
    return this
  }
  done(): CardDef {
    return this.def
  }
}

export interface EnchantDef {
  id: string
  name: string
  /** 对卡牌补上的机制 */
  chain: (m: CardMod) => CardMod
  /** 这张牌是否已经自带该机制 */
  has: (c: CardDef) => boolean
}

export const ENCHANTS: Record<string, EnchantDef> = {
  grow: { id: 'grow', name: '增量', chain: (m) => m.grow(1), has: (c) => !!c.grow },
  innate: { id: 'innate', name: '固有', chain: (m) => m.innate(), has: (c) => !!c.innate },
  retain: {
    id: 'retain',
    name: '保留',
    chain: (m) => m.retain(),
    has: (c) => !!c.retain || !!c.retainGrow,
  },
}

/** 一牌一附魔；牌已自带该机制则不能附 */
export const canEnchant = (def: CardDef, enchantId: string) =>
  !def.enchant && !!ENCHANTS[enchantId] && !ENCHANTS[enchantId].has(def)

export function applyEnchant(def: CardDef, enchantId: string): CardDef {
  const e = ENCHANTS[enchantId]
  if (!e) return def
  return { ...e.chain(new CardMod(def)).done(), enchant: enchantId }
}
