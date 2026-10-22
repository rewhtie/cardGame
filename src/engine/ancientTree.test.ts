import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { BattleState, CardDef, EnemyDef } from './types'

const base = { rarity: 'white', cost: 0, kind: 'attack', text: '' } as const
const strike: CardDef = { ...base, id: 'strike', name: '打击', target: 'enemy', effects: [{ type: 'damage', amount: 6 }] }
const convert: CardDef = { ...base, id: 'convert', name: '转化', target: 'enemy', effects: [{ type: 'convertCorpse' }] }
const cards = { strike, convert }

const dummy = (over: Partial<EnemyDef> = {}): EnemyDef => ({
  id: 'dummy',
  name: 'dummy',
  maxHp: 100,
  intents: [{ type: 'attack', damage: 5 }],
  ...over,
})

function fight(enemies: EnemyDef[], deck = ['convert', 'convert', 'strike', 'strike', 'strike']): BattleState {
  return createBattle({ seed: 1, deck, enemies, cards }).state
}
const handIdx = (s: BattleState, id: string) => s.hand.indexOf(id)

describe('尸体转随从', () => {
  const ready = (n = 2) => {
    const s = fight(Array.from({ length: n }, () => dummy()))
    s.enemies[0]!.hp = 3
    s.enemies[0]!.statuses.parasite = 5
    return s
  }
  const play = (s: BattleState) =>
    dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'convert'), target: 0 })

  it('寄生层数不低于当前生命一半才生效；不足时被拒绝，牌留在手里', () => {
    const s = ready()
    s.enemies[0]!.statuses.parasite = 1
    const r = play(s)
    expect(r.events[0]).toMatchObject({ type: 'invalidAction' })
    expect(r.state.hand).toContain('convert')
  })
  it('普通敌人变成 20 血随从，尸体留在原位', () => {
    const r = play(ready())
    expect(r.state.minions).toEqual([{ hp: 20, enemyIndex: 0 }])
    expect(r.state.enemies[0]!.hp).toBe(0)
    expect(r.state.enemies[0]!.statuses.parasite).toBeUndefined()
    expect(r.state.phase).toBe('player')
  })
  it('召唤 / 分裂敌人被拒绝', () => {
    const s = ready()
    s.enemies[0]!.vanishOnDeath = true
    expect(play(s).events[0]).toMatchObject({ type: 'invalidAction' })
  })
  it('最后一只存活敌人：战斗胜利，无随从', () => {
    const r = play(ready(1))
    expect(r.state.phase).toBe('won')
    expect(r.state.minions ?? []).toHaveLength(0)
  })
  it('已有 3 只随从时被拒绝', () => {
    const s = ready()
    s.minions = [1, 2, 3].map(() => ({ hp: 20, enemyIndex: 9 }))
    expect(play(s).events[0]).toMatchObject({ type: 'invalidAction' })
  })
})

describe('指挥牌', () => {
  const withMinion = () => {
    const s = fight([dummy(), dummy()])
    s.enemies[0]!.hp = 0
    s.minions = [{ hp: 20, enemyIndex: 0 }]
    s.player.hp = 50
    return s
  }
  const cmd = (s: BattleState, choice: 'block' | 'attack' | 'devote', minion = 0) =>
    dispatch(s, { type: 'command', minion, choice })

  it('格挡 +6', () => {
    expect(cmd(withMinion(), 'block').state.player.block).toBe(6)
  })
  it('攻击 6，吃力量，打第一只存活敌人', () => {
    const s = withMinion()
    s.player.statuses.strength = 2
    expect(cmd(s, 'attack').state.enemies[1]!.hp).toBe(92)
  })
  it('奉献：随从 -6，玩家 +6', () => {
    const r = cmd(withMinion(), 'devote')
    expect(r.state.minions![0]!.hp).toBe(14)
    expect(r.state.player.hp).toBe(56)
  })
  it('同一随从一回合只能指挥一次，下回合重置', () => {
    const r1 = cmd(withMinion(), 'block')
    expect(cmd(r1.state, 'block').events[0]).toMatchObject({ type: 'invalidAction' })
    const next = dispatch(r1.state, { type: 'endTurn' }).state
    expect(cmd(next, 'block').state.player.block).toBe(6)
  })
  it('奉献到 0 血随从消失，之后不能再指挥', () => {
    const s = withMinion()
    s.minions![0]!.hp = 6
    const r = cmd(s, 'devote')
    expect(r.state.minions![0]!.hp).toBe(0)
    expect(r.events).toContainEqual({ type: 'minionDied', minion: 0 })
    const next = dispatch(r.state, { type: 'endTurn' }).state
    expect(cmd(next, 'block').events[0]).toMatchObject({ type: 'invalidAction' })
  })
  it('敌人攻击不影响随从血量', () => {
    const s = dispatch(withMinion(), { type: 'endTurn' }).state
    expect(s.minions![0]!.hp).toBe(20)
  })
})

