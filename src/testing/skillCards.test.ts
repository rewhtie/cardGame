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

// 无法打出的诅咒牌另在 curseCards.test.ts 里测
const skillIds = cardIdsOfKind('skill').filter((id) => !cards[id]!.unplayable)
const blockOf = (id: string) =>
  cards[id]!.effects.reduce((n, e) => n + (e.type === 'block' && !e.perX ? e.amount : 0), 0)
const has = (id: string, type: string) => cards[id]!.effects.some((e) => e.type === type)

describe('技能牌：卡池批量校验', () => {
  it('卡池里有技能牌', () => {
    expect(skillIds.length).toBeGreaterThan(0)
  })

  for (const id of skillIds) {
    describe(`${cards[id]!.name} (${id})`, () => {
      it('冒烟：能打出、扣对能量、进对牌堆', () => {
        expect(smokeCheck(id)).toEqual([])
      })

      it('效果与卡牌定义一致', () => {
        const { actual, expected } = effectSnapshot(id)
        expect(actual).toEqual(expected)
      })

      it('自身目标：不需要选敌人，也不会直接伤害敌人', () => {
        expect(cards[id]!.target).toBe('self')
        const s = setupScenario({ hand: [id], enemies: twoSlimes() })
        const { state, events } = playCard(s, id)
        expect(events.some((e) => e.type === 'invalidAction')).toBe(false)
        expect(state.enemies.map((e) => e.hp)).toEqual([40, 40])
      })

      it('能量不足：打不出，牌留在手里', () => {
        const cost = cards[id]!.cost
        if (cost === 'X' || cost === 0) return
        const s = setupScenario({ hand: [id], energy: cost - 1 })
        const { state, events } = playCard(s, id)
        expect(events.some((e) => e.type === 'invalidAction')).toBe(true)
        expect(state.hand).toEqual([id])
      })

      it('牌堆全空也能打出（抽牌不会报错）', () => {
        const s = setupScenario({ hand: [id] })
        s.drawPile = []
        s.discardPile = []
        expect(() => playCard(s, id)).not.toThrow()
      })
    })
  }
})

describe('技能牌：格挡', () => {
  for (const id of skillIds.filter((i) => blockOf(i) > 0)) {
    it(`${cards[id]!.name}：敏捷 +2 → 格挡 +2`, () => {
      const s = setupScenario({ hand: [id], playerStatuses: { dexterity: 2 } })
      expect(playCard(s, id).state.player.block).toBe(blockOf(id) + 2)
    })

    it(`${cards[id]!.name}：叠在已有格挡上`, () => {
      const s = setupScenario({ hand: [id] })
      s.player.block = 4
      expect(playCard(s, id).state.player.block).toBe(4 + blockOf(id))
    })
  }

  for (const id of skillIds.filter((i) => cards[i]!.cost === 'X')) {
    const per = cards[id]!.effects.find((e) => e.type === 'block' && e.perX)
    if (per?.type !== 'block') continue
    it(`${cards[id]!.name}（X 费）：格挡随剩余能量增长，能量清零`, () => {
      for (const energy of [0, 1, 2, 3]) {
        const { state } = playCard(setupScenario({ hand: [id], energy }), id)
        expect(state.player.energy).toBe(0)
        expect(state.player.block, `X=${energy}`).toBe(per.amount * energy)
      }
    })
  }
})

describe('技能牌：消耗', () => {
  for (const id of skillIds.filter((i) => cards[i]!.exhaust)) {
    it(`${cards[id]!.name}：进消耗堆，不进弃牌堆`, () => {
      const { state } = playCard(setupScenario({ hand: [id] }), id)
      expect(state.exhaustPile).toContain(id)
      expect(state.discardPile).not.toContain(id)
    })
  }
})

describe('技能牌：恢复生命', () => {
  for (const id of skillIds.filter((i) => has(i, 'heal'))) {
    const amount = cards[id]!.effects.reduce((n, e) => n + (e.type === 'heal' ? e.amount : 0), 0)

    it(`${cards[id]!.name}：满血时不会超过生命上限`, () => {
      expect(playCard(setupScenario({ hand: [id] }), id).state.player.hp).toBe(80)
    })

    it(`${cards[id]!.name}：残血时恢复 ${amount} 点`, () => {
      const s = setupScenario({ hand: [id], playerHp: 10 })
      expect(playCard(s, id).state.player.hp).toBe(10 + amount)
    })
  }
})

describe('技能牌：给全体敌人上状态', () => {
  const allEnemyIds = skillIds.filter((i) =>
    cards[i]!.effects.some((e) => e.type === 'applyStatus' && e.to === 'allEnemies'),
  )
  for (const id of allEnemyIds) {
    it(`${cards[id]!.name}：所有存活敌人都中状态，已死亡的跳过`, () => {
      const three = [...twoSlimes(), { ...twoSlimes()[0]!, id: 'slime-3' }]
      const s = setupScenario({ hand: [id], enemies: three })
      s.enemies[2]!.hp = 0
      const { state } = playCard(s, id)
      expect(Object.keys(state.enemies[0]!.statuses).length).toBeGreaterThan(0)
      expect(state.enemies[1]!.statuses).toEqual(state.enemies[0]!.statuses)
      expect(state.enemies[2]!.statuses).toEqual({})
    })
  }
})

describe('技能牌：抽牌', () => {
  for (const id of skillIds.filter((i) => has(i, 'draw'))) {
    const count = cards[id]!.effects.reduce((n, e) => n + (e.type === 'draw' ? e.count : 0), 0)

    it(`${cards[id]!.name}：抽 ${count} 张，来自抽牌堆`, () => {
      const s = setupScenario({ hand: [id] })
      const pileBefore = s.drawPile.length
      const { state } = playCard(s, id)
      expect(state.hand).toHaveLength(count)
      expect(state.drawPile).toHaveLength(pileBefore - count)
    })

    it(`${cards[id]!.name}：抽牌堆不够时洗回弃牌堆继续抽`, () => {
      const s = setupScenario({ hand: [id] })
      s.drawPile = ['strike']
      s.discardPile = ['defend', 'defend', 'defend']
      const { state, events } = playCard(s, id)
      expect(state.hand.length).toBeGreaterThan(0)
      if (count > 1) expect(events).toContainEqual({ type: 'reshuffled' })
    })
  }
})
