import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { BattleState, CardDef, EnemyDef } from './types'

const atk = (id: string, amount = 1): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 0,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount }],
  text: '',
})
const swap: CardDef = {
  id: 'swap',
  rarity: 'white',
  name: 'swap',
  cost: 0,
  target: 'self',
  kind: 'skill',
  effects: [{ type: 'redraw', extra: 0 }],
  text: '',
}
const cards = { a: atk('a'), b: atk('b', 5), swap }
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const fight = (relics: string[], deck: string[] = Array<string>(10).fill('a')): BattleState =>
  createBattle({ seed: 1, deck, enemies: [dummy], cards, relics }).state
const play = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state
const hp = (s: BattleState) => s.enemies[0]!.hp

describe('职业徽章', () => {
  it('勇士头巾：开战 8 点活力，下一张攻击牌 +8 后用完', () => {
    let s = fight(['valiantHood'])
    expect(s.player.statuses.vigor).toBe(8)
    s = play(s)
    expect(hp(s)).toBe(500 - 9)
    expect(s.player.statuses.vigor).toBeUndefined()
    const before = hp(s)
    s = play(s)
    expect(before - hp(s)).toBe(1)
  })

  it('活力：非攻击牌不消耗', () => {
    let s = fight([], ['swap', 'a', 'a', 'a', 'a'])
    s.hand = ['swap', 'a']
    s.player.statuses.vigor = 10
    s = play(s, 0)
    expect(s.player.statuses.vigor).toBe(10)
  })

  it('勇者徽章：第 3 张攻击牌后获得 3 点活力，第 4 张吃到', () => {
    let s = fight(['braveBadge'])
    s = play(play(s))
    expect(s.player.statuses.vigor).toBeUndefined()
    s = play(s)
    expect(s.player.statuses.vigor).toBe(3)
    const before = hp(s)
    s = play(s)
    expect(before - hp(s)).toBe(4)
  })

  it('遗弃徽章：每回合第一次弃牌可放回一张，第二次不触发', () => {
    let s = fight(['abandonBadge'], ['swap', 'swap', 'a', 'b', 'a', 'a', 'a', 'a'])
    s.hand = ['swap', 'swap', 'a', 'b']
    s.drawPile = ['a', 'a', 'a', 'a']
    s.discardPile = []
    s = play(s, 0)
    expect(s.pending).toMatchObject({ kind: 'recover' })
    const back = (s.pending as { cards: string[] }).cards
    expect(back).toContain('b')
    s = dispatch(s, { type: 'resolve', picks: [back.indexOf('b')] }).state
    expect(s.pending).toBeUndefined()
    expect(s.hand).toContain('b')
    expect(s.turnDiscarded).toBe(true)
    s = play(s, s.hand.indexOf('swap'))
    expect(s.pending).toBeUndefined()
  })

  it('遗弃徽章：可以不选；回合结束的整手弃牌不触发，下回合重置', () => {
    let s = fight(['abandonBadge'], ['swap', 'a', 'a', 'a', 'a', 'a', 'a', 'a'])
    s.hand = ['swap', 'a']
    s = play(s, 0)
    s = dispatch(s, { type: 'resolve', picks: [] }).state
    expect(s.pending).toBeUndefined()
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.pending).toBeUndefined()
    expect(s.turnDiscarded).toBe(false)
  })
})
