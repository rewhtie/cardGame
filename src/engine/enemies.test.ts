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
import { drainer, monsterPool, statue } from '@/data/enemies'
import { shiftStatus } from './effects'
import { calcAttack, statusById } from './statuses'
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
  it('舍身是负面状态', () => {
    expect(statusById.carapace!.kind).toBe('debuff')
    expect(statusById.carapace!.name).toBe('舍身')
  })
  it('完美防御：玩家身上的正面状态，攻击没掉血则攻击者晕眩，没完全格挡不晕', () => {
    const plain = () => dummy({ intents: [{ type: 'attack', damage: 5 }] })
    const a0 = fight([plain()])
    a0.player.statuses.perfectGuard = 1
    a0.player.block = 10
    expect(dispatch(a0, { type: 'endTurn' }).state.enemies[0]!.statuses.stunned).toBe(1)
    const b0 = fight([plain()])
    b0.player.statuses.perfectGuard = 1
    b0.player.block = 3
    expect(dispatch(b0, { type: 'endTurn' }).state.enemies[0]!.statuses.stunned).toBeUndefined()
    expect(statusById.perfectGuard!.kind).toBe('buff')
  })
  it('完美防御 + 舍身同时生效：同一次攻击晕 1 层（两个来源不重复计）', () => {
    const both = dummy({ startStatuses: { carapace: 1 }, intents: [{ type: 'attack', damage: 5 }] })
    const a0 = fight([both])
    a0.player.statuses.perfectGuard = 1
    a0.player.block = 10
    expect(dispatch(a0, { type: 'endTurn' }).state.enemies[0]!.statuses.stunned).toBe(1)
  })
  it('晕眩可叠加：3 层连续跳过 3 次行动，每次 -1，之后恢复行动', () => {
    const s0 = fight([dummy({ intents: [{ type: 'attack', damage: 5 }] })])
    s0.enemies[0]!.statuses.stunned = 3
    const hp = s0.player.hp
    let s = dispatch(s0, { type: 'endTurn' }).state
    expect(s.enemies[0]!.statuses.stunned).toBe(2)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.enemies[0]!.statuses.stunned).toBe(1)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(s.enemies[0]!.statuses.stunned).toBeUndefined()
    expect(s.player.hp).toBe(hp)
    expect(dispatch(s, { type: 'endTurn' }).state.player.hp).toBe(hp - 5)
  })
  it('多次攻击没掉血各叠 1 层晕眩（完美防御）', () => {
    const s0 = fight([dummy({ intents: [{ type: 'attack', damage: 5 }] })])
    s0.player.statuses.perfectGuard = 1
    s0.enemies[0]!.statuses.stunned = 2
    s0.player.block = 10
    // 先被晕眩跳过本次行动（-1），不会攻击，所以不新增层数
    expect(dispatch(s0, { type: 'endTurn' }).state.enemies[0]!.statuses.stunned).toBe(1)
  })
  it('完美防御在下个玩家回合开始时清空', () => {
    const s0 = fight([dummy({ intents: [{ type: 'attack', damage: 5 }] })])
    s0.player.statuses.perfectGuard = 1
    s0.player.block = 10
    const next = dispatch(s0, { type: 'endTurn' }).state
    expect(next.player.statuses.perfectGuard).toBeUndefined()
  })
  it('伤害为 0 的攻击（没有生命损伤）也算舍身触发', () => {
    const s0 = fight([dummy({ startStatuses: { carapace: 1 }, intents: [{ type: 'attack', damage: 0 }] })])
    const a = dispatch(s0, { type: 'endTurn' }).state
    expect(a.player.hp).toBe(s0.player.hp)
    expect(a.enemies[0]!.statuses.stunned).toBe(1)
  })
})

/** 受到伤害后结束回合：分裂在回合结束时才结算 */
const hit = (state: Parameters<typeof dispatch>[0], amount: number) =>
  dispatch(dispatch(state, { type: 'cheatDamage', amount }).state, { type: 'endTurn' })

