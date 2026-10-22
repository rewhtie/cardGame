import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import { attackMods } from './blades'
import { applyDamage, runTurnTriggers, tickStatuses } from './effects'
import { calcAttack } from './statuses'
import type { BattleState, CardDef, EnemyDef, GameEvent } from './types'

const mk = (id: string, effects: CardDef['effects']): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 1,
  target: 'enemy',
  kind: 'attack',
  effects,
  text: '',
})
const hit5x2 = mk('hit5x2', [
  { type: 'damage', amount: 5 },
  { type: 'damage', amount: 5 },
])
const thunder = mk('thunder', [
  { type: 'damage', amount: 4 },
  { type: 'applyStatus', status: 'shock', stacks: 1, to: 'self' },
])
const dummy: EnemyDef = {
  id: 'dummy',
  name: 'dummy',
  maxHp: 100,
  intents: [{ type: 'defend', block: 1 }],
}
const fight = (hand: string[] = []): BattleState => {
  const s = createBattle({
    seed: 1,
    deck: ['hit5x2', 'hit5x2', 'hit5x2', 'hit5x2', 'hit5x2'],
    enemies: [dummy],
    cards: { hit5x2, thunder },
  }).state
  return { ...s, hand, drawPile: [], discardPile: [] }
}
const hitPlayer = (s: BattleState, amount: number, events: GameEvent[] = []) =>
  applyDamage(s, 'enemy', amount, events, 0, { source: { side: 'player' } })

describe('背水', () => {
  it('血量 ≤ 30% 才 +50%', () => {
    const s = fight()
    s.player.statuses = { lastStand: 1 }
    s.player.maxHp = 80
    s.player.hp = 24
    expect(calcAttack(6, s.player.statuses, {}, attackMods(s.player, 0, {}).mods)).toBe(9)
    s.player.hp = 25
    expect(calcAttack(6, s.player.statuses, {}, attackMods(s.player, 0, {}).mods)).toBe(6)
  })
})

describe('冰霜', () => {
  it('有格挡时穿甲且每层 +10%，格挡不减少', () => {
    const s = fight()
    s.enemies[0]!.block = 10
    s.enemies[0]!.statuses = { frost: 3 }
    const events: GameEvent[] = []
    hitPlayer(s, 6, events)
    expect(s.enemies[0]!.hp).toBe(100 - 8)
    expect(s.enemies[0]!.block).toBe(10)
    expect(events.find((e) => e.type === 'damageDealt')).toMatchObject({ blocked: 0 })
  })
  it('没有格挡时无效果', () => {
    const s = fight()
    s.enemies[0]!.statuses = { frost: 3 }
    hitPlayer(s, 6)
    expect(s.enemies[0]!.hp).toBe(94)
  })
  it('没有冰霜时格挡照常抵挡', () => {
    const s = fight()
    s.enemies[0]!.block = 10
    hitPlayer(s, 6)
    expect(s.enemies[0]!.hp).toBe(100)
    expect(s.enemies[0]!.block).toBe(4)
  })
})

describe('感电', () => {
  it('两段伤害都吃加成，整张牌后只扣 1 层', () => {
    const s = fight(['hit5x2'])
    s.player.statuses = { shock: 2 }
    const r = dispatch(s, { type: 'playCard', handIndex: 0, target: 0 })
    expect(r.state.enemies[0]!.hp).toBe(100 - 20)
    expect(r.state.player.statuses.shock).toBe(1)
  })
  it('自己给的感电不加成自己，也不被自己消耗', () => {
    const s = fight(['thunder'])
    const r = dispatch(s, { type: 'playCard', handIndex: 0, target: 0 })
    expect(r.state.enemies[0]!.hp).toBe(96)
    expect(r.state.player.statuses.shock).toBe(1)
  })
})

describe('灼伤', () => {
  it('1 层烧一次就消失；4 层烧 4 点剩 2 层', () => {
    for (const [n, lost, left] of [
      [1, 1, undefined],
      [4, 4, 2],
    ] as const) {
      const s = fight()
      s.enemies[0]!.statuses = { burn: n }
      const ev: GameEvent[] = []
      runTurnTriggers(s, 'enemy', 0, 'onTurnStart', ev)
      tickStatuses(s, 'enemy', 0, ev)
      expect(s.enemies[0]!.hp).toBe(100 - lost)
      expect(s.enemies[0]!.statuses.burn).toBe(left)
    }
  })
})

describe('雷神降世', () => {
  it('回合开始 +1 层感电', () => {
    const s = fight()
    s.player.statuses = { thunderGod: 1 }
    runTurnTriggers(s, 'player', 0, 'onTurnStart', [])
    expect(s.player.statuses.shock).toBe(1)
  })
})
