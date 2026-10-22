import { describe, expect, it } from 'vitest'
import { dispatch } from './battle'
import { playCard, setupScenario, twoSlimes } from '@/testing/cardHarness'

describe('伤口爆发与捞牌', () => {
  it('剔骨：弃牌堆每张伤口 3 点伤害，伤口被消耗', () => {
    const s = setupScenario({ hand: ['woundStrike'], enemies: twoSlimes() })
    s.discardPile = ['wound', 'wound', 'strike']
    const { state } = playCard(s, 'woundStrike', 0)
    expect(state.enemies[0]!.hp).toBe(s.enemies[0]!.hp - 6)
    expect(state.enemies[1]!.hp).toBe(s.enemies[1]!.hp)
    expect(state.exhaustPile.filter((c) => c === 'wound')).toHaveLength(2)
    expect(state.discardPile.filter((c) => c === 'wound')).toHaveLength(0)
  })

  it('疫病爆发：对全体敌人各造成伤害', () => {
    const s = setupScenario({ hand: ['outbreak'], enemies: twoSlimes(), energy: 3 })
    s.discardPile = ['wound', 'wound', 'wound']
    const { state } = playCard(s, 'outbreak')
    expect(state.enemies.map((e) => e.hp)).toEqual(s.enemies.map((e) => e.hp - 6))
  })

  it('拾骨：从弃牌堆捞最近的非伤口牌，伤口留在原处', () => {
    const s = setupScenario({ hand: ['gleaning'] })
    s.discardPile = ['defend', 'wound', 'strike', 'wound']
    const { state } = playCard(s, 'gleaning')
    expect(state.hand.sort()).toEqual(['defend', 'strike'])
    expect(state.discardPile).toEqual(['wound', 'wound'])
  })

  it('翻找：不会把自己捞回手牌', () => {
    const s = setupScenario({ hand: ['rummage'] })
    s.discardPile = []
    const { state } = playCard(s, 'rummage')
    expect(state.hand).toEqual([])
    expect(state.discardPile).toContain('rummage')
  })
})

describe('承受我的痛苦吧！', () => {
  it('三个牌堆的伤口总数 ×1 层裂伤，给全体敌人', () => {
    const s = setupScenario({ hand: ['bearMyPain', 'wound'], enemies: twoSlimes(), energy: 3 })
    s.drawPile = ['wound', 'strike']
    s.discardPile = ['wound', 'wound']
    const { state } = playCard(s, 'bearMyPain')
    expect(state.enemies.map((e) => e.statuses.gash)).toEqual([4, 4])
  })

  it('没有伤口时不施加状态', () => {
    const s = setupScenario({ hand: ['bearMyPain'], enemies: twoSlimes(), energy: 3 })
    const { state } = playCard(s, 'bearMyPain')
    expect(state.enemies.every((e) => e.statuses.gash === undefined)).toBe(true)
  })
})

describe('化腐为生', () => {
  it('选一张手牌里的状态牌消耗，获得 3 层再生', () => {
    const s = setupScenario()
    s.hand = ['rotToLife', 'strike', 'wound']
    s.drawPile = ['defend']
    const r = dispatch(s, { type: 'playCard', handIndex: 0, pick: 2 })
    expect(r.state.exhaustPile).toContain('wound')
    expect(r.state.hand).toEqual(['strike'])
    expect(r.state.player.statuses.regen).toBe(3)
  })

  it('没选状态牌时无法打出', () => {
    const s = setupScenario()
    s.hand = ['rotToLife', 'strike', 'wound']
    expect(dispatch(s, { type: 'playCard', handIndex: 0 }).events[0]?.type).toBe('invalidAction')
    expect(dispatch(s, { type: 'playCard', handIndex: 0, pick: 1 }).events[0]?.type).toBe('invalidAction')
  })
})
