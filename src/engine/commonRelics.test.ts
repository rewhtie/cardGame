import { describe, expect, it } from 'vitest'
import { cards, starterDeck } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createBattle, dispatch } from './battle'
import { isUpgraded, rawId } from './enchant'
import { createRun, dispatchRun, type RunState } from './run'
import type { BattleState, CardDef, EnemyDef } from './types'

const atk = (id: string): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 0,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 1 }],
  text: '',
})
const testCards = { a: atk('a') }
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const fight = (relics: string[], enemies = [dummy]): BattleState =>
  createBattle({ seed: 1, deck: Array(10).fill('a'), enemies, cards: testCards, relics }).state
const play = (s: BattleState) => dispatch(s, { type: 'playCard', handIndex: 0, target: 0 }).state
const endTurn = (s: BattleState) => dispatch(s, { type: 'endTurn' }).state

describe('通用遗物 · 战斗', () => {
  it('弹珠袋：战斗开始所有敌人 1 层易伤', () => {
    const s = fight(['marbleBag'], [dummy, { ...dummy, id: 'd2' }])
    expect(s.enemies.map((e) => e.statuses.vulnerable)).toEqual([1, 1])
  })

  it('手里剑：每回合第 3 张攻击牌 +1 力量，下回合重新计数', () => {
    let s = fight(['shuriken'])
    s = play(play(s))
    expect(s.player.statuses.strength).toBeUndefined()
    s = play(s)
    expect(s.player.statuses.strength).toBe(1)
    s = play(s)
    expect(s.player.statuses.strength).toBe(1) // 第 4 张不再触发
    s = endTurn(s)
    s = play(play(play(s)))
    expect(s.player.statuses.strength).toBe(2)
  })

  it('华丽折扇：每回合第 3 张攻击牌 +4 格挡', () => {
    let s = fight(['ornateFan'])
    s = play(play(s))
    expect(s.player.block).toBe(0)
    s = play(s)
    expect(s.player.block).toBe(4)
    s = play(s)
    expect(s.player.block).toBe(4)
  })

  it('号角扣：只在第 2 回合开始 +14 格挡', () => {
    let s = fight(['hornCleat'])
    expect(s.player.block).toBe(0)
    s = endTurn(s)
    expect(s.turn).toBe(2)
    expect(s.player.block).toBe(14)
    s = endTurn(s)
    expect(s.player.block).toBe(0)
  })

  it('水银沙漏：每个回合开始对所有敌人 3 点伤害（第一回合也算）', () => {
    const idle: EnemyDef = { ...dummy, intents: [{ type: 'idle' }] }
    let s = fight(['mercuryHourglass'], [idle, { ...idle, id: 'd2' }])
    expect(s.enemies.map((e) => e.hp)).toEqual([497, 497])
    s = endTurn(s)
    expect(s.enemies.map((e) => e.hp)).toEqual([494, 494])
  })
  it('水银沙漏：伤害会被敌人的格挡吸收', () => {
    const s = fight(['mercuryHourglass'])
    const blocked = endTurn(s) // 敌人防御 1 点，下回合开始 3 点伤害只穿透 2
    expect(blocked.enemies[0]!.hp).toBe(495)
  })
})

describe('传说背心', () => {
  const big = (id: string, effects: CardDef['effects']): CardDef => ({ ...atk(id), effects })
  const mk = (effects: CardDef['effects'], relicState?: Record<string, number>) =>
    createBattle({
      seed: 1,
      deck: Array(10).fill('x'),
      enemies: [{ ...dummy, intents: [{ type: 'idle' }] }],
      cards: { x: big('x', effects) },
      relics: ['legendVest'],
      relicState,
    }).state

  it('伤害与格挡共用计数，满 100 得 1 层完美防御，余数保留', () => {
    let s = mk([{ type: 'damage', amount: 60 }, { type: 'block', amount: 50 }])
    s = play(s)
    expect(s.relicState.legendVest).toBe(10)
    expect(s.player.statuses.perfectGuard).toBe(1)
  })

  it('一次满多个 100 仍最多 1 层；计数可带入下一场战斗', () => {
    const s = play(mk([{ type: 'damage', amount: 250 }], { legendVest: 90 }))
    expect(s.player.statuses.perfectGuard).toBe(1)
    expect(s.relicState.legendVest).toBe(40)
  })
})

