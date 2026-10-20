import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import { curseCards } from '@/data/cards/curses'
import {
  largeAcidSlime,
  largeSpikeSlime,
  mediumAcidSlime,
  mediumSpikeSlime,
  slimeBoss,
} from '@/data/enemies'
import type { BattleState, CardDef, EnemyDef } from './types'

const strike: CardDef = {
  id: 'strike',
  rarity: 'white',
  name: '打击',
  cost: 0,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 6 }],
  text: '',
}

const cards: Record<string, CardDef> = {
  strike,
  ...Object.fromEntries(curseCards.map((c) => [c.build().id, c.build()])),
}

const dummy = (over: Partial<EnemyDef> = {}): EnemyDef => ({
  id: 'dummy',
  name: 'dummy',
  maxHp: 100,
  intents: [{ type: 'defend', block: 1 }],
  ...over,
})

function fight(enemies: EnemyDef[], playerGold = 0): BattleState {
  return createBattle({
    seed: 1,
    deck: ['strike', 'strike', 'strike', 'strike', 'strike'],
    enemies,
    cards,
    playerGold,
  }).state
}

describe('伤害封顶', () => {
  it('单次攻击最多损失 N 点生命', () => {
    const r = dispatch(fight([dummy({ startStatuses: { damageCap: 9 } })]), {
      type: 'cheatDamage',
      amount: 30,
    })
    expect(r.state.enemies[0]!.hp).toBe(91)
  })
  it('格挡先抵消再封顶', () => {
    const s0 = fight([dummy({ startStatuses: { damageCap: 9 } })])
    s0.enemies[0]!.block = 5
    expect(dispatch(s0, { type: 'cheatDamage', amount: 12 }).state.enemies[0]!.hp).toBe(93)
  })
})

describe('蜂巢', () => {
  const hive = () => dummy({ startStatuses: { hive: 1 } })
  it('被打中塞晕眩', () => {
    const r = dispatch(fight([hive()]), { type: 'playCard', handIndex: 0 })
    expect(r.state.discardPile.filter((c) => c === 'stun')).toHaveLength(1)
    expect(r.events).toContainEqual({ type: 'cardAdded', cardId: 'stun', count: 1 })
  })
  it('伤害全被格挡也塞', () => {
    const s = fight([hive()])
    s.enemies[0]!.block = 20
    expect(dispatch(s, { type: 'playCard', handIndex: 0 }).state.discardPile).toContain('stun')
  })
  it('无来源伤害不塞', () => {
    const r = dispatch(fight([hive()]), { type: 'cheatDamage', amount: 5 })
    expect(r.state.discardPile).not.toContain('stun')
  })
})

describe('甲壳虫', () => {
  const beetle = () =>
    dummy({
      startStatuses: { carapace: 1 },
      intents: [
        { type: 'attack', damage: 5 },
        { type: 'attack', damage: 7 },
      ],
    })
  it('完全格挡后晕一回合且不推进循环', () => {
    const s0 = fight([beetle()])
    s0.player.block = 10
    const a = dispatch(s0, { type: 'endTurn' }).state
    expect(a.enemies[0]!.statuses.stunned).toBe(1)
    expect(a.enemies[0]!.intentIndex).toBe(1)
    const hp = a.player.hp
    const b = dispatch(a, { type: 'endTurn' }).state
    expect(b.player.hp).toBe(hp)
    expect(b.enemies[0]!.statuses.stunned).toBeUndefined()
    expect(b.enemies[0]!.intentIndex).toBe(1)
    expect(dispatch(b, { type: 'endTurn' }).state.player.hp).toBe(hp - 7)
  })
  it('没完全格挡不晕', () => {
    const s0 = fight([beetle()])
    s0.player.block = 3
    expect(dispatch(s0, { type: 'endTurn' }).state.enemies[0]!.statuses.stunned).toBeUndefined()
  })
})

