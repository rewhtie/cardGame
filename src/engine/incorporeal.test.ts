import { describe, expect, it } from 'vitest'
import { applyDamage, runTiming } from './effects'
import { setupScenario } from '@/testing/cardHarness'

describe('无实体', () => {
  it('只把伤害降为 1，不塞伤口', () => {
    const s = setupScenario()
    s.player.statuses.incorporeal = 1
    s.drawPile = ['strike']
    const hp = s.player.hp
    applyDamage(s, 'player', 30, [])
    expect(s.player.hp).toBe(hp - 1)
    expect(s.drawPile).toEqual(['strike'])
  })

  it('伤口滋生：每次受伤往抽牌堆塞一张伤口', () => {
    const s = setupScenario()
    s.player.statuses.incorporeal = 1
    s.player.statuses.woundSpawn = 1
    s.player.block = 0
    s.drawPile = ['strike', 'defend']
    const hp = s.player.hp
    applyDamage(s, 'player', 30, [])
    expect(s.player.hp).toBe(hp - 1)
    expect(s.drawPile.filter((c) => c === 'wound')).toHaveLength(1)
    expect(s.drawPile).toHaveLength(3)
  })

  it('撑过敌方回合，到下个玩家回合开始才 -1', () => {
    const s = setupScenario()
    s.player.statuses.incorporeal = 1
    runTiming(s, 'playerEnd', [])
    expect(s.player.statuses.incorporeal).toBe(1)
    runTiming(s, 'playerStart', [])
    expect(s.player.statuses.incorporeal).toBeUndefined()
  })
})

describe('玩家与敌人的状态互不影响', () => {
  const both = (id: string, n = 1) => {
    const s = setupScenario()
    s.player.statuses[id] = n
    s.enemies[0]!.statuses[id] = n
    return s
  }
  const has = (s: ReturnType<typeof setupScenario>) => [
    (s.player.statuses.incorporeal ?? 0) > 0,
    (s.enemies[0]!.statuses.incorporeal ?? 0) > 0,
  ]

  it('无实体：玩家回合开始只扣玩家的，敌方回合开始只扣敌人的', () => {
    const s = both('incorporeal')
    runTiming(s, 'playerEnd', [])
    expect(has(s)).toEqual([true, true])
    runTiming(s, 'playerStart', [])
    expect(has(s)).toEqual([false, true])
    runTiming(s, 'enemyStart', [], 0)
    expect(has(s)).toEqual([false, false])
  })

  it('无实体：敌人的无实体撑过整个玩家回合，玩家身上的不受影响', () => {
    const s = both('incorporeal')
    s.enemies[0]!.statuses.incorporeal = 1
    delete s.player.statuses.incorporeal
    runTiming(s, 'playerStart', [])
    runTiming(s, 'playerEnd', [])
    expect(has(s)).toEqual([false, true])
  })

  it.each(['perfectGuard', 'intuition', 'tit4tat', 'woundSpawn'])('%s：玩家回合开始不清敌人的，敌方回合开始不清玩家的', (id) => {
    const s = both(id)
    runTiming(s, 'playerStart', [])
    expect(s.player.statuses[id]).toBeUndefined()
    expect(s.enemies[0]!.statuses[id]).toBe(1)
    const t = both(id)
    runTiming(t, 'enemyStart', [], 0)
    expect(t.player.statuses[id]).toBe(1)
    expect(t.enemies[0]!.statuses[id]).toBeUndefined()
  })
})
