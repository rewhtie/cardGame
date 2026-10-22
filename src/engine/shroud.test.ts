import { describe, expect, it } from 'vitest'
import { drawCards } from './effects'
import { setupScenario } from '@/testing/cardHarness'

describe('裹尸布', () => {
  it('洗牌时伤口留在弃牌堆，只洗其他牌', () => {
    const s = setupScenario()
    s.relics = ['shroud']
    s.drawPile = []
    s.discardPile = ['wound', 'strike', 'wound', 'defend']
    drawCards(s, 2, [])
    expect(s.hand.sort()).toEqual(['defend', 'strike'])
    expect(s.discardPile).toEqual(['wound', 'wound'])
  })

  it('弃牌堆只剩伤口时不抽牌也不报错', () => {
    const s = setupScenario()
    s.relics = ['shroud']
    s.drawPile = []
    s.discardPile = ['wound', 'wound']
    s.hand = []
    drawCards(s, 2, [])
    expect(s.hand).toEqual([])
    expect(s.discardPile).toEqual(['wound', 'wound'])
  })

  it('没有裹尸布时伤口照常进抽牌堆', () => {
    const s = setupScenario()
    s.drawPile = []
    s.discardPile = ['wound', 'wound']
    drawCards(s, 2, [])
    expect(s.hand).toEqual(['wound', 'wound'])
  })
})
