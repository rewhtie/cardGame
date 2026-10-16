import { describe, expect, it } from 'vitest'
import { cards, starterDeck } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createBattle, dispatch } from './battle'
import type { BattleState } from './types'

function start(seed = 1): BattleState {
  return createBattle({ seed, deck: starterDeck, enemy: slime, cards }).state
}

function withHand(state: BattleState, hand: string[]): BattleState {
  return { ...state, hand }
}

describe('createBattle', () => {
  it('初始为第 1 回合：抽 5 张、3 能量', () => {
    const s = start()
    expect(s.turn).toBe(1)
    expect(s.phase).toBe('player')
    expect(s.hand).toHaveLength(5)
    expect(s.drawPile).toHaveLength(5)
    expect(s.player.energy).toBe(3)
    expect(s.player.hp).toBe(80)
    expect(s.enemies[0]!.hp).toBe(40)
  })

  it('同种子同初始手牌', () => {
    expect(start(5).hand).toEqual(start(5).hand)
  })
})

describe('playCard', () => {
  it('打击：扣能量、造成伤害、进弃牌堆', () => {
    const s = withHand(start(), ['strike', 'defend'])
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(34)
    expect(state.player.energy).toBe(2)
    expect(state.hand).toEqual(['defend'])
    expect(state.discardPile).toEqual(['strike'])
    expect(events).toContainEqual({
      type: 'damageDealt',
      target: 'enemy',
      amount: 6,
      blocked: 0,
      enemyIndex: 0,
    })
  })

  it('防御：获得格挡', () => {
    const s = withHand(start(), ['defend'])
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.block).toBe(5)
  })

  it('疾跑：0 费抽 2 张', () => {
    const s = withHand(start(), ['dash'])
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.energy).toBe(3)
    expect(state.hand).toHaveLength(2)
    expect(state.drawPile).toHaveLength(3)
  })

  it('格挡先于生命吸收伤害', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.block = 4
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.block).toBe(0)
    expect(state.enemies[0]!.hp).toBe(38)
    expect(events).toContainEqual({
      type: 'damageDealt',
      target: 'enemy',
      amount: 2,
      blocked: 4,
      enemyIndex: 0,
    })
  })

  it('能量不足被拒绝，状态不变', () => {
    const s = withHand(start(), ['strike'])
    s.player.energy = 0
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state).toBe(s)
    expect(events).toEqual([{ type: 'invalidAction', reason: '能量不足' }])
  })

  it('手牌索引非法被拒绝', () => {
    const s = start()
    for (const handIndex of [-1, 5, 1.5]) {
      const { state, events } = dispatch(s, { type: 'playCard', handIndex })
      expect(state).toBe(s)
      expect(events[0]?.type).toBe('invalidAction')
    }
  })

  it('不修改入参状态', () => {
    const s = withHand(start(), ['strike'])
    const snapshot = structuredClone(s)
    dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(s).toEqual(snapshot)
  })
})

describe('endTurn', () => {
  it('弃牌、敌人行动、进入新回合', () => {
    const s = start()
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.turn).toBe(2)
    expect(state.player.hp).toBe(72) // 史莱姆首个意图：攻击 8
    expect(state.player.energy).toBe(3)
    expect(state.player.block).toBe(0)
    expect(state.hand).toHaveLength(5)
    expect(state.enemies[0]!.intentIndex).toBe(1)
    expect(events).toContainEqual({ type: 'handDiscarded', count: 5 })
    expect(events).toContainEqual({ type: 'turnStarted', turn: 2 })
  })

  it('玩家格挡可抵消敌人攻击', () => {
    const s = start()
    s.player.block = 5
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.player.hp).toBe(77)
  })

  it('敌人意图循环：攻击 -> 防御 -> 攻击 -> 回到起点', () => {
    let s = start()
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.enemies[0]!.intentIndex).toBe(1)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.enemies[0]!.block).toBe(6)
    expect(s.enemies[0]!.intentIndex).toBe(2)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.player.hp).toBe(80 - 8 - 12)
    expect(s.enemies[0]!.intentIndex).toBe(0)
  })

  it('抽牌堆耗尽时洗回弃牌堆', () => {
    let s = start()
    s = dispatch(s, { type: 'endTurn' }).state // 抽完牌堆最后 5 张
    expect(s.drawPile).toHaveLength(0)
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(events).toContainEqual({ type: 'reshuffled' })
    expect(state.hand).toHaveLength(5)
    expect(state.hand.length + state.drawPile.length + state.discardPile.length).toBe(10)
  })
})

describe('胜负判定', () => {
  it('敌人血量归零判胜，之后拒绝操作', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.hp = 6
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.phase).toBe('won')
    expect(events).toContainEqual({ type: 'battleEnded', result: 'won' })

    const after = dispatch(state, { type: 'endTurn' })
    expect(after.state).toBe(state)
    expect(after.events[0]?.type).toBe('invalidAction')
  })

  it('玩家血量归零判负', () => {
    const s = start()
    s.player.hp = 8
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.phase).toBe('lost')
    expect(state.player.hp).toBe(0)
    expect(events).toContainEqual({ type: 'battleEnded', result: 'lost' })
  })
})

