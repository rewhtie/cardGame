import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import {
  cardIdsOfKind,
  effectSnapshot,
  playCard,
  setupScenario,
  smokeCheck,
  twoSlimes,
} from './cardHarness'

const attackIds = cardIdsOfKind('attack')

describe('攻击牌：卡池批量校验', () => {
  it('卡池里有攻击牌', () => {
    expect(attackIds.length).toBeGreaterThan(0)
  })

  for (const id of attackIds) {
    describe(`${cards[id]!.name} (${id})`, () => {
      it('冒烟：能打出、扣对能量、进对牌堆', () => {
        expect(smokeCheck(id)).toEqual([])
      })

      it('效果与卡牌定义一致', () => {
        const { actual, expected } = effectSnapshot(id)
        expect(actual).toEqual(expected)
      })

      it('需要选目标，且至少有一个效果作用在目标上（伤害或给目标上状态）', () => {
        expect(cards[id]!.target).toBe('enemy')
        const hitsTarget = cards[id]!.effects.some(
          (e) => e.type === 'damage' || (e.type === 'applyStatus' && e.to !== 'self'),
        )
        expect(hitsTarget).toBe(true)
      })

      it('指定第 2 只敌人：只有它受影响', () => {
        const s = setupScenario({ hand: [id], enemies: twoSlimes() })
        const { state } = playCard(s, id, 1)
        const touched = (i: number) =>
          state.enemies[i]!.hp < 40 || Object.keys(state.enemies[i]!.statuses).length > 0
        expect(touched(0)).toBe(false)
        expect(touched(1)).toBe(true)
      })

      it('目标已死亡：打不出，牌和能量原样保留', () => {
        const s = setupScenario({ hand: [id], enemies: twoSlimes() })
        s.enemies[1]!.hp = 0
        const { state, events } = playCard(s, id, 1)
        expect(events.some((e) => e.type === 'invalidAction')).toBe(true)
        expect(state.hand).toEqual([id])
        expect(state.player.energy).toBe(3)
      })
    })
  }
})

describe('攻击牌：伤害修正', () => {
  // 只测带固定伤害的攻击牌；X 牌的倍数单独在下面测
  const fixed = attackIds.filter((id) =>
    cards[id]!.effects.some((e) => e.type === 'damage' && !e.perX),
  )

  for (const id of fixed) {
    const dmg = cards[id]!.effects.reduce((n, e) => n + (e.type === 'damage' ? e.amount : 0), 0)
    const hits = cards[id]!.effects.filter((e) => e.type === 'damage').length

    it(`${cards[id]!.name}：力量 +2，每段伤害 +2`, () => {
      const s = setupScenario({ hand: [id], playerStatuses: { strength: 2 } })
      expect(playCard(s, id).state.enemies[0]!.hp).toBe(40 - (dmg + 2 * hits))
    })

    it(`${cards[id]!.name}：目标易伤，伤害 ×1.5 向下取整`, () => {
      const s = setupScenario({ hand: [id] })
      s.enemies[0]!.statuses = { vulnerable: 1 }
      const per = cards[id]!.effects.flatMap((e) => (e.type === 'damage' ? [e.amount] : []))
      const total = per.reduce((n, a) => n + Math.floor(a * 1.5), 0)
      expect(playCard(s, id).state.enemies[0]!.hp).toBe(40 - total)
    })

    it(`${cards[id]!.name}：自己虚弱，伤害 ×0.75 向下取整`, () => {
      const s = setupScenario({ hand: [id], playerStatuses: { weak: 1 } })
      const per = cards[id]!.effects.flatMap((e) => (e.type === 'damage' ? [e.amount] : []))
      const total = per.reduce((n, a) => n + Math.floor(a * 0.75), 0)
      expect(playCard(s, id).state.enemies[0]!.hp).toBe(40 - total)
    })

    it(`${cards[id]!.name}：先扣敌人格挡，再扣生命`, () => {
      const s = setupScenario({ hand: [id] })
      s.enemies[0]!.block = 3
      const { state } = playCard(s, id)
      expect(state.enemies[0]!.block).toBe(Math.max(0, 3 - dmg))
      expect(state.enemies[0]!.hp).toBe(40 - Math.max(0, dmg - 3))
    })
  }

  it('X 费攻击牌：伤害随剩余能量增长', () => {
    for (const id of attackIds.filter((i) => cards[i]!.cost === 'X')) {
      const per = cards[id]!.effects.find((e) => e.type === 'damage')!
      if (per.type !== 'damage') continue
      for (const energy of [0, 1, 2, 3]) {
        const s = setupScenario({ hand: [id], energy })
        const { state } = playCard(s, id)
        expect(state.player.energy, `${id} 能量`).toBe(0)
        expect(state.enemies[0]!.hp, `${id} X=${energy}`).toBe(40 - per.amount * energy)
      }
    }
  })
})

describe('攻击牌：击杀', () => {
  it('打死最后一只敌人：战斗胜利', () => {
    const id = attackIds[0]!
    const s = setupScenario({ hand: [id] })
    s.enemies[0]!.hp = 1
    expect(playCard(s, id).state.phase).toBe('won')
  })

  it('还有敌人存活：战斗继续', () => {
    const id = attackIds[0]!
    const s = setupScenario({ hand: [id], enemies: twoSlimes() })
    s.enemies[0]!.hp = 1
    expect(playCard(s, id, 0).state.phase).toBe('player')
  })
})
