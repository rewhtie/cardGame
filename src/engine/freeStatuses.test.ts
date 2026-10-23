import { describe, expect, it } from 'vitest'
import { playCard, setupScenario } from '@/testing/cardHarness'

const energyOf = (s: ReturnType<typeof setupScenario>) => s.player.energy

describe('下一张某类牌免费', () => {
  it('连环斩：下一张攻击牌免费，且连环斩本身免费时继续给层数，一直连下去', () => {
    let s = setupScenario({ hand: ['chainStrike', 'chainStrike', 'chainStrike', 'strike'] })
    const e0 = energyOf(s)
    s = playCard(s, 'chainStrike').state
    expect(s.player.statuses.freeAttack).toBe(1)
    expect(energyOf(s)).toBe(e0 - 1)
    s = playCard(s, 'chainStrike').state
    expect(energyOf(s)).toBe(e0 - 1)
    expect(s.player.statuses.freeAttack).toBe(1)
    s = playCard(s, 'chainStrike').state
    s = playCard(s, 'strike').state
    expect(energyOf(s)).toBe(e0 - 1)
    expect(s.player.statuses.freeAttack).toBeUndefined()
  })

  it('攻击免费不影响技能牌；0 费牌不消耗层数', () => {
    let s = setupScenario({ hand: ['defend', 'buildUp', 'strike'] })
    s.player.statuses = { freeAttack: 1 }
    const e0 = energyOf(s)
    s = playCard(s, 'defend').state
    expect(energyOf(s)).toBe(e0 - 1)
    s = playCard(s, 'buildUp').state
    expect(s.player.statuses.freeAttack).toBe(1)
    s = playCard(s, 'strike').state
    expect(energyOf(s)).toBe(e0 - 1)
    expect(s.player.statuses.freeAttack).toBeUndefined()
  })

  it('多个来源同时消耗：攻击免费 + 剑流，打出剑击两个都吃掉', () => {
    let s = setupScenario({ hand: ['swordStrike'] })
    s.player.statuses = { freeAttack: 1, swordFlow: 1 }
    const e0 = energyOf(s)
    s = playCard(s, 'swordStrike').state
    expect(energyOf(s)).toBe(e0)
    expect(s.player.statuses.freeAttack).toBeUndefined()
    expect(s.player.statuses.swordFlow).toBeUndefined() // 两个来源各扣 1 层
  })

  it('突击：每回合开始获得 1 层攻击免费，回合结束清空', () => {
    let s = setupScenario({ hand: [] })
    s.player.statuses = { freeAttackEachTurn: 1 }
    expect(s.player.statuses.freeAttack).toBeUndefined()
  })
})
