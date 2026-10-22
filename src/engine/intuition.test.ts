import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { createBattle, dispatch } from './battle'
import type { BattleState, EnemyDef } from './types'

const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 500, intents: [{ type: 'defend', block: 1 }] }
const fight = (relics: string[] = []): BattleState =>
  createBattle({ seed: 1, deck: Array(10).fill('defend'), enemies: [dummy], cards, relics }).state
const withHand = (s: BattleState, hand: string[]): BattleState => ({ ...s, hand, player: { ...s.player, energy: 5 } })
const play = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state
const endTurn = (s: BattleState) => dispatch(s, { type: 'endTurn' }).state

describe('直觉', () => {
  it('打出后本回合格挡存起来，下回合开始时获得', () => {
    let s = withHand(fight(), ['intuition', 'defend', 'defend'])
    s = play(s)
    expect(s.player.statuses.intuition).toBe(1)
    s = play(s)
    s = play(s)
    expect(s.player.block).toBe(0)
    expect(s.player.statuses.intuitionStore).toBe(10)
    s = endTurn(s)
    expect(s.player.block).toBe(10)
    expect(s.player.statuses.intuition).toBeUndefined()
    expect(s.player.statuses.intuitionStore).toBeUndefined()
  })

  it('打出之前已有的格挡不受影响；下回合之后恢复正常获得格挡', () => {
    let s = withHand(fight(), ['defend', 'intuition', 'defend'])
    s = play(s)
    s = play(s)
    s = play(s)
    expect(s.player.block).toBe(5)
    expect(s.player.statuses.intuitionStore).toBe(5)
    s = endTurn(s)
    expect(s.player.block).toBe(5) // 上回合存下的（旧格挡回合开始已清零）
    s = play(withHand(s, ['defend']))
    expect(s.player.block).toBe(10)
  })

  it('传说背心：存起来的格挡在真正获得时才计数', () => {
    let s = withHand(fight(['legendVest']), ['intuition', 'defend'])
    s = play(play(s))
    expect(s.relicState.legendVest ?? 0).toBe(0)
    s = endTurn(s)
    expect(s.relicState.legendVest).toBe(5)
  })

  it('只拦卡牌：英勇（状态）给的格挡照常生效', () => {
    let s = withHand(fight(), ['intuition', 'strike'])
    s = { ...s, player: { ...s.player, statuses: { ...s.player.statuses, bladeMaster: 4 } } }
    s = play(s)
    s = play(s)
    expect(s.player.block).toBe(4)
    expect(s.player.statuses.intuitionStore).toBeUndefined()
  })

  it('堂堂正正优先级最高：格挡立即生效，不被直觉存起来', () => {
    let s = withHand(fight(), ['intuition', 'upright'])
    s = { ...s, player: { ...s.player, statuses: { ...s.player.statuses, strength: 4 } } }
    s = play(s)
    s = play(s) // 随机移除一个 buff（力量 4 或直觉 1）并获得其层数的格挡
    expect(s.player.block).toBeGreaterThan(0)
    expect(s.player.statuses.intuitionStore).toBeUndefined()
  })
})
