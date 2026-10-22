import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { dispatch } from '@/engine/battle'
import { statusById } from '@/engine/statuses'
import { cardIdsOfKind, playCard, playSequence, setupScenario, smokeCheck } from './cardHarness'

const powerIds = cardIdsOfKind('power')

/** 能力牌给自己上的状态：[状态 id, 层数] */
const grants = (id: string) =>
  cards[id]!.effects.flatMap((e) =>
    e.type === 'applyStatus' && e.to === 'self' ? [[e.status, e.stacks] as const] : [],
  )

describe('能力牌：卡池批量校验', () => {
  it('卡池里有能力牌', () => {
    expect(powerIds.length).toBeGreaterThan(0)
  })

  for (const id of powerIds) {
    describe(`${cards[id]!.name} (${id})`, () => {
      it('冒烟：能打出、扣对能量、不进任何牌堆', () => {
        expect(smokeCheck(id)).toEqual([])
      })

      it('自身目标，且至少给自己一个已注册的状态', () => {
        expect(cards[id]!.target).toBe('self')
        expect(grants(id).length).toBeGreaterThan(0)
        for (const [status] of grants(id)) expect(statusById[status], status).toBeDefined()
      })

      it('打出后获得对应层数的状态', () => {
        const { state } = playCard(setupScenario({ hand: [id] }), id)
        for (const [status, stacks] of grants(id))
          expect(state.player.statuses[status]).toBe(stacks)
      })

      it('打出两次：层数叠加', () => {
        const s = setupScenario({ hand: [id, id], energy: 6 })
        const { state } = playSequence(s, [id, id])
        for (const [status, stacks] of grants(id))
          expect(state.player.statuses[status]).toBe(stacks * 2)
      })

      it('结束回合后：永久型保留层数，衰减型 -1', () => {
        const s = playCard(setupScenario({ hand: [id] }), id).state
        const after = dispatch(s, { type: 'endTurn' }).state
        for (const [status, stacks] of grants(id)) {
          const left = statusById[status]!.decay === 'tick' ? stacks - 1 : stacks
          expect(after.player.statuses[status] ?? 0).toBe(left)
        }
      })

      it('不会连带给敌人上状态', () => {
        const { state } = playCard(setupScenario({ hand: [id] }), id)
        expect(state.enemies[0]!.statuses).toEqual({})
      })
    })
  }
})

describe('灵巧步法 (footwork)', () => {
  it('花 1 能量，获得 2 层敏捷', () => {
    const { state } = playCard(setupScenario({ hand: ['footwork'] }), 'footwork')
    expect(state.player.energy).toBe(2)
    expect(state.player.statuses.dexterity).toBe(2)
  })

  it('之后打出防御：5 点格挡变 7 点', () => {
    const s = setupScenario({ hand: ['footwork', 'defend'] })
    expect(playSequence(s, ['defend']).state.player.block).toBe(5)
    expect(playSequence(s, ['footwork', 'defend']).state.player.block).toBe(7)
  })

  it('先出防御再出灵巧步法：已获得的格挡不追加', () => {
    const s = setupScenario({ hand: ['defend', 'footwork'] })
    expect(playSequence(s, ['defend', 'footwork']).state.player.block).toBe(5)
  })

  it('叠加两次：敏捷 4 层，防御 9 点格挡', () => {
    const s = setupScenario({ hand: ['footwork', 'footwork', 'defend'], energy: 3 })
    const { state } = playSequence(s, ['footwork', 'footwork', 'defend'])
    expect(state.player.statuses.dexterity).toBe(4)
    expect(state.player.block).toBe(9)
    expect(state.player.energy).toBe(0)
  })

  it('不影响攻击伤害', () => {
    const s = setupScenario({ hand: ['footwork', 'strike'] })
    expect(playSequence(s, ['footwork', 'strike']).state.enemies[0]!.hp).toBe(40 - 6)
  })

  it('能量为 0 时打不出', () => {
    const { events, state } = playCard(setupScenario({ hand: ['footwork'], energy: 0 }), 'footwork')
    expect(events.some((e) => e.type === 'invalidAction')).toBe(true)
    expect(state.player.statuses.dexterity).toBeUndefined()
  })
})

