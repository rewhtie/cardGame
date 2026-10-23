import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { createBattle, dispatch } from '@/engine/battle'
import { effectText } from '@/data/cards/card'
import type { BattleState, EnemyDef } from '@/engine/types'

const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 100, intents: [{ type: 'defend', block: 1 }] }
const fight = (hand: string[]): BattleState => {
  const s = createBattle({ seed: 1, deck: ['swordStrike0'], enemies: [dummy], cards }).state
  return { ...s, hand, drawPile: [], discardPile: [] }
}
const play = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state

const TABLE: [string, string, number][] = [
  ['slash', 'white', 1], ['desperate', 'blue', 1], ['lastStandPower', 'gold', 1],
  ['frostSlash', 'white', 1], ['coldWave', 'blue', 1], ['frostWorld', 'gold', 1],
  ['thunderClap', 'white', 1], ['chainLightning', 'blue', 1], ['thunderGodPower', 'gold', 1],
  ['flameTongue', 'white', 1], ['firestorm', 'blue', 1], ['burnSky', 'gold', 2],
]

describe('属性剑新牌', () => {
  it('全部注册，稀有度与费用与设计一致', () => {
    for (const [id, rarity, cost] of TABLE) {
      expect(cards[id], id).toBeDefined()
      expect(cards[id]!.rarity).toBe(rarity)
      expect(cards[id]!.cost).toBe(cost)
    }
  })
  it('打击与连斩的进化次数均为 20', () => {
    expect(cards.swordStrike0!.evolve!.plays).toBe(20)
    expect(cards.twinSlash!.evolve!.plays).toBe(20)
  })
  it('搏命：满血 8，半血以下 16', () => {
    expect(play(fight(['desperate'])).enemies[0]!.hp).toBe(92)
    const s = fight(['desperate'])
    s.player.hp = Math.floor(s.player.maxHp / 2)
    expect(play(s).enemies[0]!.hp).toBe(84)
  })
  it('焚天：基础 12 + 灼伤 4 层 × 3 = 24 点并翻倍为 8；无灼伤 → 12 点不报错', () => {
    const s = fight(['burnSky'])
    s.enemies[0]!.statuses = { burn: 4 }
    const r = play(s)
    expect(r.enemies[0]!.hp).toBe(76)
    expect(r.enemies[0]!.statuses.burn).toBe(8)
    expect(play(fight(['burnSky'])).enemies[0]!.hp).toBe(88)
  })
  it('按目标状态加成：after 可选清除或保持', () => {
    const run = (after?: 'keep' | 'clear') => {
      const s = fight(['burnSky'])
      s.cards = { ...s.cards, burnSky: {
        ...s.cards.burnSky!,
        effects: [{ type: 'damage', amount: 0, perTargetStatus: { status: 'burn', per: 3, ...(after && { after }) } }],
      } }
      s.enemies[0]!.statuses = { burn: 4 }
      return play(s).enemies[0]!
    }
    expect(run('clear').statuses.burn).toBeUndefined()
    expect(run('keep').statuses.burn).toBe(4)
    expect(run().statuses.burn).toBe(8)
  })
  it('背水一战 + 生命 ≤ 30%：攻击 +50%', () => {
    const s = fight(['lastStandPower', 'swordStrike0'])
    s.player.energy = 3
    s.player.hp = Math.floor(s.player.maxHp * 0.3)
    expect(play(play(s), 0).enemies[0]!.hp).toBe(100 - 9)
  })
  it('凝霜斩：自己的伤害先被格挡抵挡（10→4），随后的打击穿甲，格挡仍 4', () => {
    const s = fight(['frostSlash', 'swordStrike0'])
    s.player.energy = 3
    s.enemies[0]!.block = 10
    const r = play(play(s), 0)
    expect(r.enemies[0]!.block).toBe(4)
    expect(r.enemies[0]!.hp).toBe(100 - 7) // 6 点 ×(1+0.1×2) = 7.2 → 7
  })
  it('连环雷接在感电 1 层之后：两段各 +50%', () => {
    const s = fight(['chainLightning'])
    s.player.statuses = { shock: 1 }
    expect(play(s).enemies[0]!.hp).toBe(100 - 16)
  })
  it('新文案含状态名与数值', () => {
    expect(effectText({ type: 'multiplyStatus', status: 'poison', factor: 2 })).toContain('中毒')
    expect(effectText({ type: 'damage', amount: 8, lowHp: { amount: 16 } })).toContain('16')
    expect(
      effectText({ type: 'damage', amount: 0, perTargetStatus: { status: 'burn', per: 3 } }),
    ).toMatch(/灼伤.*3/)
  })
})
