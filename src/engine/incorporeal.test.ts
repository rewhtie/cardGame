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
