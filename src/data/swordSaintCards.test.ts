import { describe, expect, it } from 'vitest'
import { growCard, resolveCards } from '@/engine/enchant'
import { cards, classAllIds } from './cards'
import { CHARACTER_RELIC_IDS, characterById, characters } from './characters'

describe('剑圣卡牌与职业', () => {
  it('所有剑圣卡牌 id 全局唯一（导入 cards 时不报错）', () => {
    expect(Object.keys(cards).length).toBeGreaterThan(0)
    const ids = classAllIds.swordSaint!
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(cards[id], id).toBeDefined()
  })

  it('可进化的牌指向存在的牌，且目标有升级版', () => {
    for (const id of classAllIds.swordSaint!) {
      const evolve = cards[id]!.evolve
      if (!evolve) continue
      const target = cards[evolve.into]
      expect(target, `${id} → ${evolve.into}`).toBeDefined()
      expect(target!.upgraded, evolve.into).toBeDefined()
    }
    expect(cards.swordStrike0!.evolve).toEqual({ plays: 20, into: 'swordStrike' })
    expect(cards.twinSlash!.evolve).toEqual({ plays: 20, into: 'frenzySlash' })
  })

  it('角色：剑圣起手 4 打击 + 4 防御，带剑心', () => {
    const c = characters.find((x) => x.id === 'swordSaint')
    expect(c).toBeDefined()
    expect(characterById('swordSaint').name).toBe('剑圣')
    expect(c!.deck).toEqual([...Array(4).fill('swordStrike0'), ...Array(4).fill('defend')])
    expect(c!.relics).toEqual(['swordHeart'])
    expect(CHARACTER_RELIC_IDS).toContain('swordHeart')
  })

  it('附魔成长：无想一剑的伤害与每层加成同步 +1', () => {
    const e = growCard(cards.nothingSlash!).effects[0] as { amount: number; perStack?: { per: number } }
    expect(e.amount).toBe(17)
    expect(e.perStack?.per).toBe(5)
  })

  it('进化目标不进奖励池', () => {
    const c = characterById('swordSaint')
    expect(c.rewardCards).not.toContain('swordStrike')
    expect(c.rewardCards).not.toContain('frenzySlash')
    expect(c.rewardCards).not.toContain('swordStrike0')
  })

  it('剑击与升级版卡面文字里只有一个数字', () => {
    const resolved = resolveCards(cards, ['swordStrike', 'swordStrike+'])
    for (const id of ['swordStrike', 'swordStrike+']) {
      const digits = resolved[id]!.text.match(/\d+/g) ?? []
      expect(digits, id).toHaveLength(1)
    }
    expect(resolved['swordStrike+']!.text).toContain('14')
  })
})
