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
  oneShot() {
    this.def.oneShot = true
    if (!this.def.text.includes('一次性')) this.def.text += '\n一次性'
    return this
  }
  noExhaust() {
    delete this.def.exhaust
    this.def.text = this.def.text
      .replace(/(^|[\n。；])消耗[。；]?(?=\n|$)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim()
    return this
  }
  sharp() {
    this.def.effects = this.def.effects.map((e) =>
      e.type === 'damage' ? { ...e, amount: Math.min(999, e.amount + 2) } : e,
    )
    this.def.text = this.def.text.replace(/(造成\s*)(\d+)(\s*点伤害)/g,
      (_, before, n, after) => `${before}${Math.min(999, Number(n) + 2)}${after}`)
    return this
  }
  sturdy() {
    const hasBlock = this.def.effects.some((e) => e.type === 'block')
    this.def.effects = hasBlock
      ? this.def.effects.map((e) => e.type === 'block' ? { ...e, amount: Math.min(999, e.amount + 2) } : e)
      : [...this.def.effects, { type: 'block', amount: 2 }]
    this.def.text = hasBlock
      ? this.def.text.replace(/(获得\s*)(\d+)(\s*点格挡)/g,
          (_, before, n, after) => `${before}${Math.min(999, Number(n) + 2)}${after}`)
      : `${this.def.text}\n获得 2 点格挡`
    return this
  }
  swift() {
    this.def.effects = [...this.def.effects, { type: 'draw', count: 2 }]
    this.def.text += '\n抽 2 张牌'
    return this
  }
  replay() {
    this.def.replay = true
    this.def.text += '\n重放：额外打出一次，不再扣费，沿用首次出牌的 X 值'
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
  grow: { id: 'grow', name: '增量', chain: (m) => m.grow(5), has: (c) => !!c.grow },
  innate: { id: 'innate', name: '固有', chain: (m) => m.innate(), has: (c) => !!c.innate },
  oneShot: { id: 'oneShot', name: '一次性', chain: (m) => m.oneShot(), has: (c) => !!c.oneShot },
  noExhaust: { id: 'noExhaust', name: '去除消耗', chain: (m) => m.noExhaust(), has: (c) => !c.exhaust },
  sharp: { id: 'sharp', name: '锋利', chain: (m) => m.sharp(), has: (c) => c.kind !== 'attack' },
  sturdy: { id: 'sturdy', name: '稳固', chain: (m) => m.sturdy(), has: (c) => c.kind !== 'skill' },
  swift: { id: 'swift', name: '迅捷', chain: (m) => m.swift(), has: (c) => c.kind !== 'power' },
  replay: { id: 'replay', name: '重放', chain: (m) => m.replay(), has: (c) => !!c.replay || c.kind === 'power' || c.rarity === 'curse' || c.rarity === 'status' || !!c.unplayable },
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
