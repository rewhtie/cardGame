import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import { attacksThisTurn } from './blades'
import { applyDamage } from './effects'
import type { BattleState, CardDef, EnemyDef, GameEvent } from './types'

const atk = (id: string, effects: CardDef['effects'], kind: CardDef['kind'] = 'attack'): CardDef => ({
  id,
  rarity: 'white',
  name: id,
  cost: 0,
  target: 'enemy',
  kind,
  effects,
  text: '',
})
const cards = {
  hit: atk('hit', [{ type: 'damage', amount: 4 }]),
  big: atk('big', [{ type: 'damage', amount: 20 }]),
  multi: atk('multi', [
    { type: 'damage', amount: 5 },
    { type: 'damage', amount: 5 },
  ]),
  guard: atk('guard', [{ type: 'block', amount: 1 }], 'skill'),
}
const dummy: EnemyDef = { id: 'dummy', name: 'dummy', maxHp: 200, intents: [{ type: 'defend', block: 1 }] }
const fight = (hand: string[]): BattleState => {
  const s = createBattle({ seed: 1, deck: ['hit', 'hit', 'hit', 'hit', 'hit'], enemies: [dummy], cards }).state
  return { ...s, hand, drawPile: [], discardPile: [], player: { ...s.player, hp: 50 } }
}
const play = (s: BattleState, i = 0) => dispatch(s, { type: 'playCard', handIndex: i, target: 0 }).state

describe('汲血', () => {
  it('20 点伤害回 2 点；4 点伤害保底回 1 点', () => {
    let s = fight(['big', 'hit'])
    s.player.statuses = { bloodDrain: 1 }
    s = play(s)
    expect(s.player.hp).toBe(52)
    s = play(s)
    expect(s.player.hp).toBe(53)
  })
  it('多段牌每段各回至少 1 点', () => {
    const s = play(Object.assign(fight(['multi']), { player: { ...fight([]).player, statuses: { bloodDrain: 1 } } }))
    expect(s.player.hp).toBe(52)
  })
  it('敌人满格挡不回血', () => {
    const s0 = fight(['big'])
    s0.player.statuses = { bloodDrain: 1 }
    s0.enemies[0]!.block = 50
    expect(play(s0).player.hp).toBe(50)
  })
  it('回复不超过最大生命', () => {
    const s0 = fight(['hit'])
    s0.player.statuses = { bloodDrain: 3 }
    s0.player.hp = s0.player.maxHp
    expect(play(s0).player.hp).toBe(s0.player.maxHp)
  })
  it('玩家回合结束后汲血清空', () => {
    const s0 = fight([])
    s0.player.statuses = { bloodDrain: 2, strength: 1 }
    const s = dispatch(s0, { type: 'endTurn' }).state
    expect(s.player.statuses.bloodDrain).toBeUndefined()
    expect(s.player.statuses.strength).toBe(1)
  })
  it('敌人回合的伤害不触发汲血', () => {
    const s0 = fight([])
    s0.player.statuses = { bloodDrain: 1 }
    const ev: GameEvent[] = []
    applyDamage(s0, 'player', 10, ev, 0, { source: { side: 'enemy', enemyIndex: 0 } })
    expect(s0.player.hp).toBe(40)
  })
})

describe('本回合攻击牌数与剑宗', () => {
  it('不需要剑心也累加，新回合清零', () => {
    let s = fight(['hit', 'hit', 'guard'])
    s = play(s)
    s = play(s)
    expect(attacksThisTurn(s)).toBe(2)
    s = play(s)
    expect(attacksThisTurn(s)).toBe(2)
    s = dispatch(s, { type: 'endTurn' }).state
    expect(attacksThisTurn(s)).toBe(0)
  })
  it('剑宗 2 层：攻击牌 +2 格挡，技能牌不加', () => {
    let s = fight(['guard', 'hit'])
    s.player.statuses = { bladeMaster: 2 }
    s = play(s)
    const afterSkill = s.player.block
    s = play(s)
    expect(s.player.block - afterSkill).toBe(2)
  })
})
