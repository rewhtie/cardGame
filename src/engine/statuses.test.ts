import { describe, expect, it } from 'vitest'
import { cards, starterDeck } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createBattle, dispatch } from './battle'
import { calcAttack, calcBlock } from './statuses'
import type { BattleState, CardDef } from './types'

function start(seed = 1): BattleState {
  return createBattle({ seed, deck: starterDeck, enemy: slime, cards }).state
}
function withHand(state: BattleState, hand: string[]): BattleState {
  return { ...state, hand }
}

const testCards: Record<string, CardDef> = {
  ...cards,
  tPower: {
    id: 'tPower',
    rarity: 'gold',
    name: '测试能力',
    cost: 1,
    target: 'self',
    kind: 'power',
    effects: [{ type: 'applyStatus', status: 'strength', stacks: 2, to: 'self' }],
    text: '获得 2 层力量',
  },
  tExhaust: {
    id: 'tExhaust',
    rarity: 'white',
    name: '测试消耗',
    cost: 0,
    target: 'self',
    kind: 'skill',
    exhaust: true,
    effects: [{ type: 'heal', amount: 5 }],
    text: '恢复 5 点生命，消耗',
  },
  tHex: {
    id: 'tHex',
    rarity: 'white',
    name: '测试诅咒',
    cost: 1,
    target: 'enemy',
    kind: 'attack',
    effects: [{ type: 'applyStatus', status: 'vulnerable', stacks: 2, to: 'target' }],
    text: '给予 2 层易伤',
  },
  tAll: {
    id: 'tAll',
    rarity: 'white',
    name: '测试群体',
    cost: 0,
    target: 'self',
    kind: 'skill',
    effects: [{ type: 'applyStatus', status: 'weak', stacks: 1, to: 'allEnemies' }],
    text: '给予所有敌人 1 层虚弱',
  },
}

function startWith(deck: string[], seed = 1): BattleState {
  return createBattle({ seed, deck, enemy: slime, cards: testCards }).state
}

describe('伤害结算顺序', () => {
  it('先加算后乘算最后取整：(6+2)×0.75×1.5 = 9', () => {
    expect(calcAttack(6, { strength: 2, weak: 1 }, { vulnerable: 1 })).toBe(9)
  })
  it('无状态时原样返回', () => {
    expect(calcAttack(6, {}, {})).toBe(6)
  })
  it('敏捷加到格挡上', () => {
    expect(calcBlock(5, { dexterity: 2 })).toBe(7)
  })
  it('伤害向下取整到 0 而不是负数', () => {
    expect(calcAttack(1, { weak: 1 }, {})).toBe(0)
  })
})

describe('力量与虚弱作用于出牌', () => {
  it('力量 +2：打击造成 8 点', () => {
    const s = withHand(start(), ['strike'])
    s.player.statuses = { strength: 2 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 8)
  })
  it('虚弱：打击造成 floor(6×0.75)=4 点', () => {
    const s = withHand(start(), ['strike'])
    s.player.statuses = { weak: 1 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 4)
  })
})

describe('完美格挡按最终伤害判断', () => {
  it('敌人有力量时，8 点格挡不再算完美格挡', () => {
    const s = start()
    s.enemies[0]!.statuses = { strength: 2 }
    s.player.block = 8
    const { events } = dispatch(s, { type: 'endTurn' })
    expect(events.some((e) => e.type === 'perfectBlock')).toBe(false)
  })
})

describe('能力牌与消耗牌的去向', () => {
  it('能力牌：不进弃牌堆、不进消耗堆，并给玩家上状态', () => {
    const s = withHand(startWith(starterDeck), ['tPower'])
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.hand).toEqual([])
    expect(state.discardPile).not.toContain('tPower')
    expect(state.exhaustPile).not.toContain('tPower')
    expect(state.player.statuses.strength).toBe(2)
  })

  it('消耗牌进消耗牌堆，治疗不超过上限', () => {
    const s = withHand(startWith(starterDeck), ['tExhaust'])
    s.player.hp = 78
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.exhaustPile).toEqual(['tExhaust'])
    expect(state.discardPile).toEqual([])
    expect(state.player.hp).toBe(80)
    expect(events).toContainEqual({ type: 'healed', target: 'player', amount: 2 })
  })

  it('攻击牌给目标上状态，并发 statusApplied', () => {
    const s = withHand(startWith(starterDeck), ['tHex'])
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.statuses.vulnerable).toBe(2)
    expect(events).toContainEqual({
      type: 'statusApplied',
      target: 'enemy',
      status: 'vulnerable',
      stacks: 2,
      enemyIndex: 0,
    })
  })

  it('allEnemies 只作用于存活的敌人，全部死亡时不报错', () => {
    const s = withHand(startWith(starterDeck), ['tAll'])
    s.enemies[0]!.hp = 0
    expect(() => dispatch(s, { type: 'playCard', handIndex: 0 })).not.toThrow()
  })

  it('层数 <= 0 的上状态被忽略', () => {
    const s = withHand(startWith(starterDeck), ['tPower'])
    s.cards = {
      ...s.cards,
      tPower: {
        ...s.cards.tPower!,
        effects: [{ type: 'applyStatus', status: 'strength', stacks: 0, to: 'self' }],
      },
    }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.statuses.strength).toBeUndefined()
  })

  it('能力牌打出后洗牌不会重复或丢牌', () => {
    const s = withHand(startWith(['tPower', 'strike', 'strike']), ['tPower'])
    s.drawPile = ['strike', 'strike']
    s.discardPile = []
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    const all = [...state.hand, ...state.drawPile, ...state.discardPile, ...state.exhaustPile]
    expect(all).not.toContain('tPower')
    expect(all.filter((c) => c === 'strike')).toHaveLength(2)
  })
})