describe('传说背心 · 任意伤害都计数', () => {
  const idle: EnemyDef = { ...dummy, intents: [{ type: 'idle' }] }
  const start = (enemy: EnemyDef, relicState: Record<string, number>) =>
    createBattle({ seed: 1, deck: Array(10).fill('a'), enemies: [enemy], cards: testCards, relics: ['legendVest'], relicState }).state

  it('中毒（直接失去生命）也计入', () => {
    let s = start(idle, {})
    s.enemies[0]!.statuses.poison = 7
    s = endTurn(s) // 下回合开始中毒 7
    expect(s.relicState.legendVest).toBe(7)
  })

  it('无来源伤害（水银沙漏同类）与被格挡吸收的部分也计入', () => {
    const s = createBattle({
      seed: 1,
      deck: Array(10).fill('a'),
      enemies: [{ ...dummy, intents: [{ type: 'idle' }] }],
      cards: testCards,
      relics: ['legendVest', 'mercuryHourglass'],
    }).state
    expect(s.relicState.legendVest).toBe(3)
    const blocked = { ...s, enemies: [{ ...s.enemies[0]!, block: 50 }] }
    expect(endTurn(blocked).relicState.legendVest).toBe(6)
  })
})

describe('通用遗物 · 牌组', () => {
  const base = (relics: string[]): RunState => ({
    ...createRun({ seed: 'EGG', cards, deck: starterDeck, enemy: slime }),
    screen: 'map',
    relics,
  })
  const add = (run: RunState, id: string) =>
    dispatchRun(run, { type: 'cheatGrant', kind: 'card', id }).state.content.deck.at(-1)!
  const idOfKind = (kind: CardDef['kind']) =>
    Object.values(cards).find((c) => c.kind === kind && c.rarity !== 'curse' && c.rarity !== 'status')!.id

  it('毒素蛋 / 熔火蛋 / 冰霜蛋：只升级对应种类，获得之后才生效', () => {
    const skill = idOfKind('skill')
    const attack = idOfKind('attack')
    const power = idOfKind('power')
    const none = base([])
    expect(isUpgraded(add(none, skill))).toBe(false)

    const toxic = base(['toxicEgg'])
    expect(isUpgraded(add(toxic, skill))).toBe(true)
    expect(isUpgraded(add(toxic, attack))).toBe(false)

    const molten = base(['moltenEgg'])
    expect(isUpgraded(add(molten, attack))).toBe(true)
    expect(isUpgraded(add(molten, power))).toBe(false)

    const frozen = base(['frozenEgg'])
    expect(isUpgraded(add(frozen, power))).toBe(true)
    expect(isUpgraded(add(frozen, skill))).toBe(false)
    // 不回头改已有的牌
    expect(frozen.content.deck.some(isUpgraded)).toBe(false)
  })

  it('蛋不会升级已升级的牌、诅咒和状态牌', () => {
    const toxic = base(['toxicEgg', 'moltenEgg', 'frozenEgg'])
    const skill = idOfKind('skill')
    expect(add(toxic, `${skill}+`)).toBe(`${skill}+`)
    const junk = Object.values(cards).find((c) => c.rarity === 'curse' || c.rarity === 'status')
    if (junk) expect(add(toxic, junk.id)).toBe(junk.id)
  })

  it('战争涂料：获得时升级 2 张技能牌，不动攻击牌', () => {
    const run = base([])
    const before = run.content.deck.filter((c) => cards[rawId(c)]?.kind === 'skill').length
    const after = dispatchRun(run, { type: 'cheatGrant', kind: 'relic', id: 'warPaint' }).state
    const upgradedSkills = after.content.deck.filter((c) => isUpgraded(c) && cards[rawId(c)]?.kind === 'skill')
    expect(upgradedSkills).toHaveLength(Math.min(2, before))
    expect(after.content.deck.filter((c) => isUpgraded(c) && cards[rawId(c)]?.kind !== 'skill')).toHaveLength(0)
  })
})
