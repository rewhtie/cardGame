import { describe, expect, it } from 'vitest'
import { cards, colorlessRewardIds, starterDeck } from '@/data/cards'
import { characterById } from '@/data/characters'
import { slime } from '@/data/enemies'
import { createRun, dispatchRun, type RunState } from './run'
import { generateShop, SHOP_CLASS_CARDS, SHOP_COLORLESS_CARDS } from './shop'

const character = characterById('warrior')
const runWith = (seed: string, colorlessCards: string[] | undefined = colorlessRewardIds): RunState => ({
  ...createRun({
    seed,
    cards,
    deck: starterDeck,
    enemy: slime,
    rewardCards: character.rewardCards,
    colorlessCards,
    potionIds: [],
    relicIds: [],
  }),
  current: '1-1',
})

describe('商店 · 无色卡', () => {
  it('后 2 个卡位是无色卡，价格在 90–180（打折前）', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const shop = generateShop(runWith(seed))
      const slots = shop.cards.slice(SHOP_CLASS_CARDS)
      expect(slots).toHaveLength(SHOP_COLORLESS_CARDS)
      for (const it of slots) {
        expect(it).not.toBeNull()
        expect(colorlessRewardIds).toContain(it!.id)
        const base = it!.original ?? it!.price
        expect(base).toBeGreaterThanOrEqual(90)
        expect(base).toBeLessThanOrEqual(180)
      }
    }
  })

  it('两张无色卡不重复；角色卡位里不会出现无色卡', () => {
    for (const seed of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const shop = generateShop(runWith(seed))
      const [a, b] = shop.cards.slice(SHOP_CLASS_CARDS)
      expect(a!.id).not.toBe(b!.id)
      for (const it of shop.cards.slice(0, SHOP_CLASS_CARDS)) {
        expect(colorlessRewardIds).not.toContain(it!.id)
      }
    }
  })

  it('同一种子的商店固定', () => {
    expect(generateShop(runWith('SAME'))).toEqual(generateShop(runWith('SAME')))
  })

  it('没有无色卡池：后 2 格保持为空，角色卡位不受影响', () => {
    const shop = generateShop(runWith('A', []))
    expect(shop.cards.slice(SHOP_CLASS_CARDS)).toEqual([null, null])
    expect(shop.cards.slice(0, SHOP_CLASS_CARDS).every((c) => c !== null)).toBe(true)
  })

  it('可以买下无色卡：扣金币、加入牌组、标记已售', () => {
    const base = runWith('BUY')
    const shop = generateShop(base)
    const item = shop.cards[SHOP_CLASS_CARDS]!
    const run: RunState = { ...base, screen: 'shop', shop, gold: 999 }
    const r = dispatchRun(run, { type: 'buyShop', kind: 'card', index: SHOP_CLASS_CARDS }).state
    expect(r.gold).toBe(999 - item.price)
    expect(r.shop!.cards[SHOP_CLASS_CARDS]!.sold).toBe(true)
    expect(r.content.deck).toContain(item.id)
  })
})