describe('偷取最大生命值', () => {
  const steal = (amount: number): CardDef => ({
    ...base,
    id: 'steal',
    name: '偷取',
    target: 'enemy',
    effects: [{ type: 'stealMaxHp', amount }],
  })
  const setup = (amount: number) =>
    createBattle({
      seed: 1,
      deck: ['steal', 'steal', 'steal'],
      enemies: [dummy({ maxHp: 10 })],
      cards: { steal: steal(amount) },
      playerMaxHp: 50,
      playerHp: 40,
    }).state
  const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: 0, target: 0 })

  it('敌人最大生命值 -N、玩家 +N，敌人当前生命被截断', () => {
    const s = play(setup(4)).state
    expect(s.enemies[0]!.maxHpOverride).toBe(6)
    expect(s.enemies[0]!.hp).toBe(6)
    expect(s.player.maxHp).toBe(54)
    expect(s.player.hp).toBe(44)
  })
  it('最低留 1，再偷不再生效', () => {
    let s = play(setup(20)).state
    expect(s.enemies[0]!.maxHpOverride).toBe(1)
    expect(s.enemies[0]!.hp).toBe(1)
    expect(s.player.maxHp).toBe(59)
    s = play(s).state
    expect(s.player.maxHp).toBe(59)
  })
})

describe('消耗寄生层数', () => {
  const eat: CardDef = {
    ...base,
    id: 'eat',
    name: '啃食',
    cost: 1,
    target: 'enemy',
    effects: [{ type: 'consumeParasite', amount: 3 }, { type: 'block', amount: 2 }],
  }
  const gift: CardDef = {
    ...base,
    id: 'gift',
    name: '馈赠',
    cost: 2,
    kind: 'skill',
    target: 'self',
    freeIfParasiteTotal: 5,
    effects: [{ type: 'block', amount: 4 }],
  }
  const setup = (seeds: number[]) => {
    const s = createBattle({
      seed: 1,
      deck: ['eat', 'gift', 'gift'],
      enemies: seeds.map(() => dummy()),
      cards: { eat, gift },
    }).state
    seeds.forEach((n, i) => (s.enemies[i]!.statuses.parasite = n))
    return s
  }
  const at = (s: BattleState, id: string) => s.hand.indexOf(id)

  it('层数足够：扣层，不触发回血', () => {
    const s = setup([5])
    s.player.hp = 10
    const r = dispatch(s, { type: 'playCard', handIndex: at(s, 'eat'), target: 0 })
    expect(r.state.enemies[0]!.statuses.parasite).toBe(2)
    expect(r.state.player.hp).toBe(10)
  })
  it('层数不足：被拒绝，不花能量', () => {
    const s = setup([2])
    const r = dispatch(s, { type: 'playCard', handIndex: at(s, 'eat'), target: 0 })
    expect(r.events[0]).toMatchObject({ type: 'invalidAction' })
    expect(r.state.player.energy).toBe(s.player.energy)
  })
  it('全场合计达到阈值：能量为 0 也能免费打出，不扣能量', () => {
    const s = setup([3, 2])
    s.player.energy = 0
    const r = dispatch(s, { type: 'playCard', handIndex: at(s, 'gift') })
    expect(r.state.player.block).toBe(4)
    expect(r.state.player.energy).toBe(0)
  })
  it('合计未达阈值：按原费用', () => {
    const s = setup([3, 1])
    s.player.energy = 1
    const r = dispatch(s, { type: 'playCard', handIndex: at(s, 'gift') })
    expect(r.events[0]).toMatchObject({ type: 'invalidAction' })
  })
})