describe('分裂与召唤', () => {
  const child = dummy({ id: 'child', maxHp: 20, intents: [{ type: 'attack', damage: 3 }] })
  const splitter = dummy({ maxHp: 40, startStatuses: { split: 1 }, splitInto: [child, child] })
  it('过半分裂成两只', () => {
    const r = dispatch(fight([splitter]), { type: 'cheatDamage', amount: 20 })
    const e = r.state.enemies
    expect(e).toHaveLength(3)
    expect([e[0]!.hp, e[1]!.hp, e[2]!.hp]).toEqual([0, 20, 20])
    expect(e[1]!.def.id).toBe('child')
    expect(r.events.some((x) => x.type === 'enemySplit')).toBe(true)
  })
  it('不同种类一次分出，各带剩余生命', () => {
    const a = dummy({ id: 'a', maxHp: 20 })
    const b = dummy({ id: 'b', maxHp: 20 })
    const sp = dummy({ maxHp: 40, startStatuses: { split: 1 }, splitInto: [a, b] })
    const e = dispatch(fight([sp]), { type: 'cheatDamage', amount: 25 }).state.enemies
    expect(e.map((x) => x.def.id)).toEqual(['dummy', 'a', 'b'])
    expect([e[1]!.hp, e[2]!.hp]).toEqual([15, 15])
  })
  it('分裂后恰好 4 只则分裂，5 只则不分裂', () => {
    const ok = dispatch(fight([splitter, dummy(), dummy()]), { type: 'cheatDamage', amount: 20 })
    expect(ok.state.enemies).toHaveLength(5)
    const no = dispatch(fight([splitter, dummy(), dummy(), dummy()]), {
      type: 'cheatDamage',
      amount: 20,
    })
    expect(no.state.enemies).toHaveLength(4)
  })
  it('一击打死不分裂', () => {
    const r = dispatch(fight([splitter]), { type: 'cheatDamage', amount: 40 })
    expect(r.state.enemies).toHaveLength(1)
  })
  it('满 4 只存活时不分裂', () => {
    const r = dispatch(fight([splitter, dummy(), dummy(), dummy()]), {
      type: 'cheatDamage',
      amount: 20,
    })
    expect(r.state.enemies).toHaveLength(4)
    expect(r.state.enemies[0]!.hp).toBe(20)
  })
  it('召唤追加敌人且新敌人当回合不行动', () => {
    const summoner = dummy({ intents: [{ type: 'summon', enemy: child }] })
    const s = fight([summoner])
    const hp = s.player.hp
    const r = dispatch(s, { type: 'endTurn' })
    expect(r.state.enemies).toHaveLength(2)
    expect(r.state.player.hp).toBe(hp)
    expect(r.events.some((x) => x.type === 'enemySpawned')).toBe(true)
  })
  it('满员时召唤落空', () => {
    const summoner = dummy({ intents: [{ type: 'summon', enemy: child }] })
    const full = fight([summoner, dummy(), dummy(), dummy()])
    expect(dispatch(full, { type: 'endTurn' }).state.enemies).toHaveLength(4)
  })
})

describe('哥布林', () => {
  const gob = () =>
    dummy({
      maxHp: 30,
      intents: [
        { type: 'steal', amount: 15 },
        { type: 'flee' },
      ],
    })
  it('只偷剩下的金币', () => {
    const a = dispatch(fight([gob()], 10), { type: 'endTurn' }).state
    expect(a.gold).toBe(0)
    expect(a.enemies[0]!.stolenGold).toBe(10)
    expect(dispatch(fight([gob()], 0), { type: 'endTurn' }).state.gold).toBe(0)
  })
  it('击杀归还', () => {
    const a = dispatch(fight([gob(), dummy()], 10), { type: 'endTurn' }).state
    const r = dispatch(a, { type: 'cheatDamage', amount: 99 })
    expect(r.state.gold).toBe(10)
    expect(r.events.some((x) => x.type === 'goldReturned')).toBe(true)
  })
  it('中毒致死也归还', () => {
    const a = dispatch(fight([gob(), dummy()], 10), { type: 'endTurn' }).state
    a.enemies[0]!.statuses.poison = 99
    expect(dispatch(a, { type: 'endTurn' }).state.gold).toBe(10)
  })
  it('逃跑成功：战斗以逃脱结束，金币不归还', () => {
    const a = dispatch(fight([gob()], 10), { type: 'endTurn' }).state
    const r = dispatch(a, { type: 'endTurn' })
    expect(r.state.phase).toBe('won')
    expect(r.state.escaped).toBe(true)
    expect(r.state.gold).toBe(0)
    expect(r.events.some((x) => x.type === 'enemyFled')).toBe(true)
  })
  it('还有别的敌人时战斗继续', () => {
    const a = dispatch(fight([gob(), dummy()], 10), { type: 'endTurn' }).state
    const r = dispatch(a, { type: 'endTurn' }).state
    expect(r.phase).toBe('player')
    expect(r.escaped).toBeUndefined()
  })
})

