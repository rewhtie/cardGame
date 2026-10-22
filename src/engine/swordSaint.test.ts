import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { BattleState, CardDef, EnemyDef } from './types'

const atk = (id: string, cost: number): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 1 }],
  text: '',
})
const skill = (id: string, cost: number | 'X'): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost,
  target: 'self',
  kind: 'skill',
  effects: [{ type: 'block', amount: 1 }],
  text: '',
})
const swordStrike: CardDef = { ...atk('swordStrike', 1) }
const evo: CardDef = { ...atk('strike0', 1), evolve: { plays: 10, into: 'strike1' } }

const dummy: EnemyDef = {
  id: 'dummy',
  name: 'dummy',
  maxHp: 1000,
  intents: [{ type: 'defend', block: 1 }],
}

const cards = {
  a0: atk('a0', 0),
  s1: skill('s1', 1),
  s0: skill('s0', 0),
  sx: { ...skill('sx', 'X'), effects: [{ type: 'block', amount: 1, perX: true }] } as CardDef,
  sxb: { ...skill('sxb', 'X'), xBonus: 2, effects: [{ type: 'block', amount: 1, perX: true }] } as CardDef,
  swordStrike,
  strike0: evo,
}

const fight = (deck: string[], relics: string[] = ['swordHeart']) =>
  createBattle({ seed: 1, deck, enemies: [dummy], cards, relics, handSize: 5 }).state

const play = (s: BattleState, id: string) => {
  const handIndex = s.hand.findIndex((c) => c === id || c.startsWith(`${id}#`))
  expect(handIndex).toBeGreaterThanOrEqual(0)
  return dispatch(s, { type: 'playCard', handIndex }).state
}

describe('剑心：每回合第三张攻击牌得剑意', () => {
  it('只在第 3 张触发，下回合重置', () => {
    let s = fight(['a0', 'a0', 'a0', 'a0', 'a0'])
    for (let i = 0; i < 3; i++) s = play(s, 'a0')
    expect(s.player.statuses.swordIntent).toBe(1)
    s = play(s, 'a0')
    s = play(s, 'a0')
    expect(s.player.statuses.swordIntent).toBe(1)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.turnAttacks).toBe(0)
    for (let i = 0; i < 3; i++) s = play(s, 'a0')
    expect(s.player.statuses.swordIntent).toBe(2)
  })
  it('没有剑心不获得剑意', () => {
    let s = fight(['a0', 'a0', 'a0', 'a0', 'a0'], [])
    for (let i = 0; i < 3; i++) s = play(s, 'a0')
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
})

describe('剑意让技能牌免费', () => {
  const withIntent = (deck: string[]) => {
    const s = fight(deck, [])
    s.player.statuses.swordIntent = 1
    return s
  }
  it('1 费技能：能量不变，剑意 -1', () => {
    const s = play(withIntent(['s1', 'a0']), 's1')
    expect(s.player.energy).toBe(3)
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
  it('0 费技能也消耗剑意', () => {
    const s = play(withIntent(['s0', 'a0']), 's0')
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
  it('X 牌：能量不变，X = 0，剑意 -1', () => {
    const s = play(withIntent(['sx']), 'sx')
    expect(s.player.energy).toBe(3)
    expect(s.player.block).toBe(0)
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
  it('X 牌带 xBonus：结果只等于加成，能量不变', () => {
    const s = play(withIntent(['sxb']), 'sxb')
    expect(s.player.energy).toBe(3)
    expect(s.player.block).toBe(2)
    expect(s.player.statuses.swordIntent).toBeUndefined()
  })
  it('免费技能 0 能量可打；无剑意则被拒绝', () => {
    const a = withIntent(['s1'])
    a.player.energy = 0
    expect(play(a, 's1').player.statuses.swordIntent).toBeUndefined()
    const b = fight(['s1'], [])
    b.player.energy = 0
    const r = dispatch(b, { type: 'playCard', handIndex: 0 })
    expect(r.events[0]?.type).toBe('invalidAction')
    expect(r.state.hand).toHaveLength(1)
  })
  it('剑意与剑流并存：技能只吃剑意，剑流不动', () => {
    const a = withIntent(['s1'])
    a.player.statuses.swordFlow = 1
    const s = play(a, 's1')
    expect(s.player.statuses.swordIntent).toBeUndefined()
    expect(s.player.statuses.swordFlow).toBe(1)
  })
  it('没有剑意时技能照常付费', () => {
    const s = play(fight(['s1'], []), 's1')
    expect(s.player.energy).toBe(2)
  })
  it('攻击牌不吃剑意', () => {
    const s0 = withIntent(['a0'])
    const s = play(s0, 'a0')
    expect(s.player.statuses.swordIntent).toBe(1)
    const t = withIntent(['swordStrike'])
    expect(play(t, 'swordStrike').player.energy).toBe(2)
  })
})

describe('剑击与剑流', () => {
  it('付费剑击得剑流；被剑流免费的剑击不再产生，再打一张又付费', () => {
    let s = fight(['swordStrike', 'swordStrike', 'swordStrike'], [])
    s = play(s, 'swordStrike')
    expect(s.player.statuses.swordFlow).toBe(1)
    expect(s.player.energy).toBe(2)
    s = play(s, 'swordStrike')
    expect(s.player.statuses.swordFlow).toBeUndefined()
    expect(s.player.energy).toBe(2)
    s = play(s, 'swordStrike')
    expect(s.player.energy).toBe(1)
    expect(s.player.statuses.swordFlow).toBe(1)
  })
})

describe('进化计数按实例', () => {
  it('两张同 id 的牌只有打出的那张 +1', () => {
    const s0 = fight(['strike0', 'strike0'], [])
    const s = play(s0, 'strike0')
    const counts = Object.values(s.evolveCounts ?? {})
    expect(counts).toEqual([1])
    expect(Object.keys(s.evolveCounts ?? {})).toHaveLength(1)
  })
})