describe('参天古树 · 寄生 / 营养', () => {
  const parasitize: CardDef = { ...base, id: 'parasitize', name: '寄生', cost: 1, kind: 'skill', target: 'enemy', effects: [{ type: 'applyStatus', status: 'parasite', stacks: 6, to: 'target' }] }
  const nourish: CardDef = { ...base, id: 'nourish', name: '营养', kind: 'skill', target: 'enemy', effects: [{ type: 'applyStatus', status: 'nutrient', stacks: 1, to: 'target' }] }
  const setup = () =>
    createBattle({ seed: 1, deck: ['nourish', 'parasitize', 'parasitize', 'parasitize', 'parasitize'], enemies: [dummy()], cards: { parasitize, nourish } }).state
  const at = (s: BattleState, id: string) => s.hand.indexOf(id)
  const play = (s: BattleState, id: string) => dispatch(s, { type: 'playCard', handIndex: at(s, id), target: 0 }).state

  it('寄生：给目标 6 层', () => {
    expect(play(setup(), 'parasitize').enemies[0]!.statuses.parasite).toBe(6)
  })
  it('营养后寄生层数 ×1.5（6 → 9）', () => {
    expect(play(play(setup(), 'nourish'), 'parasitize').enemies[0]!.statuses.parasite).toBe(9)
  })
  it('营养让下个敌方回合的自增为 10% 层数、至少多 1（9 层：+2），随后清零', () => {
    const s0 = play(play(setup(), 'nourish'), 'parasitize') // 9 层
    const s = dispatch(s0, { type: 'endTurn' }).state
    expect(s.enemies[0]!.statuses.parasite).toBe(11)
    expect(s.enemies[0]!.statuses.nutrient).toBeUndefined()
  })
  it('营养的 10% 向下取整：50 层自增 5', () => {
    const s0 = play(setup(), 'nourish')
    s0.enemies[0]!.statuses.parasite = 50
    expect(dispatch(s0, { type: 'endTurn' }).state.enemies[0]!.statuses.parasite).toBe(55)
  })
})

describe('参天一击：按最大生命值的伤害', () => {
  const towering: CardDef = {
    ...base,
    id: 'towering',
    name: '参天一击',
    cost: 0,
    target: 'enemy',
    effects: [{ type: 'damage', amount: 0, maxHpPct: 50 }],
  }
  const run = (maxHp: number, hp = maxHp) => {
    const s = createBattle({ seed: 1, deck: ['towering'], enemies: [dummy({ maxHp: 200 })], cards: { towering } }).state
    s.player.maxHp = maxHp
    s.player.hp = hp
    return dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
  }
  it('造成最大生命值 50% 的伤害，与当前生命无关', () => {
    expect(run(80).enemies[0]!.hp).toBe(200 - 40)
    expect(run(80, 10).enemies[0]!.hp).toBe(200 - 40)
  })
  it('奇数四舍五入', () => {
    expect(run(75).enemies[0]!.hp).toBe(200 - 38)
  })
  it('吃力量加成', () => {
    const s = createBattle({ seed: 1, deck: ['towering'], enemies: [dummy({ maxHp: 200 })], cards: { towering } }).state
    s.player.statuses.strength = 3
    expect(dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state.enemies[0]!.hp).toBe(200 - 43)
  })
})

