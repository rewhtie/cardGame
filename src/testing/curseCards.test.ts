import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { dispatch } from '@/engine/battle'
import { isForgeable } from '@/engine/enchant'
import { playCard, setupScenario, smokeCheck } from './cardHarness'

const unplayableIds = Object.values(cards)
  .filter((c) => c.unplayable)
  .map((c) => c.id)

describe('诅咒牌', () => {
  it('卡池里有无法打出的牌', () => {
    expect(unplayableIds.length).toBeGreaterThan(0)
  })

  for (const id of unplayableIds) {
    it(`${cards[id]!.name}：打不出，牌和能量原样保留`, () => {
      expect(smokeCheck(id)).toEqual([])
    })

    it(`${cards[id]!.name}：不可锻造 / 升级`, () => {
      expect(isForgeable(cards, id)).toBe(false)
    })
  }

  it('灼伤：回合结束时每张在手牌中的灼伤让玩家失去 2 点生命', () => {
    const hpAfterEndTurn = (hand: string[]) =>
      dispatch(setupScenario({ hand }), { type: 'endTurn' }).state.player.hp
    expect(hpAfterEndTurn(['strike'])).toBe(hpAfterEndTurn(['strike', 'burn', 'burn']) + 4)
  })

  it('伤口：留在手里不造成伤害', () => {
    const hpAfterEndTurn = (hand: string[]) =>
      dispatch(setupScenario({ hand }), { type: 'endTurn' }).state.player.hp
    expect(hpAfterEndTurn(['strike', 'wound'])).toBe(hpAfterEndTurn(['strike']))
  })
})

describe('带代价的强牌', () => {
  it('血之契约：失去 4 点生命，造成 18 点伤害', () => {
    const s = setupScenario({ hand: ['bloodPact'], playerHp: 50 })
    const { state } = playCard(s, 'bloodPact', 0)
    expect(state.player.hp).toBe(46)
    expect(state.enemies[0]!.hp).toBe(40 - 18)
  })

  it('狂乱：失去 5 点生命，获得 2 点能量并抽 2 张，打出后消耗', () => {
    const s = setupScenario({ hand: ['frenzy'], playerHp: 50, energy: 1 })
    const { state } = playCard(s, 'frenzy')
    expect(state.player.hp).toBe(45)
    expect(state.player.energy).toBe(3)
    expect(state.hand).toHaveLength(2)
    expect(state.exhaustPile).toContain('frenzy')
  })
})
