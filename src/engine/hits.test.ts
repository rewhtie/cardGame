import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { effectText } from '@/data/cards/card'
import { setupScenario, playCard } from '@/testing/cardHarness'

describe('多段伤害 hits', () => {
  it('乱舞：5 点伤害 ×3，卡面文字相应', () => {
    const c = cards.frenzySlash!
    expect(c.effects).toEqual([{ type: 'damage', amount: 5, hits: 3 }])
    expect(effectText(c.effects[0]!)).toBe('造成 5 点伤害 ×3')
    expect(c.upgraded?.effects).toEqual([{ type: 'damage', amount: 8, hits: 3 }])
  })
  it('每段单独吃力量；格挡先被第一段消耗', () => {
    const s = setupScenario({ hand: ['frenzySlash'], playerStatuses: { strength: 2 } })
    expect(playCard(s, 'frenzySlash').state.enemies[0]!.hp).toBe(40 - 21)
    const b = setupScenario({ hand: ['frenzySlash'] })
    b.enemies[0]!.block = 7
    const r = playCard(b, 'frenzySlash').state.enemies[0]!
    expect(r.block).toBe(0)
    expect(r.hp).toBe(40 - 8)
  })
  it('前一段击杀后不再补刀', () => {
    const s = setupScenario({ hand: ['frenzySlash'] })
    s.enemies[0]!.hp = 4
    const { events } = playCard(s, 'frenzySlash')
    expect(events.filter((e) => e.type === 'damageDealt')).toHaveLength(1)
  })
})
