import { describe, expect, it } from 'vitest'
import { Card } from '@/data/cards/card'
import { createBattle, dispatch } from './battle'
import { createRun, dispatchRun, type RunState } from './run'
import { resolveCards } from './enchant'
import { applyEnchant, canEnchant } from './enchants'
import type { BattleState, CardDef, EnemyDef } from './types'

const enemy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 100, intents: [{ type: 'attack', damage: 0 }] }
const shot: CardDef = { id: 'shot', name: 'shot', rarity: 'gold', kind: 'attack', target: 'enemy', cost: 0, text: '', effects: [{ type: 'damage', amount: 7 }], oneShot: true }
const normal: CardDef = { ...shot, id: 'normal', name: 'normal', oneShot: false }
const copier: CardDef = { ...normal, id: 'copier', kind: 'skill', target: 'self', effects: [{ type: 'choose', mode: 'copy', count: 1 }] }
const choosing: CardDef = { ...copier, id: 'choosing', oneShot: true }
const generator: CardDef = { ...copier, id: 'generator', effects: [{ type: 'addCard', cardId: 'shot', count: 1, to: 'hand' }] }
const top: CardDef = { ...copier, id: 'top', effects: [{ type: 'playTop' }] }
const pool = { shot, normal, copier, choosing, generator, top }

function battle(deck: string[], cards: Record<string, CardDef> = pool): BattleState {
  return createBattle({ seed: 3, deck, cards, enemy, handSize: deck.length, maxEnergy: 10 }).state
}
function play(s: BattleState, id: string) {
  const index = s.hand.indexOf(id)
  expect(index).toBeGreaterThanOrEqual(0)
  return dispatch(s, { type: 'playCard', handIndex: index })
}
function run(deck: string[], cards: Record<string, CardDef> = pool): RunState {
  return { ...createRun({ seed: 'ONESHOT', deck, cards, enemy }), screen: 'battle', battle: battle(deck, cards) }
}
function runPlay(s: RunState, id: string): RunState {
  return dispatchRun(s, { type: 'battle', action: { type: 'playCard', handIndex: s.battle!.hand.indexOf(id) } }).state
}
function piles(s: BattleState) { return [...s.hand, ...s.drawPile, ...s.discardPile, ...s.exhaustPile] }

