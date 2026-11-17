import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { dispatch } from '@/engine/battle'
import { displayCost } from '@/engine/swordSaint'
import type { BattleState } from '@/engine/types'
import { playCard, setupScenario, twoSlimes } from './cardHarness'

// 测试工具的 playCard 会给目标预置寄生，寄生类用例直接派发
const playRaw = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: 0 })

describe('全体伤害牌', () => {
  it('剑葬：每层剑意费用 -2，最低 0，不消耗剑意', () => {
    const def = cards.swordBurial!
    const at = (intent: number) => setupScenario({ hand: ['swordBurial'], energy: 3, playerStatuses: { swordIntent: intent } })
    expect(displayCost(at(0), def)).toBe(5)
    expect(displayCost(at(1), def)).toBe(3)
    expect(displayCost(at(3), def)).toBe(0)
    // 0 层剑意 3 点能量打不出
    expect(playCard(at(0), 'swordBurial').state.hand).toEqual(['swordBurial'])
    // 1 层剑意：花 3 点能量，剑意保留
    const { state } = playCard({ ...at(1), enemies: setupScenario({ enemies: twoSlimes() }).enemies }, 'swordBurial')
    expect(state.player.energy).toBe(0)
    expect(state.player.statuses.swordIntent).toBe(1)
    expect(state.exhaustPile).toContain('swordBurial')
    expect(def.text).toContain('每层剑意使费用 -2')
  })

  it('天崩：每只敌人都失去临时力量', () => {
    const s = setupScenario({ hand: ['skyfall'], enemies: twoSlimes() })
    const { state } = playCard(s, 'skyfall')
    for (const e of state.enemies) expect(e.statuses.strength).toBe(-3)
    expect(cards.skyfall!.text).toContain('所有敌人失去 3 点力量')
  })

  it('噬根：每只有寄生的敌人各自被吞食；全场没有寄生时打不出', () => {
    const empty = setupScenario({ hand: ['rootDevour'], enemies: twoSlimes() })
    expect(playRaw(empty).state.hand).toEqual(['rootDevour'])
    const s = setupScenario({ hand: ['rootDevour'], enemies: twoSlimes() })
    s.enemies[0]!.statuses = { parasite: 5 }
    s.enemies[1]!.statuses = { parasite: 2 }
    const { state } = playRaw(s)
    expect(state.enemies[0]!.hp).toBe(s.enemies[0]!.hp - 6)
    expect(state.enemies[0]!.statuses.parasite).toBe(2)
    expect(state.enemies[1]!.hp).toBe(s.enemies[1]!.hp - 4)
    expect(state.enemies[1]!.statuses.parasite).toBeUndefined()
  })

  it('枯荣：引爆每只敌人的全部寄生', () => {
    const s = setupScenario({ hand: ['witherBloom'], enemies: twoSlimes() })
    s.enemies[0]!.statuses = { parasite: 7 }
    s.enemies[1]!.statuses = { parasite: 4 }
    const { state } = playRaw(s)
    expect(state.enemies[0]!.hp).toBe(s.enemies[0]!.hp - 7)
    expect(state.enemies[1]!.hp).toBe(s.enemies[1]!.hp - 4)
    expect(cards.witherBloom!.text).toContain('消耗每个敌人全部寄生种子')
  })

  it('毒发：对每只敌人造成其中毒层数的伤害，不减层', () => {
    const s = setupScenario({ hand: ['poisonBurst'], enemies: twoSlimes() })
    s.enemies[0]!.statuses = { poison: 9 }
    s.enemies[1]!.statuses = { poison: 3 }
    const { state } = playCard(s, 'poisonBurst')
    expect(state.enemies[0]!.hp).toBe(s.enemies[0]!.hp - 9)
    expect(state.enemies[1]!.hp).toBe(s.enemies[1]!.hp - 3)
    expect(state.enemies[0]!.statuses.poison).toBe(9)
    expect(cards.poisonBurst!.text).toContain('对所有敌人造成等同于目标中毒层数的伤害')
  })

  it('疫潮：伤害随牌堆伤口数增长，打到每只敌人', () => {
    const s = setupScenario({ hand: ['plagueTide'], enemies: twoSlimes() })
    s.discardPile = ['wound', 'wound']
    const { state } = playCard(s, 'plagueTide')
    for (const [i, e] of state.enemies.entries()) expect(e.hp).toBe(s.enemies[i]!.hp - 5)
  })
})