describe('参天古树 · 寄生卡组效果', () => {
  const mk = (id: string, effects: CardDef['effects'], over: Partial<CardDef> = {}): CardDef => ({
    ...base, id, name: id, kind: 'skill', target: 'enemy', effects, ...over,
  })
  const defs = {
    burst: mk('burst', [{ type: 'parasiteBurst' }]),
    draw: mk('draw', [{ type: 'drawIfParasite', min: 10, count: 1 }], { target: 'self' }),
    poison: mk('poison', [{ type: 'parasiteStatus', status: 'poison', divisor: 1 }]),
    weak: mk('weak', [{ type: 'parasiteStatus', status: 'weak', divisor: 2 }]),
    spread: mk('spread', [{ type: 'spreadParasite' }]),
    filler: mk('filler', [{ type: 'block', amount: 1 }], { target: 'self' }),
  }
  const setup = (seeds: number[], deck = ['burst', 'draw', 'poison', 'weak', 'spread']) => {
    const s = createBattle({ seed: 1, deck: [...deck, 'filler', 'filler', 'filler', 'filler'], enemies: seeds.map(() => dummy()), cards: defs }).state
    seeds.forEach((n, i) => n > 0 && (s.enemies[i]!.statuses.parasite = n))
    return s
  }
  const play = (s: BattleState, id: string, target = 0) => {
    if (!s.hand.includes(id)) s.hand.push(id)
    return dispatch(s, { type: 'playCard', handIndex: s.hand.indexOf(id), target })
  }

  it('催熟：消耗全部层数造成等量伤害，不触发寄生回血', () => {
    const s = setup([12])
    s.player.hp = 10
    const r = play(s, 'burst')
    expect(r.state.enemies[0]!.hp).toBe(88)
    expect(r.state.enemies[0]!.statuses.parasite).toBeUndefined()
    expect(r.state.player.hp).toBe(10)
  })
  it('繁茂：全场寄生合计达到阈值才抽牌', () => {
    const lo = setup([4, 5])
    lo.hand.push('draw')
    const n = lo.hand.length
    expect(play(lo, 'draw').state.hand.length).toBe(n - 1)
    const hi = setup([5, 5])
    hi.hand.push('draw')
    const m = hi.hand.length
    expect(play(hi, 'draw').state.hand.length).toBe(m)
  })
  it('毒化：中毒层数等于寄生层数，且不消耗寄生', () => {
    const r = play(setup([7]), 'poison')
    expect(r.state.enemies[0]!.statuses.poison).toBe(7)
    expect(r.state.enemies[0]!.statuses.parasite).toBe(7)
  })
  it('衰朽：层数减半向下取整，至少 1 层', () => {
    expect(play(setup([9]), 'weak').state.enemies[0]!.statuses.weak).toBe(4)
    expect(play(setup([1]), 'weak').state.enemies[0]!.statuses.weak).toBe(1)
  })
  it('无寄生时毒化 / 衰朽 / 传播不产生任何效果', () => {
    const s = setup([0])
    expect(play(s, 'poison').state.enemies[0]!.statuses).toEqual({})
  })
  it('传播：其他存活敌人补到相同层数，只升不降，跳过尸体', () => {
    const s = setup([8, 3, 12, 5])
    s.enemies[3]!.hp = 0
    const r = play(s, 'spread')
    expect(r.state.enemies.map((e) => e.statuses.parasite)).toEqual([8, 8, 12, 5])
  })

  describe('能力牌', () => {
    const pw = (id: string, status: string): CardDef =>
      mk(id, [{ type: 'applyStatus', status, stacks: 1, to: 'self' }], { kind: 'power', target: 'self' })
    const pcards = { body: pw('body', 'ancientBody'), root: pw('root', 'rootGrow'), filler: defs.filler }
    const start = (seeds: number[]) => {
      const s = createBattle({ seed: 1, deck: ['body', 'root', 'filler', 'filler', 'filler', 'filler'], enemies: seeds.map(() => dummy()), cards: pcards }).state
      seeds.forEach((n, i) => (s.enemies[i]!.statuses.parasite = n))
      return s
    }
    it('古树之躯：我方回合开始获得 floor(寄生合计/4) 层荆棘', () => {
      let s = start([9, 6])
      s.hand.push('body')
      s = dispatch(s, { type: 'playCard', handIndex: s.hand.indexOf('body') }).state
      s = dispatch(s, { type: 'endTurn' }).state
      // 敌方回合开始寄生各 +1 → 合计 17 → 4 层
      expect(s.player.statuses.thorns).toBe(4)
    })
    it('生根：敌方回合开始寄生额外增长', () => {
      let s = start([5])
      s.hand.push('root')
      s = dispatch(s, { type: 'playCard', handIndex: s.hand.indexOf('root') }).state
      s = dispatch(s, { type: 'endTurn' }).state
      expect(s.enemies[0]!.statuses.parasite).toBe(7)
    })
  })
})

