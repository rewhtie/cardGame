import { describe, expect, it } from 'vitest'
import { enchantOf, evolvedId, migrateLegacyId, rawId, upgradedId, withEnchant } from './enchant'
import { applyEnchant, canEnchant } from './enchants'
import type { CardDef } from './types'

const def = { id: 's', name: 's', cost: 1, target: 'enemy', kind: 'attack', effects: [], text: 'x', rarity: 'white' } as CardDef

describe('附魔 id', () => {
  it('读取与写入', () => {
    expect(enchantOf('strike+@grow~7#3')).toBe('grow')
    expect(enchantOf('strike')).toBeUndefined()
    expect(withEnchant('strike+~7', 'grow')).toBe('strike+@grow~7')
    expect(withEnchant('strike@innate', 'grow')).toBe('strike@innate')
    expect(rawId('a+@grow~7#3')).toBe('a')
    expect(upgradedId('a@grow~7')).toBe('a+@grow~7')
    expect(evolvedId('a+@grow~9', 'b')).toBe('b+@grow')
  })
  it('旧存档迁移', () => {
    expect(migrateLegacyId('strike*')).toBe('strike@grow')
    expect(migrateLegacyId('strike+^~3')).toBe('strike+@innate~3')
    expect(migrateLegacyId('strike+*^')).toBe('strike+@grow')
    expect(migrateLegacyId('strike@grow')).toBe('strike@grow')
  })
})

describe('附魔机制', () => {
  it('链式调用落到机制字段，固有不改费用', () => {
    expect(applyEnchant(def, 'grow')).toMatchObject({ grow: 1, enchant: 'grow' })
    const i = applyEnchant(def, 'innate')
    expect(i.innate).toBe(true)
    expect(i.cost).toBe(1)
  })
  it('可附魔性看机制字段', () => {
    expect(canEnchant({ ...def, retain: true }, 'retain')).toBe(false)
    expect(canEnchant({ ...def, retainGrow: 3 }, 'retain')).toBe(false)
    expect(canEnchant(applyEnchant(def, 'grow'), 'innate')).toBe(false)
    for (const e of ['grow', 'innate', 'retain']) expect(canEnchant(def, e)).toBe(true)
  })
})

describe('附魔与锻造机制重叠', () => {
  it('先附魔保留，锻造后自带保留：重叠无事发生，宝石仍在', async () => {
    const { cards } = await import('@/data/cards')
    const { resolveCards } = await import('./enchant')
    const id = 'legendCloak+@retain'
    const d = resolveCards(cards, [id])[id]!
    expect(d.retain).toBe(true)
    expect(d.enchant).toBe('retain')
    expect(d.text).toBe(resolveCards(cards, ['legendCloak+'])['legendCloak+']!.text)
  })
})