describe('粘液', () => {
  it('打出消耗并花 1 能量；不打出则进弃牌堆', () => {
    const s0 = fight([dummy()])
    s0.hand = ['slimed']
    const r = dispatch(s0, { type: 'playCard', handIndex: 0 }).state
    expect(r.player.energy).toBe(s0.player.energy - 1)
    expect(r.exhaustPile).toContain('slimed')
    expect(r.discardPile).not.toContain('slimed')
    const s1 = fight([dummy()])
    s1.hand = ['slimed']
    const er = dispatch(s1, { type: 'endTurn' })
    const e = er.pre ?? er.state
    expect(e.discardPile).toContain('slimed')
    expect(e.exhaustPile).not.toContain('slimed')
  })
})

describe('塞牌与蓄力', () => {
  const count = (s: BattleState) => s.discardPile.filter((c) => c === 'slimed').length
  it('addCards 意图', () => {
    const r = dispatch(fight([dummy({ intents: [{ type: 'addCards', cardId: 'slimed', count: 3 }] })]), {
      type: 'endTurn',
    })
    expect(count(r.pre ?? r.state)).toBe(3)
    expect(r.events.some((x) => x.type === 'cardAdded')).toBe(true)
  })
  it('攻击带塞牌，全被格挡也塞', () => {
    const s = fight([
      dummy({ intents: [{ type: 'attack', damage: 10, addCards: { cardId: 'slimed', count: 2 } }] }),
    ])
    s.player.block = 50
    const hp = s.player.hp
    const res = dispatch(s, { type: 'endTurn' })
    const r = res.pre ?? res.state
    expect(count(r)).toBe(2)
    expect(r.player.hp).toBe(hp)
  })
  it('idle 不影响玩家，循环照常推进', () => {
    const s = fight([dummy({ intents: [{ type: 'idle' }, { type: 'attack', damage: 5 }] })])
    const hp = s.player.hp
    const a = dispatch(s, { type: 'endTurn' }).state
    expect(a.player.hp).toBe(hp)
    expect(a.enemies[0]!.intentIndex).toBe(1)
    expect(count(a)).toBe(0)
    expect(dispatch(a, { type: 'endTurn' }).state.player.hp).toBe(hp - 5)
  })
})

describe('史莱姆老大数据', () => {
  it('本体循环与自带分裂', () => {
    expect(slimeBoss.maxHp).toBe(140)
    expect(slimeBoss.intents).toEqual([
      { type: 'addCards', cardId: 'slimed', count: 3 },
      { type: 'idle' },
      { type: 'attack', damage: 35 },
    ])
    expect(slimeBoss.startStatuses).toEqual({ split: 1 })
  })
  it('整条分裂链：老大 → 大尖刺 + 大酸液 → 各分成两只中史莱姆', () => {
    const a = dispatch(fight([slimeBoss]), { type: 'cheatDamage', amount: 70 }).state
    expect(a.enemies.map((e) => e.def.id)).toEqual([
      'slime-boss',
      'large-spike-slime',
      'large-acid-slime',
    ])
    expect([a.enemies[1]!.hp, a.enemies[2]!.hp]).toEqual([70, 70])
    const b = dispatch(a, { type: 'cheatDamage', amount: 40 }).state
    expect(b.enemies).toHaveLength(7)
    expect(b.enemies.filter((e) => e.hp > 0)).toHaveLength(4)
    expect(b.enemies.filter((e) => e.hp > 0).every((e) => e.hp === 30)).toBe(true)
  })
  it('中史莱姆不再分裂', () => {
    expect(mediumSpikeSlime.splitInto).toBeUndefined()
    const s = fight([mediumSpikeSlime])
    const r = dispatch(s, { type: 'cheatDamage', amount: 31 }).state
    expect(r.enemies).toHaveLength(1)
    expect(r.enemies[0]!.hp).toBe(1)
  })
  it('小弟的意图序列', () => {
    const slimed = (count: number) => ({ cardId: 'slimed', count })
    expect(largeSpikeSlime.intents).toEqual([
      { type: 'attack', damage: 16, addCards: slimed(2) },
      { type: 'debuff', status: 'frail', stacks: 2 },
    ])
    expect(largeAcidSlime.intents).toEqual([
      { type: 'attack', damage: 11, addCards: slimed(2) },
      { type: 'attack', damage: 16 },
      { type: 'debuff', status: 'weak', stacks: 2 },
    ])
    expect(mediumSpikeSlime.intents).toEqual([
      { type: 'attack', damage: 8, addCards: slimed(1) },
      { type: 'debuff', status: 'frail', stacks: 1 },
    ])
    expect(mediumAcidSlime.intents).toEqual([
      { type: 'attack', damage: 7, addCards: slimed(1) },
      { type: 'attack', damage: 10 },
      { type: 'debuff', status: 'weak', stacks: 1 },
    ])
  })
})