describe('蚕食（吞食寄生层数）', () => {
  const devour: CardDef = {
    ...base, id: 'devour', name: '蚕食', kind: 'attack', cost: 1, target: 'enemy',
    effects: [{ type: 'devourParasite', max: 4, per: 3 }],
  }
  const setup = (layers: number) => {
    const s = createBattle({ seed: 1, deck: ['devour', 'devour', 'devour', 'devour', 'devour'], enemies: [dummy()], cards: { devour } }).state
    if (layers > 0) s.enemies[0]!.statuses.parasite = layers
    return s
  }
  const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: s.hand.indexOf('devour'), target: 0 })

  it('层数多于上限：吃 4 层打 12，剩余层数保留，不触发回血', () => {
    const s = setup(10)
    s.player.hp = 10
    const r = play(s)
    expect(r.state.enemies[0]!.hp).toBe(88)
    expect(r.state.enemies[0]!.statuses.parasite).toBe(6)
    expect(r.state.player.hp).toBe(10)
  })
  it('层数少于上限：有几层吃几层', () => {
    const r = play(setup(2))
    expect(r.state.enemies[0]!.hp).toBe(94)
    expect(r.state.enemies[0]!.statuses.parasite).toBeUndefined()
  })
  it('没有寄生层数：被拒绝，不花能量', () => {
    const s = setup(0)
    const r = play(s)
    expect(r.events[0]).toMatchObject({ type: 'invalidAction' })
    expect(r.state.player.energy).toBe(s.player.energy)
  })
})

describe('传说中的长枪', () => {
  const run = (spear: number, statuses: Record<string, number>) => {
    let s = fight([dummy()], ['strike', 'strike', 'strike', 'strike', 'strike'])
    s.player.statuses.legendSpear = spear
    s.enemies[0]!.statuses = { ...statuses }
    const hit = () => {
      s = dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'strike'), target: 0 }).state
    }
    const endTurn = () => {
      s = dispatch(s, { type: 'endTurn' }).state
    }
    return { get s() { return s }, hit, endTurn }
  }
  it('第一张攻击牌剥掉目标增益、换成等量英勇；只剥增益，不动玩家施加的减益', () => {
    const r = run(1, { strength: 3, poison: 5 })
    r.hit()
    expect(r.s.enemies[0]!.statuses).toEqual({ poison: 5 })
    expect(r.s.player.statuses.bladeMaster).toBe(3)
    expect(r.s.player.statuses['temp:bladeMaster']).toBe(3)
    // 回合结束：临时英勇扣光，记账键一并清掉
    r.endTurn()
    expect(r.s.player.statuses.bladeMaster).toBeUndefined()
    expect(r.s.player.statuses['temp:bladeMaster']).toBeUndefined()
  })
  it('一层长枪每回合只触发一次；两层则前两张攻击牌触发', () => {
    const a = run(1, { strength: 2, dexterity: 4 })
    a.hit(); a.hit()
    expect(Object.keys(a.s.enemies[0]!.statuses)).toHaveLength(1)
    const b = run(2, { strength: 2, dexterity: 4 })
    b.hit(); b.hit()
    expect(b.s.enemies[0]!.statuses).toEqual({})
    expect(b.s.player.statuses.bladeMaster).toBe(6)
  })
  it('目标没有增益时不报错', () => {
    const r = run(1, { poison: 2 })
    r.hit()
    expect(r.s.player.statuses.bladeMaster).toBeUndefined()
  })
})

describe('决胜一击（场上增益层数伤害）', () => {
  const blow: CardDef = { ...base, id: 'blow', name: '决胜一击', target: 'enemy', effects: [{ type: 'damage', amount: 30, buffTotal: true }] }
  const go = (player: Record<string, number>, enemy: Record<string, number>) => {
    const s = createBattle({ seed: 1, deck: ['blow'], enemies: [dummy({ maxHp: 200 })], cards: { blow } }).state
    s.player.statuses = { ...player }
    s.enemies[0]!.statuses = { ...enemy }
    return dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'blow'), target: 0 }).state
  }
  it('伤害 = 玩家 + 敌人所有增益层数；减益不算', () => {
    const r = go({ thorns: 3, strength: 2 }, { strength: 4, poison: 9 })
    expect(r.enemies[0]!.hp).toBe(200 - (3 + 2 + 4 + 2)) // 力量 +2 追加到最终伤害
  })
  it('场上没有增益时用兜底 30', () => {
    expect(go({}, { poison: 5 }).enemies[0]!.hp).toBe(200 - 30)
  })
  it('临时记账键不重复计数', () => {
    const r = go({ 'temp:bladeMaster': 3, bladeMaster: 3 }, {})
    expect(r.enemies[0]!.hp).toBe(200 - 3)
  })
})

