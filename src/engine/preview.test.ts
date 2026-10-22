import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import { previewDamage } from './preview'
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
  hit: mk('hit', [{ type: 'damage', amount: 6 }]),
  flash: mk('flash', [{ type: 'damage', amount: 3, perAttackPlayed: { per: 4 } }]),
  cut: mk('cut', [{ type: 'damage', amount: 7, ifTargetBlock: { bonus: 4 } }]),
  burn: mk('burn', [{ type: 'damage', amount: 0, perTargetStatus: { status: 'burn', per: 3 } }]),
  low: mk('low', [{ type: 'damage', amount: 5, lowHp: { amount: 12 } }]),
}
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const fight = (hand: string[]): BattleState => {
  const s = createBattle({ seed: 1, deck: ['hit', 'hit', 'hit', 'hit', 'hit'], enemies: [dummy], cards }).state
  return { ...s, hand, drawPile: [], discardPile: [] }
}
/** 实际打出这张牌，返回造成的总伤害（含被格挡吃掉的部分） */
const actual = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state.lastDamage

describe('卡面伤害预览与实际结算一致', () => {
  const stack = (s: BattleState) => {
    s.player.statuses = { strength: 2, swordIntent: 3, shock: 1, vigor: 4 }
    s.enemies[0]!.statuses = { vulnerable: 2, burn: 5 }
    return s
  }
  for (const id of ['hit', 'flash', 'cut', 'burn'] as const) {
    it(`多个增益 / 减益叠加：${id}`, () => {
      const s = stack(fight([id]))
      s.enemies[0]!.block = 2
      const shown = previewDamage(s, cards[id], 0)[0]
      expect(shown).toBe(actual(s))
    })
  }
  it('冰霜 + 目标有格挡：预览带穿甲增伤', () => {
    const s = fight(['hit'])
    s.enemies[0]!.statuses = { frost: 3 }
    s.enemies[0]!.block = 4
    expect(previewDamage(s, cards.hit, 0)[0]).toBe(actual(s))
  })
  it('背水：血量低于 30% 时预览带加成', () => {
    const s = fight(['hit'])
    s.player.statuses = { lastStand: 1 }
    s.player.hp = 1
    expect(previewDamage(s, cards.hit, 0)[0]).toBe(actual(s))
  })
  it('低血分支：预览给出正常 / 低血两项，且当前生效的那项与结算一致', () => {
    const s = fight(['low'])
    s.player.hp = 1
    const shown = previewDamage(s, cards.low, 0)
    expect(shown).toHaveLength(2)
    expect(shown[1]).toBe(actual(s))
  })
  it('无实体：目标带无实体，预览为 1', () => {
    const s = fight(['hit'])
    s.enemies[0]!.statuses = { incorporeal: 2 }
    expect(previewDamage(s, cards.hit, 0)[0]).toBe(1)
    expect(actual(s)).toBe(1)
  })
  it('按最大生命 / 场上增益总和的伤害：卡面没数字，不占预览位置', () => {
    const s = fight(['hit'])
    const pct = mk('pct', [{ type: 'damage', amount: 0, maxHpPct: 50 }])
    const tot = mk('tot', [{ type: 'damage', amount: 3, buffTotal: true }])
    expect(previewDamage(s, pct, 0)).toEqual([])
    expect(previewDamage(s, tot, 0)).toEqual([])
  })
  it('寄生吞食：预览为单层最终值，与吞 1 层的实际伤害一致', () => {
    const devour = mk('devour', [{ type: 'devourParasite', max: 1, per: 5 }])
    const s = { ...fight(['devour']), cards: { ...cards, devour } }
    s.player.statuses = { strength: 2, shock: 1 }
    s.enemies[0]!.statuses = { parasite: 3, vulnerable: 1 }
    s.cards = { ...s.cards, devour }
    const hp = s.enemies[0]!.hp
    const after = dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
    expect(previewDamage(s, devour, 0)[0]).toBe(hp - after.enemies[0]!.hp)
  })
})