describe('敏捷', () => {
  it('敏捷 +2：防御获得 7 点格挡', () => {
    const s = withHand(startWith(starterDeck), ['defend'])
    s.player.statuses = { dexterity: 2 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.block).toBe(7)
  })
})

describe('回合触发与衰减', () => {
  it('中毒：玩家回合开始失去 N 点生命并衰减', () => {
    const s = start()
    s.player.statuses = { poison: 3 }
    const next = dispatch(s, { type: 'endTurn' }).state
    expect(next.player.hp).toBe(80 - 8 - 2)
    expect(next.player.statuses.poison).toBe(2)
  })

  it('中毒致死：不抽牌，直接判负', () => {
    const s = start()
    s.player.statuses = { poison: 5 }
    s.player.hp = 9
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.phase).toBe('lost')
    expect(events).toContainEqual({ type: 'battleEnded', result: 'lost' })
  })

  it('敌人中毒致死：跳过其意图，战斗胜利', () => {
    const s = start()
    s.enemies[0]!.hp = 3
    s.enemies[0]!.statuses = { poison: 5 }
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.phase).toBe('won')
    expect(events.some((e) => e.type === 'enemyActed')).toBe(false)
  })

  it('再生：回合结束恢复，tick 到 0 后移除', () => {
    const s = start()
    s.player.hp = 50
    s.player.statuses = { regen: 1 }
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.player.statuses.regen).toBeUndefined()
    expect(events).toContainEqual({ type: 'statusRemoved', target: 'player', status: 'regen' })
    expect(state.player.hp).toBe(50 + 1 - 8)
  })

  it('钢铁之躯：回合结束获得格挡，挡住敌人攻击', () => {
    const s = start()
    s.player.statuses = { metallicize: 8 }
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.player.hp).toBe(80)
  })

  it('永久状态（力量）不衰减', () => {
    const s = start()
    s.player.statuses = { strength: 3 }
    const next = dispatch(s, { type: 'endTurn' }).state
    expect(next.player.statuses.strength).toBe(3)
  })

  it('同一回合内按注册表顺序结算，与插入顺序无关', () => {
    const a = start()
    a.player.statuses = { regen: 2, metallicize: 3 }
    const b = start()
    b.player.statuses = { metallicize: 3, regen: 2 }
    expect(dispatch(a, { type: 'endTurn' }).events).toEqual(dispatch(b, { type: 'endTurn' }).events)
  })
})

describe('荆棘', () => {
  it('玩家攻击带荆棘的敌人：玩家受到反伤', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.statuses = { thorns: 3 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.hp).toBe(77)
  })

  it('敌人攻击带荆棘的玩家：敌人受到反伤', () => {
    const s = start()
    s.player.statuses = { thorns: 4 }
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 4)
  })

  it('双方都有荆棘：只反伤一次，不无限递归', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.statuses = { thorns: 3 }
    s.player.statuses = { thorns: 3 }
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.hp).toBe(77)
    expect(events.filter((e) => e.type === 'statusTriggered')).toHaveLength(1)
  })

  it('被完全格挡的攻击也会触发荆棘', () => {
    const s = start()
    s.player.statuses = { thorns: 2 }
    s.player.block = 99
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 2)
  })
})

describe('敌人意图', () => {
  const debuffer = {
    ...slime,
    intents: [
      { type: 'debuff', status: 'weak', stacks: 2 },
      { type: 'buff', status: 'strength', stacks: 3 },
    ] as typeof slime.intents,
  }

  it('debuff 意图给玩家上状态，buff 意图给自己上状态', () => {
    const s = createBattle({ seed: 1, deck: starterDeck, enemy: debuffer, cards }).state
    const a = dispatch(s, { type: 'endTurn' }).state
    expect(a.player.statuses.weak).toBe(2)
    const b = dispatch(a, { type: 'endTurn' }).state
    expect(b.enemies[0]!.statuses.strength).toBe(3)
  })

  it('同种子、同操作序列结果完全一致', () => {
    const run = () => {
      let s = withHand(start(7), ['strike'])
      s.player.statuses = { poison: 2, strength: 1 }
      s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
      return dispatch(s, { type: 'endTurn' }).state
    }
    expect(run()).toEqual(run())
  })
})

describe('Card 构建器', () => {
  it('能力牌：kind 为 power，自身目标，文案自动生成', () => {
    const c = cards.inflame!
    expect(c.kind).toBe('power')
    expect(c.target).toBe('self')
    expect(c.text).toBe('获得 2 层力量')
  })
  it('消耗牌文案带"消耗"，且不是能力牌', () => {
    expect(cards.bandage).toMatchObject({
      kind: 'skill',
      exhaust: true,
      text: '恢复 6 点生命，消耗',
    })
  })
  it('痛击：攻击牌 + 给予易伤', () => {
    expect(cards.bash).toMatchObject({ kind: 'attack', text: '造成 8 点伤害，给予 2 层易伤' })
  })
  it('附魔后状态层数与文案同步 +1', () => {
    const s = createBattle({
      seed: 1,
      deck: ['inflame*', 'defend', 'defend', 'defend', 'defend'],
      enemy: slime,
      cards,
    }).state
    const id = s.hand.find((c) => c.startsWith('inflame*'))!
    const { state } = dispatch({ ...s, hand: [id] }, { type: 'playCard', handIndex: 0 })
    expect(state.player.statuses.strength).toBe(2)
    expect(state.cards[id]!.text).toBe('获得 3 层力量')
  })
})

describe('脆弱', () => {
  it('格挡 ×0.75，与敏捷先加后乘', () => {
    expect(calcBlock(10, { frail: 1 })).toBe(7)
    expect(calcBlock(10, { frail: 1, dexterity: 2 })).toBe(9)
  })
})