describe('堂堂正正（移除自身增益换格挡）', () => {
  const upright: CardDef = { ...base, id: 'upright', name: '堂堂正正', kind: 'skill', target: 'self', exhaust: true, effects: [{ type: 'purgeSelfBuff' }] }
  const start = (statuses: Record<string, number>) => {
    const s = createBattle({ seed: 1, deck: ['upright'], enemies: [dummy()], cards: { upright } }).state
    s.player.statuses = { ...statuses }
    return s
  }
  const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'upright') })
  it('增益减益都可能被选中，获得等量格挡', () => {
    const gone = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const s = start({ strength: 4, weak: 2 })
      s.rngState = seed
      const r = play(s).state
      const left = Object.keys(r.player.statuses)
      expect(left).toHaveLength(1)
      const removed = left[0] === 'weak' ? 'strength' : 'weak'
      gone.add(removed)
      expect(r.player.block).toBe(removed === 'strength' ? 4 : 2)
    }
    expect(gone).toEqual(new Set(['strength', 'weak']))
  })
  it('临时英勇也能被消耗，记账一并清掉', () => {
    const r = play(start({ bladeMaster: 3, 'temp:bladeMaster': 3 })).state
    expect(r.player.statuses).toEqual({})
    expect(r.player.block).toBe(3)
  })
  it('身上没有任何状态时打不出，牌和能量原样保留', () => {
    const s = start({})
    const r = play(s)
    expect(r.events[0]).toMatchObject({ type: 'invalidAction' })
    expect(r.state.hand).toContain('upright')
  })
})

describe('震慑（临时削减敌人力量）', () => {
  const awe: CardDef = { ...base, id: 'awe', name: '震慑', kind: 'skill', target: 'enemy', effects: [{ type: 'sapStrength', amount: 9 }] }
  const start = () => {
    const s = createBattle({ seed: 1, deck: ['awe'], enemies: [dummy({ maxHp: 200 })], cards: { awe } }).state
    s.enemies[0]!.statuses = { strength: 2 }
    return s
  }
  it('目标立刻失去力量，可以变成负数', () => {
    const s = start()
    const r = dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'awe'), target: 0 }).state
    expect(r.enemies[0]!.statuses.strength).toBe(-7)
    expect(r.enemies[0]!.statuses['restore:strength']).toBe(9)
  })
  it('敌人回合结束后恢复原来的力量，记账清空', () => {
    const s = start()
    let r = dispatch(s, { type: 'playCard', handIndex: handIdx(s, 'awe'), target: 0 }).state
    r = dispatch(r, { type: 'endTurn' }).state
    expect(r.enemies[0]!.statuses.strength).toBe(2)
    expect(r.enemies[0]!.statuses['restore:strength']).toBeUndefined()
  })
})

