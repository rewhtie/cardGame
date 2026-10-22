import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { slime } from '@/data/enemies'
import type { GameMap } from './map'
import { createRun, dispatchRun, type RunState } from './run'
import type { CardDef } from './types'

const testMap: GameMap = {
  seed: 'TEST',
  floors: [[{ id: '0-0', floor: 0, col: 0, type: 'monster', next: ['boss'] }]],
  boss: { id: 'boss', floor: 1, col: 1, type: 'boss', next: [] },
}

const evoCard: CardDef = {
  id: 'evoA',
  rarity: 'white',
  name: '进化测试',
  cost: 1,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 6 }],
  text: '造成 6 点伤害',
  evolve: { plays: 10, into: 'evoB' },
}
const evoTarget: CardDef = { ...evoCard, id: 'evoB', name: '进化后', evolve: undefined }
const allCards = { ...cards, evoA: evoCard, evoB: evoTarget }

/** 牌组：0 打满的 evoA+，1 打了 3 次的 evoA，2 没打过的 evoA，3 普通牌 */
const deck = ['evoA+@grow', 'evoA', 'evoA', 'strike']

function inBattle(): RunState {
  const run: RunState = {
    ...createRun({ seed: 'TEST', cards: allCards, deck, enemy: slime }),
    map: testMap,
  }
  return dispatchRun(run, { type: 'chooseNode', id: '0-0' }).state
}

function finished(run: RunState, phase: 'won' | 'lost', counts: Record<string, number>): RunState {
  return { ...run, battle: { ...run.battle!, phase, evolveCounts: counts } }
}

describe('战斗后进化结算', () => {
  it('胜利：达标进化并保留 + *，未达标写回 ~N，没打过的不变，并发出事件', () => {
    const run = finished(inBattle(), 'won', { 'evoA+@grow#0': 10, 'evoA#1': 3 })
    const r = dispatchRun(run, { type: 'continue' })
    expect(r.state.screen).toBe('reward')
    expect(r.state.content.deck).toEqual(['evoB+@grow', 'evoA~3', 'evoA', 'strike'])
    expect(r.events.filter((e) => e.type === 'cardsEvolved')).toEqual([
      { type: 'cardsEvolved', cards: [{ from: 'evoA+@grow', to: 'evoB+@grow' }] },
    ])
  })

  it('没有牌进化时不发 cardsEvolved', () => {
    const r = dispatchRun(finished(inBattle(), 'won', { 'evoA#1': 3 }), { type: 'continue' })
    expect(r.events.some((e) => e.type === 'cardsEvolved')).toBe(false)
  })

  it('敌人逃脱的胜利也结算进化', () => {
    const run = finished(inBattle(), 'won', { 'evoA#2': 10 })
    const escaped = { ...run, battle: { ...run.battle!, escaped: true } }
    const r = dispatchRun(escaped, { type: 'continue' })
    expect(r.state.screen).toBe('map')
    expect(r.state.content.deck[2]).toBe('evoB')
    expect(r.events.some((e) => e.type === 'cardsEvolved')).toBe(true)
  })

  it('失败：牌组不变', () => {
    const run = finished(inBattle(), 'lost', { 'evoA#1': 10 })
    const r = dispatchRun(run, { type: 'continue' })
    expect(r.state.screen).toBe('defeat')
    expect(r.state.content.deck).toEqual(deck)
  })
})

describe('带进度的牌', () => {
  const withProgress: RunState = {
    ...createRun({ seed: 'TEST', cards: allCards, deck: ['evoA~7', 'strike'], enemy: slime }),
    map: testMap,
  }

  it('商店删牌只删目标，其余进度保留', () => {
    const run: RunState = {
      ...withProgress,
      screen: 'shop',
      gold: 500,
      shop: { cards: [], relics: [], potions: [], removeCost: 50, removed: false },
    }
    const r = dispatchRun(run, { type: 'shopRemove', deckIndex: 1 })
    expect(r.state.content.deck).toEqual(['evoA~7'])
  })

  it('火堆锻造保留进度，后缀顺序为 + 在 ~N 之前', () => {
    const run: RunState = { ...withProgress, screen: 'forge' }
    const r = dispatchRun(run, { type: 'forgeCard', deckIndex: 0 })
    expect(r.state.content.deck[0]).toBe('evoA+~7')
  })
})

describe('真实出牌后的进化', () => {
  const quick: CardDef = { ...evoCard, evolve: { plays: 2, into: 'evoB' } }
  const realCards = { ...allCards, evoA: quick }

  function start(): RunState {
    const run: RunState = {
      ...createRun({ seed: 'TEST', cards: realCards, deck: ['evoA', 'strike'], enemy: slime }),
      map: testMap,
    }
    return dispatchRun(run, { type: 'chooseNode', id: '0-0' }).state
  }
  function play(run: RunState, enemyHp: number, times: number): { before: RunState; after: RunState } {
    let cur: RunState = {
      ...run,
      battle: {
        ...run.battle!,
        hand: Array(times).fill('evoA#0'),
        enemies: [{ ...run.battle!.enemies[0]!, hp: enemyHp, block: 0 }],
      },
    }
    const before = cur
    for (let i = 0; i < times; i++) {
      cur = dispatchRun(cur, { type: 'battle', action: { type: 'playCard', handIndex: 0 } }).state
    }
    return { before, after: cur }
  }

  it('打两次后胜利：牌组里的牌变成目标牌；出牌不改动旧状态的计数', () => {
    const { before, after } = play(start(), 7, 2)
    expect(after.battle!.phase).toBe('won')
    expect(before.battle!.evolveCounts ?? {}).toEqual({})
    const r = dispatchRun(after, { type: 'continue' })
    expect(r.state.content.deck).toEqual(['evoB', 'strike'])
  })

  it('只打一次：牌组 id 写回 ~1', () => {
    const { after } = play(start(), 1, 1)
    expect(after.battle!.phase).toBe('won')
    const r = dispatchRun(after, { type: 'continue' })
    expect(r.state.content.deck).toEqual(['evoA~1', 'strike'])
  })
})
