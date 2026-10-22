import { describe, expect, it } from 'vitest'
import { cards } from './cards'

const IDS = ['luck', 'gather', 'cutWater', 'chain', 'swordDance', 'painForShock', 'bladeMasterPower', 'flash']
const rarity = { luck: 'white', gather: 'white', cutWater: 'white', chain: 'blue', swordDance: 'blue', painForShock: 'blue', bladeMasterPower: 'gold', flash: 'gold' }
const cost = { luck: 0, gather: 1, cutWater: 1, chain: 1, swordDance: 1, painForShock: 0, bladeMasterPower: 3, flash: 1 }

describe('剑圣引擎与衔接牌', () => {
  it('8 张牌注册，稀有度与费用正确', () => {
    for (const id of IDS) {
      const c = cards[id]
      expect(c, id).toBeTruthy()
      expect(c!.rarity).toBe(rarity[id as keyof typeof rarity])
      expect(c!.cost).toBe(cost[id as keyof typeof cost])
    }
  })
  it('0 费且能抽牌的牌都带消耗', () => {
    for (const c of Object.values(cards)) {
      if (!IDS.includes(c.id)) continue
      if (c.cost === 0 && c.effects.some((e) => e.type === 'draw' || e.type === 'drawIfAttacks')) expect(c.exhaust, c.id).toBe(true)
    }
  })
  it('卡面文案含数值', () => {
    expect(cards.cutWater!.text).toContain('7')
    expect(cards.cutWater!.text).toContain('+4')
    expect(cards.chain!.text).toContain('3')
  })
})