describe('一次性：永久副本归属与结算', () => {
  it('打出一张仅删除对应副本，效果正常且不入弃牌或消耗堆', () => {
    const s = run(['shot', 'normal', 'shot'])
    const next = runPlay(s, 'shot#2')
    expect(next.content.deck).toEqual(['shot', 'normal'])
    expect(next.battle!.enemies[0]!.hp).toBe(93)
    expect(piles(next.battle!)).not.toContain('shot#2')
    expect(piles(next.battle!)).toContain('shot#0')
    expect(s.content.deck).toEqual(['shot', 'normal', 'shot'])
    expect(s.battle!.removedDeckIndices).toEqual([])
  })
  it('连续删除不同原始位置不会删除错位的其他卡', () => {
    let s = run(['shot', 'normal', 'shot', 'shot'])
    s = runPlay(s, 'shot#0')
    s = runPlay(s, 'shot#3')
    expect(s.content.deck).toEqual(['normal', 'shot'])
    s = runPlay(s, 'shot#2')
    expect(s.content.deck).toEqual(['normal'])
  })
  it('能量不足不删除牌也不修改来源记录', () => {
    const costly = { ...shot, cost: 99 }
    const s = battle(['shot'], { ...pool, shot: costly })
    const next = play(s, 'shot#0')
    expect(next.state).toBe(s)
    expect(next.events[0]?.type).toBe('invalidAction')
    expect(s.removedDeckIndices).toEqual([])
  })
  it('无效目标不删除牌', () => {
    const s = battle(['shot'])
    const next = dispatch(s, { type: 'playCard', handIndex: 0, target: 9 })
    expect(next.state).toBe(s)
    expect(s.removedDeckIndices).toEqual([])
  })
  it('一次性优先于消耗，不触发消耗事件', () => {
    const s = battle(['shot'], { ...pool, shot: { ...shot, exhaust: true } })
    const next = play(s, 'shot#0')
    expect(next.state.exhaustPile).toEqual([])
    expect(next.events.some((e) => e.type === 'cardExhausted')).toBe(false)
    expect(next.state.removedDeckIndices).toEqual([0])
  })
  it('普通卡仍正常入弃牌堆，不被永久删除', () => {
    const s = runPlay(run(['normal']), 'normal')
    expect(s.content.deck).toEqual(['normal'])
    expect(s.battle!.discardPile).toEqual(['normal'])
  })
  it('一次性附魔只删除对应附魔副本', () => {
    const s = runPlay(run(['normal@oneShot', 'normal']), 'normal@oneShot#0')
    expect(s.content.deck).toEqual(['normal'])
    expect(s.battle!.enemies[0]!.hp).toBe(93)
  })
  it('升级后才有一次性的牌仍有独立永久来源', () => {
    const upgrade = { ...normal, upgraded: { ...normal, oneShot: true } }
    const s = runPlay(run(['normal+', 'normal'], { ...pool, normal: upgrade }), 'normal+#0')
    expect(s.content.deck).toEqual(['normal'])
  })
  it('临时复制的一次性牌不会误删同名永久原牌', () => {
    let s = runPlay(run(['shot', 'copier']), 'copier')
    const sourceIndex = s.battle!.hand.indexOf('shot#0')
    s = dispatchRun(s, { type: 'battle', action: { type: 'resolve', picks: [sourceIndex] } }).state
    const copy = s.battle!.hand.find((id) => id !== 'shot#0')!
    expect(copy).toBeTruthy()
    s = runPlay(s, copy)
    expect(s.content.deck).toEqual(['shot', 'copier'])
    expect(s.battle!.hand).toContain('shot#0')
    s = runPlay(s, 'shot#0')
    expect(s.content.deck).toEqual(['copier'])
  })
  it('生成到手牌的一次性牌不会删除同名永久牌', () => {
    let s = runPlay(run(['shot', 'generator']), 'generator')
    expect(s.battle!.hand).toContain('shot')
    s = runPlay(s, 'shot')
    expect(s.content.deck).toEqual(['shot', 'generator'])
    expect(s.battle!.hand).toContain('shot#0')
  })
  it('待选择未完成不永久删除，无效选择不消费，完成后只删自身', () => {
    let s = runPlay(run(['choosing', 'normal']), 'choosing#0')
    expect(s.content.deck).toEqual(['choosing', 'normal'])
    expect(s.battle!.pending).toBeTruthy()
    const bad = dispatchRun(s, { type: 'battle', action: { type: 'resolve', picks: [99] } })
    expect(bad.state.content.deck).toEqual(['choosing', 'normal'])
    s = dispatchRun(s, { type: 'battle', action: { type: 'resolve', picks: [0] } }).state
    expect(s.content.deck).toEqual(['normal'])
    expect(s.battle!.pending).toBeUndefined()
    expect(piles(s.battle!)).not.toContain('choosing#0')
  })
  it('天命自动打出一次性牌仍永久删除而不消耗', () => {
    let s = run(['shot', 'top'])
    s = { ...s, battle: { ...s.battle!, hand: ['top'], drawPile: ['shot#0'] } }
    s = runPlay(s, 'top')
    expect(s.content.deck).toEqual(['top'])
    expect(s.battle!.exhaustPile).toEqual([])
    expect(s.battle!.enemies[0]!.hp).toBe(93)
  })
  it('击杀结算和战后继续不会恢复已删除牌', () => {
    let s = run(['shot', 'normal'])
    s.battle!.enemies[0]!.hp = 1
    s = runPlay(s, 'shot#0')
    expect(s.battle!.phase).toBe('won')
    expect(s.content.deck).toEqual(['normal'])
    s = dispatchRun(s, { type: 'continue' }).state
    expect(s.content.deck).toEqual(['normal'])
  })
  it('存档往返后仍删除正确副本', () => {
    let s = runPlay(run(['shot', 'normal', 'shot']), 'shot#0')
    s = JSON.parse(JSON.stringify(s)) as RunState
    s = runPlay(s, 'shot#2')
    expect(s.content.deck).toEqual(['normal'])
  })
  it('删除前面的牌后，其他牌仍按原始位置结算进化', () => {
    const trainee: CardDef = { ...normal, id: 'trainee', evolve: { plays: 1, into: 'normal' } }
    let s = run(['shot', 'trainee'], { ...pool, trainee })
    s = runPlay(s, 'shot#0')
    s.battle!.enemies[0]!.hp = 1
    s = runPlay(s, 'trainee#1')
    s = dispatchRun(s, { type: 'continue' }).state
    expect(s.content.deck).toEqual(['normal'])
  })
  it('全牌组一次性删空后，下一场战斗仍能正常初始化和结束回合', () => {
    const s = runPlay(run(['shot']), 'shot#0')
    expect(s.content.deck).toEqual([])
    const next = battle(s.content.deck)
    expect(next.hand).toEqual([])
    expect(dispatch(next, { type: 'endTurn' }).state.phase).toBe('player')
  })
  it('待选的一次性牌击杀最后敌人后，完成选择正常结束战斗', () => {
    const lethal: CardDef = { ...choosing, effects: [{ type: 'damage', amount: 100 }, { type: 'choose', mode: 'copy', count: 1 }] }
    let s = run(['choosing', 'normal'], { ...pool, choosing: lethal })
    s = runPlay(s, 'choosing#0')
    expect(s.battle!.pending).toBeTruthy()
    expect(s.battle!.phase).toBe('player')
    s = dispatchRun(s, { type: 'battle', action: { type: 'resolve', picks: [0] } }).state
    expect(s.battle!.phase).toBe('won')
    expect(s.content.deck).toEqual(['normal'])
  })
  it('天命抽到不可打出的一次性牌只弃掉，不永久删除', () => {
    let s = run(['shot', 'top'], { ...pool, shot: { ...shot, unplayable: true } })
    s = { ...s, battle: { ...s.battle!, hand: ['top'], drawPile: ['shot#0'] } }
    s = runPlay(s, 'top')
    expect(s.content.deck).toEqual(['shot', 'top'])
    expect(s.battle!.discardPile).toContain('shot#0')
  })
  it('卡牌构建器及原卡/升级规格往返保持一次性', () => {
    const c = Card.gold('sample', 'sample').cost(1).oneShot().upgrade((u) => u.noOneShot())
    const restored = Card.fromSpec(c.spec()).build()
    expect(restored.oneShot).toBe(true)
    expect(restored.upgraded?.oneShot).not.toBe(true)
  })
  it('附魔可选，不能重复附魔，解析后保留词缀', () => {
    expect(canEnchant(normal, 'oneShot')).toBe(true)
    expect(canEnchant(shot, 'oneShot')).toBe(false)
    expect(applyEnchant(normal, 'oneShot').oneShot).toBe(true)
    expect(resolveCards(pool, ['normal@oneShot'])['normal@oneShot']!.text).toContain('一次性')
  })
})