describe('燃烧 (inflame)', () => {
  it('之后打击：6 点伤害变 8 点', () => {
    const s = setupScenario({ hand: ['inflame', 'strike'] })
    expect(playSequence(s, ['inflame', 'strike']).state.enemies[0]!.hp).toBe(40 - 8)
  })

  it('先出打击再出燃烧：已造成的伤害不变', () => {
    const s = setupScenario({ hand: ['strike', 'inflame'] })
    expect(playSequence(s, ['strike', 'inflame']).state.enemies[0]!.hp).toBe(40 - 6)
  })

  it('不影响格挡', () => {
    const s = setupScenario({ hand: ['inflame', 'defend'] })
    expect(playSequence(s, ['inflame', 'defend']).state.player.block).toBe(5)
  })
})

describe('钢铁之躯 (ironBody)', () => {
  it('回合结束获得 3 点格挡，挡掉史莱姆第一回合 8 点攻击中的 3 点', () => {
    const s = playCard(setupScenario({ hand: ['ironBody'] }), 'ironBody').state
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(events).toContainEqual({ type: 'blockGained', target: 'player', amount: 3 })
    expect(state.player.hp).toBe(80 - (8 - 3))
  })

  it('叠加两次：回合结束获得 6 点格挡', () => {
    const s = setupScenario({ hand: ['ironBody', 'ironBody'], energy: 3 })
    const after = playSequence(s, ['ironBody', 'ironBody']).state
    const { events } = dispatch(after, { type: 'endTurn' })
    expect(events).toContainEqual({ type: 'blockGained', target: 'player', amount: 6 })
  })

  it('打出当回合不会立刻获得格挡', () => {
    expect(playCard(setupScenario({ hand: ['ironBody'] }), 'ironBody').state.player.block).toBe(0)
  })

  it('每个回合结束都会触发', () => {
    let s = playCard(setupScenario({ hand: ['ironBody'] }), 'ironBody').state
    s = dispatch(s, { type: 'endTurn' }).state
    const { events } = dispatch(s, { type: 'endTurn' })
    expect(events).toContainEqual({ type: 'blockGained', target: 'player', amount: 3 })
  })
})

describe('荆棘护甲 (thornArmor)', () => {
  it('被攻击时反弹 3 点伤害给史莱姆', () => {
    const s = playCard(setupScenario({ hand: ['thornArmor'] }), 'thornArmor').state
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.enemies[0]!.hp).toBe(40 - 3)
    expect(events).toContainEqual({ type: 'statusTriggered', target: 'player', status: 'thorns' })
  })

  it('攻击被完全格挡时也会反弹', () => {
    const s = setupScenario({ hand: ['thornArmor', 'defend', 'defend'], energy: 3 })
    const after = playSequence(s, ['thornArmor', 'defend', 'defend']).state
    const { state } = dispatch(after, { type: 'endTurn' })
    // 两张防御共 10 点格挡，完全挡下史莱姆的 8 点攻击
    expect(state.player.hp).toBe(80)
    expect(state.enemies[0]!.hp).toBe(40 - 3)
  })

  it('敌人不攻击的回合不触发（史莱姆第二回合在防御）', () => {
    let s = playCard(setupScenario({ hand: ['thornArmor'] }), 'thornArmor').state
    s = dispatch(s, { type: 'endTurn' }).state
    const hpAfterFirst = s.enemies[0]!.hp
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.enemies[0]!.hp).toBe(hpAfterFirst)
  })

  it('玩家自己打出的攻击不会触发自己的荆棘', () => {
    const s = setupScenario({ hand: ['thornArmor', 'strike'], energy: 3 })
    const { state } = playSequence(s, ['thornArmor', 'strike'])
    expect(state.player.hp).toBe(80)
    expect(state.enemies[0]!.hp).toBe(40 - 6)
  })
})
