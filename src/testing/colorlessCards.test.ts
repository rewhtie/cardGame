import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { resolveCards } from '@/engine/enchant'
import { dispatch } from '@/engine/battle'
import { applyDamage } from '@/engine/effects'
import { playCard, setupScenario } from './cardHarness'

const up = (id: string) => resolveCards(cards, [`${id}+`])[`${id}+`]!
const withDiscover = (s: ReturnType<typeof setupScenario>) => ({ ...s, discoverPool: ['strike', 'defend', 'bash'] })

describe('通用无色牌', () => {
  it('回收：从弃牌堆自选一张放回手牌（不含伤口），并消耗自身', () => {
    const s = { ...setupScenario({ hand: ['reclaim'] }), discardPile: ['strike', 'wound', 'defend'] }
    const r = playCard(s, 'reclaim').state
    expect(r.pending).toMatchObject({ kind: 'retrieve', count: 1, cards: ['strike', 'defend'] })
    expect(dispatch(r, { type: 'resolve', picks: [] }).events[0]?.type).toBe('invalidAction')
    const done = dispatch(r, { type: 'resolve', picks: [1] }).state
    expect(done.pending).toBeUndefined()
    expect(done.hand).toEqual(['defend'])
    expect(done.discardPile).toEqual(['strike', 'wound'])
    expect(done.exhaustPile).toContain('reclaim')
  })

  it('回收：弃牌堆没有可取的牌时不弹选择', () => {
    const s = { ...setupScenario({ hand: ['reclaim'] }), discardPile: ['wound'] }
    const r = playCard(s, 'reclaim').state
    expect(r.pending).toBeUndefined()
    expect(r.exhaustPile).toContain('reclaim')
  })

  it('净化：选 3 张手牌消耗，选错数量被拒绝', () => {
    const s = setupScenario({ hand: ['cleanse', 'strike', 'defend', 'strike', 'defend'] })
    const r = playCard(s, 'cleanse').state
    expect(r.pending).toEqual({ kind: 'exhaust', count: 3 })
    expect(dispatch(r, { type: 'resolve', picks: [0] }).events[0]?.type).toBe('invalidAction')
    const done = dispatch(r, { type: 'resolve', picks: [0, 1, 2] }).state
    expect(done.pending).toBeUndefined()
    expect(done.hand).toHaveLength(1)
    expect(done.exhaustPile).toHaveLength(4)
  })

  it('净化：保留，回合结束留在手里', () => {
    const s = setupScenario({ hand: ['cleanse', 'strike'] })
    const r = dispatch(s, { type: 'endTurn' }).state
    expect(r.hand[0]).toBe('cleanse')
    expect(r.discardPile).toContain('strike')
  })

  it('预知：弃掉选中的牌，其余留在顶部', () => {
    const s = { ...setupScenario({ hand: ['foresight'] }), drawPile: ['a1', 'strike', 'defend', 'bash'] }
    const r = playCard(s, 'foresight').state
    expect(r.pending?.kind).toBe('scry')
    const done = dispatch(r, { type: 'resolve', picks: [0] }).state
    expect(done.drawPile).toEqual(['strike', 'defend', 'bash'])
    expect(done.discardPile).toContain('a1')
  })

  it('换手：弃掉手牌再抽同样数量；升级多抽 1', () => {
    const base = setupScenario({ hand: ['swapHand', 'strike', 'strike'] })
    expect(playCard(base, 'swapHand').state.hand).toHaveLength(2)
    const s2 = { ...base, cards: { ...base.cards, swapHand: up('swapHand') } }
    expect(playCard(s2, 'swapHand').state.hand).toHaveLength(3)
  })

  it('炼金：获得药水，升级 0 费', () => {
    const r = playCard(setupScenario({ hand: ['alchemy'] }), 'alchemy')
    expect(r.state.newPotions).toHaveLength(1)
    expect(up('alchemy').cost).toBe(0)
  })

  it('发现：3 选 1，加入手牌且本回合 0 费，回合结束恢复', () => {
    const r = playCard(withDiscover(setupScenario({ hand: ['discover'] })), 'discover').state
    expect(r.pending?.kind).toBe('discover')
    const done = dispatch(r, { type: 'resolve', picks: [0] }).state
    const id = done.hand[0]!
    expect(done.cards[id]!.cost).toBe(0)
    const next = dispatch(done, { type: 'endTurn' }).state
    expect(next.cards[id]!.cost).toBe(cards[id.split('#')[0]!]!.cost)
  })

  it('复制：复制选中的手牌', () => {
    const s = setupScenario({ hand: ['duplicate', 'defend'] })
    const done = dispatch(playCard(s, 'duplicate').state, { type: 'resolve', picks: [0] }).state
    expect(done.hand.map((c) => c.split('#')[0])).toEqual(['defend', 'defend'])
  })

  it('识破：攻击意图时按单段伤害获得格挡', () => {
    const s = setupScenario({ hand: ['seeThrough'] })
    const intent = s.enemies[0]!.def.intents[s.enemies[0]!.intentIndex]!
    const r = playCard(s, 'seeThrough').state
    expect(r.player.block).toBe(intent.type === 'attack' ? intent.damage : 0)
  })

  it('以牙还牙：敌人攻击伤害反弹', () => {
    const s = setupScenario({ hand: ['tooth'] })
    const r = playCard(s, 'tooth').state
    expect(r.player.statuses.tit4tat).toBe(1)
    const end = dispatch(r, { type: 'endTurn' }).state
    expect(end.enemies[0]!.hp).toBeLessThan(s.enemies[0]!.hp)
    expect(end.player.statuses.tit4tat).toBeUndefined()
  })

  it('以牙还牙：多层按层数倍数反弹，不消耗层数', () => {
    const one = playCard(setupScenario({ hand: ['tooth'] }), 'tooth').state
    const two = playCard(setupScenario({ hand: ['tooth', 'tooth'], energy: 4 }), 'tooth')
    const two2 = playCard(two.state, 'tooth').state
    expect(two2.player.statuses.tit4tat).toBe(2)
    const hp0 = one.enemies[0]!.hp
    const lost1 = hp0 - dispatch(one, { type: 'endTurn' }).state.enemies[0]!.hp
    const lost2 = hp0 - dispatch(two2, { type: 'endTurn' }).state.enemies[0]!.hp
    expect(lost1).toBeGreaterThan(0)
    expect(lost2).toBe(lost1 * 2)
  })

  it('以牙还牙：扣血（非攻击）不触发反弹', () => {
    const s = setupScenario({ hand: ['tooth'] })
    s.player.statuses.tit4tat = 1
    const hp = s.enemies[0]!.hp
    const out = applyDamage(s, 'player', 5, [], 0, {})
    void out
    expect(s.enemies[0]!.hp).toBe(hp)
  })

  it('蓄势：每保留一回合伤害 +3，打出后重新累积', () => {
    let s = setupScenario({ hand: ['buildUp'] })
    s = dispatch(s, { type: 'endTurn' }).state
    const id = s.hand.find((c) => c.startsWith('buildUp'))!
    expect(s.cards[id]!.effects[0]).toMatchObject({ amount: 6 })
    const hp = s.enemies[0]!.hp
    const after = playCard(s, id).state
    expect(hp - after.enemies[0]!.hp).toBe(6)
    expect(after.discardPile).toContain('buildUp')
  })

  it('重启：弃牌堆洗入抽牌堆后抽 2', () => {
    const s = { ...setupScenario({ hand: ['reboot'] }), discardPile: ['strike', 'defend'], drawPile: ['bash'] }
    const r = playCard(s, 'reboot').state
    expect(r.hand).toHaveLength(2)
    expect(r.drawPile).toHaveLength(1)
    expect(r.discardPile).toHaveLength(0)
  })

  it('天命：无视费用打出抽牌堆顶的牌', () => {
    const s = { ...setupScenario({ hand: ['destiny'] }), drawPile: ['strike', 'defend'] }
    const r = playCard(s, 'destiny').state
    expect(r.enemies[0]!.hp).toBe(s.enemies[0]!.hp - 6)
    expect(r.exhaustPile).toContain('strike')
    expect(r.discardPile).not.toContain('strike')
    expect(r.player.energy).toBe(s.player.energy - 1)
  })

  it('重金悬赏：击杀得金币，没杀不得', () => {
    const s = setupScenario({ hand: ['bounty'] })
    expect(playCard(s, 'bounty').state.gold).toBe(s.gold)
    const weak = { ...s, enemies: s.enemies.map((e) => ({ ...e, hp: 5 })) }
    expect(playCard(weak, 'bounty').state.gold).toBe(s.gold + 25)
  })
})