describe('分裂与召唤', () => {
  const child = dummy({ id: 'child', maxHp: 20, intents: [{ type: 'attack', damage: 3 }] })
  const splitter = dummy({ maxHp: 40, startStatuses: { split: 1 }, splitInto: [child, child] })
  it('过半的敌人在回合结束时才分裂', () => {
    const r = hit(fight([splitter]), 20)
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
    const e = hit(fight([sp]), 25).state.enemies
    expect(e.map((x) => x.def.id)).toEqual(['dummy', 'a', 'b'])
    expect([e[1]!.hp, e[2]!.hp]).toEqual([15, 15])
  })
  it('分裂后恰好 4 只则分裂，5 只则不分裂', () => {
    const ok = hit(fight([splitter, dummy(), dummy()]), 20)
    expect(ok.state.enemies).toHaveLength(5)
    const no = hit(fight([splitter, dummy(), dummy(), dummy()]), 20)
    expect(no.state.enemies).toHaveLength(4)
  })
  it('一击打死不分裂', () => {
    const r = hit(fight([splitter]), 40)
    expect(r.state.enemies).toHaveLength(1)
  })
  it('满 4 只存活时不分裂', () => {
    const r = hit(fight([splitter, dummy(), dummy(), dummy()]), 20)
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
    const a = hit(fight([slimeBoss]), 70).state
    expect(a.enemies.map((e) => e.def.id)).toEqual([
      'slime-boss',
      'large-spike-slime',
      'large-acid-slime',
    ])
    expect([a.enemies[1]!.hp, a.enemies[2]!.hp]).toEqual([70, 70])
    const b = hit(a, 40).state
    expect(b.enemies).toHaveLength(7)
    expect(b.enemies.filter((e) => e.hp > 0)).toHaveLength(4)
    expect(b.enemies.filter((e) => e.hp > 0).every((e) => e.hp === 30)).toBe(true)
  })
  it('中史莱姆不再分裂', () => {
    expect(mediumSpikeSlime.splitInto).toBeUndefined()
    const s = fight([mediumSpikeSlime])
    const r = hit(s, 31).state
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

describe('汲取', () => {
  const drain = () => fight([dummy({ startStatuses: { drain: 1 } })])
  const play = (s: BattleState) => {
    const hand = s.hand.length ? s : { ...s, hand: ['strike'] }
    return dispatch(hand, { type: 'playCard', handIndex: 0, target: 0 }).state
  }
  it('shiftStatus 抵消到 0 时移除，可为负', () => {
    const s = drain()
    shiftStatus(s, 'player', 0, 'strength', 1, [])
    shiftStatus(s, 'player', 0, 'strength', -1, [])
    expect(s.player.statuses.strength).toBeUndefined()
    shiftStatus(s, 'player', 0, 'strength', -2, [])
    expect(s.player.statuses.strength).toBe(-2)
  })
  it('出牌后力量敏捷各 -1，且这张牌本身不受影响', () => {
    const s0 = drain()
    const s1 = play(s0)
    expect(s0.enemies[0]!.hp - s1.enemies[0]!.hp).toBe(6)
    expect(s1.player.statuses.strength).toBe(-1)
    expect(s1.player.statuses.dexterity).toBe(-1)
  })
  it('连打后伤害面板最低 0，不为负', () => {
    let s = drain()
    for (let i = 0; i < 9; i++) s = play({ ...s, hand: ['strike'] })
    expect(s.player.statuses.strength).toBe(-9)
    expect(calcAttack(6, s.player.statuses, {})).toBe(0)
  })
  it('致命一击不触发', () => {
    const s0 = fight([dummy({ maxHp: 6, startStatuses: { drain: 1 } })])
    const s1 = play(s0)
    expect(s1.player.statuses.strength).toBeUndefined()
    expect(s1.player.statuses.drained).toBeUndefined()
  })
  it('力量被削回 0 时状态移除', () => {
    const s0 = drain()
    s0.player.statuses.strength = 1
    expect(play(s0).player.statuses.strength).toBeUndefined()
  })
  it('回合结束精确恢复原有力量', () => {
    const s0 = drain()
    s0.player.statuses.strength = 2
    let s = play(s0)
    s = play({ ...s, hand: ['strike'] })
    const next = dispatch(s, { type: 'endTurn' }).state
    expect(next.player.statuses.strength).toBe(2)
    expect(next.player.statuses.dexterity).toBeUndefined()
    expect(next.player.statuses.drained).toBeUndefined()
  })
  it('多只汲取者叠加', () => {
    const s0 = fight([
      dummy({ startStatuses: { drain: 1 } }),
      dummy({ startStatuses: { drain: 1 } }),
    ])
    expect(play(s0).player.statuses.strength).toBe(-2)
  })
  it('汲取者数据', () => {
    expect(drainer.maxHp).toBe(80)
    expect(drainer.startStatuses).toEqual({ drain: 1 })
    expect(drainer.intents).toEqual([
      { type: 'attack', damage: 8 },
      { type: 'defend', block: 12 },
      { type: 'attack', damage: 14 },
    ])
  })
})

describe('裂纹', () => {
  const crack = () => fight([dummy({ startStatuses: { crack: 1 } })])
  const play = (s: BattleState) =>
    dispatch({ ...s, hand: ['strike'] }, { type: 'playCard', handIndex: 0, target: 0 }).state
  it('第 1 张牌 6 点，第 2 张 7 点，第 3 张 8 点', () => {
    const s0 = crack()
    const s1 = play(s0)
    const s2 = play(s1)
    const s3 = play(s2)
    expect(s0.enemies[0]!.hp - s1.enemies[0]!.hp).toBe(6)
    expect(s1.enemies[0]!.hp - s2.enemies[0]!.hp).toBe(7)
    expect(s2.enemies[0]!.hp - s3.enemies[0]!.hp).toBe(8)
  })
  it('致命一击不加层', () => {
    const s = play(fight([dummy({ maxHp: 6, startStatuses: { crack: 1 } })]))
    expect(s.enemies[0]!.statuses.cracked).toBeUndefined()
  })
  it('回合结束清零', () => {
    const s = play(play(crack()))
    expect(s.enemies[0]!.statuses.cracked).toBe(2)
    const next = dispatch(s, { type: 'endTurn' }).state
    expect(next.enemies[0]!.statuses.cracked).toBeUndefined()
  })
  it('作弊伤害（非出牌）不加层', () => {
    const s = dispatch(crack(), { type: 'cheatDamage', amount: 5 }).state
    expect(s.enemies[0]!.statuses.cracked).toBeUndefined()
  })
})

describe('雕像', () => {
  const hits = (events: { type: string; target?: string; amount?: number; blocked?: number }[]) =>
    events
      .filter((e) => e.type === 'damageDealt' && e.target === 'player')
      .reduce((n, e) => n + (e.amount ?? 0) + (e.blocked ?? 0), 0)
  const run = (turns: number) => {
    let s = fight([statue])
    s.player.maxHp = s.player.hp = 9999
    const out: number[] = []
    for (let i = 0; i < turns; i++) {
      const r = dispatch(s, { type: 'endTurn' })
      out.push(hits(r.events))
      s = r.state
    }
    return out
  }
  it('数据', () => {
    expect(statue.maxHp).toBe(80)
    expect(statue.startStatuses).toEqual({ crack: 1 })
    expect(statue.loopFrom).toBe(2)
    expect(statue.intents).toEqual([
      { type: 'idle' },
      { type: 'idle' },
      { type: 'attack', damage: 23 },
      { type: 'attack', damage: 25 },
      { type: 'attack', damage: 27, also: [{ type: 'debuff', status: 'frail', stacks: 2 }] },
    ])
    expect(monsterPool).toContain(statue)
  })
  it('前 2 回合蓄力，之后循环攻击 23、25、27', () => {
    expect(run(8)).toEqual([0, 0, 23, 25, 27, 23, 25, 27])
  })
  it('没有 loopFrom 的敌人仍整体循环', () => {
    let s = fight([dummy({ intents: [{ type: 'defend', block: 1 }, { type: 'defend', block: 2 }] })])
    const blocks: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = dispatch(s, { type: 'endTurn' })
      blocks.push(r.events.filter((e) => e.type === 'blockGained' && e.target === 'enemy').reduce((n, e) => n + (e as { amount: number }).amount, 0))
      s = r.state
    }
    expect(blocks).toEqual([1, 2, 1, 2])
  })
  it('25 点攻击的完美格挡判断', () => {
    let s = fight([statue])
    s.player.maxHp = s.player.hp = 9999
    for (let i = 0; i < 3; i++) s = dispatch(s, { type: 'endTurn' }).state
    // 第 4 个敌方回合伤害 25：25 格挡是完美格挡，24 不是
    const r25 = dispatch({ ...s, player: { ...s.player, block: 25 } }, { type: 'endTurn' })
    const r24 = dispatch({ ...s, player: { ...s.player, block: 24 } }, { type: 'endTurn' })
    expect(r25.events.some((e) => e.type === 'perfectBlock')).toBe(true)
    expect(r24.events.some((e) => e.type === 'perfectBlock')).toBe(false)
  })
})

describe('尸体', () => {
  it('召唤 / 分裂出的敌人和分裂掉的本体标记为死后消失，原有敌人不标记', () => {
    const s = fight([dummy(), dummy({ maxHp: 40, startStatuses: { split: 1 }, splitInto: [dummy(), dummy()] })])
    expect(s.enemies.every((e) => !e.vanishOnDeath)).toBe(true)
    const r = dispatch(s, { type: 'cheatDamage', amount: 25, target: 1 } as never)
    const after = dispatch(r.state, { type: 'endTurn' }).state
    expect(after.enemies[1]!.vanishOnDeath).toBe(true)
    expect(after.enemies.slice(2).every((e) => e.vanishOnDeath)).toBe(true)
    expect(after.enemies[0]!.vanishOnDeath).toBeUndefined()
  })
})

describe('寄生种子', () => {
  const host = (n: number) => dummy({ startStatuses: { parasite: n } })
  const hurt = (enemies: EnemyDef[]) => {
    const s = fight(enemies)
    s.player.hp = 10
    return s
  }
  it('层数 4 被攻击命中，回复 2 并清空', () => {
    const r = dispatch(hurt([host(4)]), { type: 'playCard', handIndex: 0 })
    expect(r.state.player.hp).toBe(12)
    expect(r.state.enemies[0]!.statuses.parasite).toBeUndefined()
  })
  it('层数 1 也至少回 1 血，然后被清空', () => {
    const r = dispatch(hurt([host(1)]), { type: 'playCard', handIndex: 0 })
    expect(r.state.player.hp).toBe(11)
    expect(r.state.enemies[0]!.statuses.parasite).toBeUndefined()
  })
  it('伤害被格挡吃光也触发', () => {
    const s = hurt([host(4)])
    s.enemies[0]!.block = 20
    const r = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(r.state.player.hp).toBe(12)
  })
  it('连续两次攻击只有第一次回血', () => {
    const r1 = dispatch(hurt([host(4)]), { type: 'playCard', handIndex: 0 })
    const r2 = dispatch(r1.state, { type: 'playCard', handIndex: 0 })
    expect(r2.state.player.hp).toBe(12)
  })
  it('作弊伤害（无来源）不触发也不清空', () => {
    const r = dispatch(hurt([host(4)]), { type: 'cheatDamage', amount: 5 })
    expect(r.state.player.hp).toBe(10)
    expect(r.state.enemies[0]!.statuses.parasite).toBe(4)
  })
  it('每个敌方回合开始 +1', () => {
    const r = dispatch(fight([host(1)]), { type: 'endTurn' })
    expect(r.state.enemies[0]!.statuses.parasite).toBe(2)
  })
  it('寄生之种：开战给所有敌人 3 层', () => {
    const s = createBattle({
      seed: 1,
      deck: ['strike'],
      enemies: [dummy(), dummy()],
      cards,
      relics: ['parasiteSeed'],
    }).state
    expect(s.enemies.map((e) => e.statuses.parasite)).toEqual([3, 3])
  })
})
