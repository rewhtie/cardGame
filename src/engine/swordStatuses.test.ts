import { describe, expect, it } from 'vitest'
import { createBattle } from './battle'
import { resolveEffect, runTurnTriggers } from './effects'
import { calcAttack } from './statuses'
import type { CardDef, EnemyDef, GameEvent } from './types'

const strike: CardDef = {
  id: 'strike',
  rarity: 'white',
  name: '打击',
  cost: 1,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 6 }],
  text: '',
}

const dummy: EnemyDef = {
  id: 'dummy',
  name: 'dummy',
  maxHp: 100,
  intents: [{ type: 'defend', block: 1 }],
}

const fight = () =>
  createBattle({ seed: 1, deck: ['strike', 'strike', 'strike', 'strike', 'strike'], enemies: [dummy], cards: { strike } })
    .state

describe('剑意伤害加成', () => {
  it('每层 +10%，不被浮点误差吃掉', () => {
    for (let base = 1; base <= 60; base++) {
      for (let n = 1; n <= 5; n++) {
        expect(calcAttack(base, { swordIntent: n }, {})).toBe(Math.round((base * (10 + n)) / 10 + 1e-9))
      }
    }
  })

  it('小数值也有感：6 点伤害 1 层剑意 → 7', () => {
    expect(calcAttack(6, { swordIntent: 1 }, {})).toBe(7)
    expect(calcAttack(6, { swordIntent: 2 }, {})).toBe(7)
  })
})

describe('万剑归宗', () => {
  it('回合开始获得剑意', () => {
    const s = fight()
    s.player.statuses = { swordMaster: 2 }
    runTurnTriggers(s, 'player', 0, 'onTurnStart', [])
    expect(s.player.statuses.swordIntent).toBe(2)
  })
})

describe('按层数追加伤害', () => {
  it('基数 = 12 + 2×8 = 28，再乘 +20% 四舍五入得 34，并清掉剑意', () => {
    const s = fight()
    s.player.statuses = { swordIntent: 2 }
    const events: GameEvent[] = []
    resolveEffect(
      s,
      { type: 'damage', amount: 12, perStack: { status: 'swordIntent', per: 8 } },
      events,
    )
    expect(s.enemies[0]!.hp).toBe(100 - 34)
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
})
