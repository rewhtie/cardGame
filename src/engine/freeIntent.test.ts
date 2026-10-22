import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { createBattle, dispatch } from './battle'
import { displayCost } from './swordSaint'
import type { BattleState, EnemyDef } from './types'

const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const start = (intent: number, energy: number): BattleState => {
  const s = createBattle({ seed: 1, deck: Array(10).fill('nothingSlash'), enemies: [dummy], cards }).state
  return {
    ...s,
    hand: ['nothingSlash'],
    player: { ...s.player, energy, statuses: intent ? { swordIntent: intent } : {} },
  }
}
const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: 0, target: 0 })

describe('无瑕：有剑意时免费', () => {
  it('有剑意：显示 0 费，0 能量也能打出，不额外消耗能量', () => {
    const s = start(2, 0)
    expect(displayCost(s, s.cards.nothingSlash!)).toBe(0)
    const r = play(s)
    expect(r.events.some((e) => e.type === 'invalidAction')).toBe(false)
    expect(r.state.player.energy).toBe(0)
    // 基础 16 + 每层 4 = 24，再吃剑意 +10%×2 层：24 × 1.2 = 28.8 → 29
    expect(r.state.enemies[0]!.hp).toBe(500 - 29)
    expect(r.state.player.statuses.swordIntent).toBeUndefined() // 剑意由伤害效果清空，免费本身不多扣
  })

  it('没有剑意：照常 2 费，能量不足打不出', () => {
    const s = start(0, 1)
    expect(displayCost(s, s.cards.nothingSlash!)).toBe(2)
    expect(play(s).events.some((e) => e.type === 'invalidAction')).toBe(true)
    const paid = play(start(0, 3)).state
    expect(paid.player.energy).toBe(1)
  })
})
