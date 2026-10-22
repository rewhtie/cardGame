import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { BattleState, CardDef, EnemyDef } from './types'

const mk = (id: string, effects: CardDef['effects']): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 0,
  target: 'enemy',
  kind: 'attack',
  effects,
  text: '',
})
const cards = {
  cut: mk('cut', [{ type: 'damage', amount: 7, ifTargetBlock: { bonus: 4 } }]),
  flash: mk('flash', [{ type: 'damage', amount: 0, perAttackPlayed: { per: 4 } }]),
  chain: mk('chain', [
    { type: 'damage', amount: 1 },
    { type: 'drawIfAttacks', min: 3, count: 1 },
  ]),
}
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 200, intents: [{ type: 'defend', block: 1 }] }
const fight = (hand: string[], drawPile: string[] = []): BattleState => {
  const s = createBattle({ seed: 1, deck: ['cut', 'cut', 'cut', 'cut', 'cut'], enemies: [dummy], cards }).state
  return { ...s, hand, drawPile, discardPile: [] }
}
const play = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state

describe('条件效果', () => {
  it('断水：无格挡只有基础 7，有格挡 +4', () => {
    expect(200 - play(fight(['cut'])).enemies[0]!.hp).toBe(7)
    const s = fight(['cut'])
    s.enemies[0]!.block = 0
    s.enemies[0]!.block = 3
    const r = play(s)
    expect(r.enemies[0]!.hp).toBe(200 - 8)
  })
  it('一闪：第 1 张攻击牌打它 = 4，第 3 张 = 12', () => {
    expect(200 - play(fight(['flash'])).enemies[0]!.hp).toBe(4)
    let s = fight(['cut', 'cut', 'flash'])
    s = play(s)
    s = play(s)
    const before = s.enemies[0]!.hp
    s = play(s)
    expect(before - s.enemies[0]!.hp).toBe(12)
  })
  it('连锁：第 3 张攻击牌才抽牌，第 2 张不抽', () => {
    let s = fight(['chain', 'chain', 'chain'], ['cut', 'cut', 'cut'])
    s = play(s)
    s = play(s)
    expect(s.hand.length).toBe(1)
    s = play(s)
    expect(s.hand.length).toBe(1)
  })
})
