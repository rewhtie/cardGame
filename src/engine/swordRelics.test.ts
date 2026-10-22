import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { BattleState, CardDef, EnemyDef } from './types'

const atk = (id: string): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 0,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 1 }],
  text: '',
})
const cards = { a: atk('a'), sk: { ...atk('sk'), kind: 'skill', target: 'self', effects: [] } as CardDef }
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const fight = (relics: string[], enemies = [dummy]): BattleState =>
  createBattle({ seed: 1, deck: Array(10).fill('a'), enemies, cards, relics }).state
const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
const endTurn = (s: BattleState) => dispatch(s, { type: 'endTurn' }).state

describe('剑圣遗物', () => {
  it('饮血剑：每回合开始 1 层汲血，回合结束清空，下回合重新给', () => {
    let s = fight(['bloodBlade'])
    expect(s.player.statuses.bloodDrain).toBe(1)
    s = endTurn(s)
    expect(s.player.statuses.bloodDrain).toBe(1) // 新回合重新给，不叠到 2
  })
  it('霜剑：每回合开始所有敌人 1 层冰霜，回合末清空后下回合重新有 1 层', () => {
    let s = fight(['frostBlade'], [dummy, { ...dummy, id: 'd2' }])
    expect(s.enemies.map((e) => e.statuses.frost)).toEqual([1, 1])
    s = endTurn(s)
    expect(s.enemies.map((e) => e.statuses.frost)).toEqual([1, 1])
  })
  it('雷剑：第一回合 2 层感电，第二回合不再给', () => {
    let s = fight(['thunderBlade'])
    expect(s.player.statuses.shock).toBe(2)
    s = endTurn(s)
    expect(s.player.statuses.shock).toBe(2)
  })
  it('炎剑：战斗开始所有敌人 3 层灼伤', () => {
    const s = fight(['flameBlade'])
    expect(s.enemies[0]!.statuses.burn).toBe(3)
  })
  it('毒剑：只给已中毒的敌人 +1 层中毒', () => {
    let s = fight(['venomBlade2'], [dummy, { ...dummy, id: 'd2' }])
    expect(s.enemies[0]!.statuses.poison).toBeUndefined()
    s.enemies[0]!.statuses = { poison: 3 }
    s = endTurn(s)
    expect(s.enemies[1]!.statuses.poison).toBeUndefined()
    expect(s.enemies[0]!.statuses.poison ?? 0).toBeGreaterThanOrEqual(3)
  })
  it('剑鞘：每回合第一次打出技能牌 +3 活力，攻击牌和之后的技能牌不再给', () => {
    let s = createBattle({ seed: 1, deck: ['a', 'sk', 'sk', 'sk', 'sk'], enemies: [dummy], cards, relics: ['scabbard'] }).state
    const at = (id: string) => s.hand.findIndex((h) => h === id)
    s = dispatch(s, { type: 'playCard', handIndex: at('a'), target: 0 }).state
    expect(s.player.statuses.vigor).toBeUndefined()
    s = dispatch(s, { type: 'playCard', handIndex: at('sk') }).state
    expect(s.player.statuses.vigor).toBe(3)
    s = dispatch(s, { type: 'playCard', handIndex: at('sk') }).state
    expect(s.player.statuses.vigor).toBe(3)
  })
  it('万剑冢：最大能量 −1；与剑心同持时第 2 张攻击牌给剑意，第 3 张不再给', () => {
    let s = fight(['swordHeart', 'bladeTomb'])
    expect(s.player.maxEnergy).toBe(2)
    s = play(s)
    expect(s.player.statuses.swordIntent).toBeUndefined()
    s = play(s)
    expect(s.player.statuses.swordIntent).toBe(1)
    s = play(s)
    expect(s.player.statuses.swordIntent).toBe(1)
  })
  it('无间：每回合开始 +1 层剑意，回合结束清零，不残留', () => {
    let s = fight(['nothingBetween'])
    expect(s.player.statuses.swordIntent).toBe(1)
    s = endTurn(s)
    expect(s.player.statuses.swordIntent).toBe(1)
  })
})