describe('增益跟着状态走（敌人带着也生效）', () => {
  /** 敌人带 statuses 打玩家一下，返回 { 玩家损失生命, 敌人} */
  const hit = (statuses: Record<string, number>, hp = 100, playerStatuses: Record<string, number> = {}, block = 0) => {
    const foe = dummy({ maxHp: 100, intents: [{ type: 'attack', damage: 10 }] })
    let s = createBattle({ seed: 1, deck: ['strike'], enemies: [foe], cards }).state
    s.enemies[0]!.statuses = { ...statuses }
    s.enemies[0]!.hp = hp
    s.player.statuses = { ...playerStatuses }
    s.player.block = 0
    const start = s.player.hp
    s = dispatch(s, { type: 'endTurn' }).state
    void block
    return { lost: start - s.player.hp, s }
  }
  it('背水：生命不高于 30% 时 +50%，高于 30% 无加成', () => {
    expect(hit({ lastStand: 1 }, 30).lost).toBe(15)
    expect(hit({ lastStand: 1 }, 31).lost).toBe(10)
  })
  it('感电：+50%×层数，打出后失去 1 层', () => {
    const r = hit({ shock: 2 })
    expect(r.lost).toBe(20)
    expect(r.s.enemies[0]!.statuses.shock).toBe(1)
  })
  it('活力：+N，打出后用掉', () => {
    const r = hit({ vigor: 5 })
    expect(r.lost).toBe(15)
    expect(r.s.enemies[0]!.statuses.vigor).toBeUndefined()
  })
  it('汲血：敌人按实际损失生命的 10% 回血', () => {
    const r = hit({ bloodDrain: 5 }, 50) // 10 点 ×10%×5 = 5
    expect(r.s.enemies[0]!.hp).toBe(55)
    expect(r.s.enemies[0]!.statuses.bloodDrain).toBeUndefined() // 敌人出手后才清空
  })
  it('英勇：敌人出手后获得等量格挡', () => {
    expect(hit({ bladeMaster: 4 }).s.enemies[0]!.block).toBeGreaterThanOrEqual(4)
  })
  it('冰霜：玩家带着冰霜且有格挡时，敌人的攻击穿透格挡并增伤', () => {
    const foe = dummy({ maxHp: 100, intents: [{ type: 'attack', damage: 10 }] })
    const s = createBattle({ seed: 1, deck: ['strike'], enemies: [foe], cards }).state
    s.player.statuses = { frost: 2 }
    s.player.block = 100
    const start = s.player.hp
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(start - r.player.hp).toBe(12) // 10 × 1.2，无视格挡
  })
})

describe('增益跟着状态走（第二批：回合被动与长枪）', () => {
  const foe = (statuses: Record<string, number>, over: Partial<EnemyDef> = {}) => {
    const s = createBattle({ seed: 1, deck: ['strike'], enemies: [dummy({ intents: [{ type: 'attack', damage: 10 }], ...over })], cards }).state
    s.enemies[0]!.statuses = { ...statuses }
    return s
  }
  it('古树之躯：敌人带着，敌方回合开始按全场寄生获得荆棘', () => {
    const s = foe({ ancientBody: 1, parasite: 8 })
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(r.enemies[0]!.statuses.thorns).toBe(Math.floor((8 + 1) / 4)) // 寄生先长 1 层 → 9
  })
  it('瘟疫之喙：敌人带着，按弃牌堆伤口获得力量', () => {
    const s = foe({ plagueBeak: 1 })
    s.discardPile = ['wound', 'wound', 'wound', 'wound', 'wound', 'wound']
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(r.enemies[0]!.statuses.strength).toBeGreaterThanOrEqual(2)
  })
  it('生根：敌人带着，被寄生的敌人额外长寄生', () => {
    const s = foe({ rootGrow: 2, parasite: 3 })
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(r.enemies[0]!.statuses.parasite).toBe(3 + 1 + 2)
  })
  it('无实体：敌人带着，受到的每次伤害降为 1', () => {
    const s = foe({ incorporeal: 2 })
    s.hand = ['strike']
    const r = dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
    expect(r.enemies[0]!.hp).toBe(99)
  })
  it('以牙还牙：敌人带着，玩家的攻击反弹给玩家', () => {
    const s = foe({ tit4tat: 1 })
    s.hand = ['strike']
    const hp = s.player.hp
    const r = dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
    expect(hp - r.player.hp).toBe(6)
  })
  it('传说中的长枪：敌人带着，出手前剥掉玩家一个增益并获得等量英勇（回合结束失去）', () => {
    const s = foe({ legendSpear: 1 })
    s.player.statuses = { thorns: 3 }
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(r.player.statuses.thorns).toBeUndefined()
    expect(r.enemies[0]!.statuses.bladeMaster).toBeUndefined() // 敌人回合结束已扣回
    expect(r.enemies[0]!.block).toBeGreaterThanOrEqual(3) // 出手后按英勇得格挡
  })
})
