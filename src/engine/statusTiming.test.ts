import { afterEach, describe, expect, it } from 'vitest'
import { runTiming } from './effects'
import { statusById } from './statuses'
import { setupScenario } from '@/testing/cardHarness'

const base = statusById.poison!.decay
describe('状态时点', () => {
  afterEach(() => {
    delete statusById.poison!.decayAt
    delete statusById.poison!.triggerAt
    statusById.poison!.decay = base
  })

  it('默认：敌人身上的中毒在敌方回合开始（行动前）结算并 -1', () => {
    const s = setupScenario()
    s.enemies[0]!.statuses.poison = 3
    runTiming(s, 'playerEnd', [])
    expect(s.enemies[0]!.statuses.poison).toBe(3)
    runTiming(s, 'enemyStart', [], 0)
    expect(s.enemies[0]!.statuses.poison).toBe(2)
  })

  it('自选时点：衰减改到敌方回合结束', () => {
    const s = setupScenario()
    statusById.poison!.decayAt = 'enemyEnd'
    statusById.poison!.triggerAt = 'enemyEnd'
    s.enemies[0]!.statuses.poison = 3
    const hp = s.enemies[0]!.hp
    runTiming(s, 'enemyStart', [], 0)
    expect(s.enemies[0]!.statuses.poison).toBe(3)
    runTiming(s, 'enemyEnd', [], 0)
    expect(s.enemies[0]!.statuses.poison).toBe(2)
    expect(s.enemies[0]!.hp).toBe(hp - 3)
  })

  it('回合结束清空可改到玩家回合开始', () => {
    const s = setupScenario()
    statusById.poison!.decay = 'turnEnd'
    statusById.poison!.decayAt = 'playerStart'
    s.enemies[0]!.statuses.poison = 2
    runTiming(s, 'playerEnd', [])
    expect(s.enemies[0]!.statuses.poison).toBe(2)
    runTiming(s, 'playerStart', [])
    expect(s.enemies[0]!.statuses.poison).toBeUndefined()
  })
})