describe('易伤与圆盾', () => {
  function battle(relics: string[]): BattleState {
    return createBattle({ seed: 1, deck: starterDeck, enemy: slime, cards, relics }).state
  }

  it('易伤使敌人受到的伤害 +50%，向下取整', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.statuses = { vulnerable: 1 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 9)
  })

  it('完美格挡且持有圆盾：敌人获得 1 层易伤，且在下个玩家回合仍有效', () => {
    const s = battle(['roundShield'])
    s.player.block = 8
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.player.hp).toBe(s.player.hp)
    expect(events).toContainEqual({ type: 'perfectBlock' })
    expect(state.enemies[0]!.statuses.vulnerable).toBe(1)

    // 再过一个敌人回合后，易伤消失
    const next = dispatch(state, { type: 'endTurn' }).state
    expect(next.enemies[0]!.statuses.vulnerable ?? 0).toBe(0)
  })

  it('格挡不足以完全吸收，不算完美格挡', () => {
    const s = battle(['roundShield'])
    s.player.block = 7
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(events.some((e) => e.type === 'perfectBlock')).toBe(false)
    expect(state.enemies[0]!.statuses.vulnerable ?? 0).toBe(0)
  })

  it('没有圆盾，完美格挡不产生易伤', () => {
    const s = battle([])
    s.player.block = 8
    expect(dispatch(s, { type: 'endTurn' }).state.enemies[0]!.statuses.vulnerable ?? 0).toBe(0)
  })
})

describe('附魔牌（训练指南）', () => {
  function enchanted(): BattleState {
    return createBattle({
      seed: 1,
      deck: ['strike*', 'defend', 'defend', 'defend', 'defend', 'defend'],
      enemy: slime,
      cards,
    }).state
  }

  it('每打出一次，数值与卡面文字 +1，并持续累积', () => {
    let s = withHand(enchanted(), ['strike*#0', 'strike*#0', 'strike*#0'])
    s.player.energy = 3
    const hp = s.enemies[0]!.hp
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(hp - s.enemies[0]!.hp).toBe(6 + 7 + 8)
    expect(s.cards['strike*#0']?.text).toBe('造成 9 点伤害')
  })

  it('不影响未附魔的同名牌，也不污染下一场战斗', () => {
    let s = withHand(enchanted(), ['strike*#0'])
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.cards['strike']?.effects).toEqual([{ type: 'damage', amount: 6 }])
    expect(enchanted().cards['strike*#0']?.effects).toEqual([{ type: 'damage', amount: 6 }])
  })

  it('防御类同理：5 点格挡打出后变 6 点', () => {
    const base = createBattle({ seed: 1, deck: ['defend*', 'strike'], enemy: slime, cards }).state
    let s = withHand(base, ['defend*#0', 'defend*#0'])
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.player.block).toBe(5)
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.player.block).toBe(5 + 6)
  })
})

describe('X 费牌', () => {
  function xBattle(deck: string[]): BattleState {
    return createBattle({ seed: 1, deck, enemy: slime, cards }).state
  }

  it('旋身打击：消耗全部能量，造成 6×X 点伤害', () => {
    const s = withHand(xBattle(['spinStrike']), ['spinStrike'])
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.energy).toBe(0)
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 18)
  })

  it('回旋防御：获得 6×X 点格挡；X 为 0 时无效果但可以打出', () => {
    const s = withHand(xBattle(['spinDefend']), ['spinDefend', 'spinDefend'])
    let r = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(r.player.block).toBe(18)
    r = dispatch(r, { type: 'playCard', handIndex: 0 }).state
    expect(r.player.block).toBe(18)
  })

  it('附魔的 X 牌：X 每次 +1，而不是 6 变成 7', () => {
    let s = withHand(xBattle(['spinStrike*']), ['spinStrike*#0', 'spinStrike*#0'])
    expect(s.cards['spinStrike*#0']?.enchanted).toBe(true)
    expect(s.cards['spinStrike*#0']?.name).toBe('旋身打击')

    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.enemies[0]!.hp).toBe(slime.maxHp - 6 * 3)
    expect(s.cards['spinStrike*#0']?.xBonus).toBe(1)
    s.player.energy = 2
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.enemies[0]!.hp).toBe(slime.maxHp - 6 * 3 - 6 * (2 + 1))
  })
})

describe('多张附魔牌互相独立', () => {
  it('两张附魔打击各自累积，打出一张不影响另一张', () => {
    const base = createBattle({
      seed: 1,
      deck: ['strike*', 'strike*', 'defend', 'defend', 'defend', 'defend'],
      enemy: slime,
      cards,
    }).state
    expect(Object.keys(base.cards)).toEqual(expect.arrayContaining(['strike*#0', 'strike*#1']))

    let s = withHand(base, ['strike*#0', 'strike*#1'])
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(s.cards['strike*#0']?.effects).toEqual([{ type: 'damage', amount: 7 }])
    expect(s.cards['strike*#1']?.effects).toEqual([{ type: 'damage', amount: 6 }])

    // 另一张第一次打出仍是 6 点
    const hp = s.enemies[0]!.hp
    s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(hp - s.enemies[0]!.hp).toBe(6)
  })
})
