import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { dispatch } from '@/engine/battle'
import { resolveCards } from '@/engine/enchant'
import { previewDamage } from '@/engine/preview'
import type { BattleState, EnemyDef } from '@/engine/types'
import { primeParasite, setupScenario } from './cardHarness'

/**
 * 全卡扫描：对每张真实卡牌，在多组叠加状态下，卡面预览的单段伤害必须等于实际打出时的伤害。
 * 只比较「卡面只有一个伤害数字、单段」的牌；其余牌由 preview.test.ts 的专项用例覆盖。
 */
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 100000, intents: [{ type: 'defend', block: 1 }] }

const SCENARIOS: { name: string; player: Record<string, number>; hp?: number; enemy: Record<string, number>; block: number }[] = [
  { name: '无状态', player: {}, enemy: {}, block: 0 },
  {
    name: '增益全叠 + 目标多减益 + 低血背水',
    player: { strength: 2, swordIntent: 3, shock: 1, vigor: 4, lastStand: 1 },
    hp: 1,
    enemy: { vulnerable: 2, gash: 3, cracked: 2, burn: 5 },
    block: 0,
  },
  { name: '冰霜 + 目标有格挡 + 自身虚弱', player: { weak: 1, strength: 1 }, enemy: { frost: 3 }, block: 5 },
  { name: '目标有格挡（无冰霜）', player: { shock: 2 }, enemy: {}, block: 3 },
  { name: '目标无实体', player: { strength: 3, shock: 1 }, enemy: { incorporeal: 2, vulnerable: 1 }, block: 0 },
]

const ids = Object.keys(resolveCards(cards, [...Object.keys(cards), ...Object.keys(cards).map((id) => `${id}+`)]))

describe('全卡扫描：卡面预览 = 实际伤害', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const mismatches: string[] = []
      let compared = 0
      for (const id of ids) {
        const base = setupScenario({ hand: [id], energy: 10, enemies: [dummy], playerHp: sc.hp, playerStatuses: sc.player })
        base.enemies[0]!.statuses = { ...sc.enemy }
        base.enemies[0]!.block = sc.block
        const s: BattleState = primeParasite(base, id)
        const card = s.cards[id]
        if (!card || card.unplayable) continue
        const dmgEffects = card.effects.filter((e) => e.type === 'damage')
        if (dmgEffects.length !== 1) continue
        const eff = dmgEffects[0]!
        if (eff.type !== 'damage' || (eff.hits ?? 1) > 1 || eff.buffTotal || eff.maxHpPct || eff.lowHp) continue
        const shown = previewDamage(s, card, 0, 10)
        if (shown.length !== 1) continue
        const before = s.enemies[0]!.hp + s.enemies[0]!.block
        let after: BattleState
        try {
          after = dispatch(s, { type: 'playCard', handIndex: 0, target: 0, x: 10 } as never).state
        } catch {
          continue
        }
        if (after.hand.includes(id)) continue // 没打出去（需要选牌等）
        const loss = before - (after.enemies[0]!.hp + after.enemies[0]!.block)
        compared++
        // 打出后目标可能因反应获得格挡 / 回血，只比较伤害事件口径：用 lastDamage
        const dealt = after.lastDamage ?? loss
        if (dealt !== shown[0]) mismatches.push(`${id}: 预览 ${shown[0]} ≠ 实际 ${dealt}`)
      }
      expect(compared).toBeGreaterThan(10)
      expect(mismatches).toEqual([])
    })
  }
})
