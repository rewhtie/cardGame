import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import { buildEnemies, validateEnemyData, type EnemyData } from '@/data/enemySpec'
import type { EnemyDef } from './types'

const dummy = (intents: EnemyDef['intents']): EnemyDef => ({ id: 'd', name: 'd', maxHp: 100, intents })
const fight = (e: EnemyDef) =>
  createBattle({ seed: 1, deck: ['x', 'x', 'x', 'x', 'x'], enemies: [e], cards: {}, playerHp: 80 } as never).state
const endTurn = (e: EnemyDef) => dispatch(fight(e), { type: 'endTurn' })

describe('多段攻击与多动作意图', () => {
  it('3 段攻击造成 3 次伤害', () => {
    expect(endTurn(dummy([{ type: 'attack', damage: 5, hits: 3 }])).state.player.hp).toBe(65)
  })
  it('格挡逐段抵消', () => {
    const s = fight(dummy([{ type: 'attack', damage: 5, hits: 3 }]))
    s.player.block = 7
    expect(dispatch(s, { type: 'endTurn' }).state.player.hp).toBe(72)
  })
  it('攻击 + 防御 + 给玩家上状态同一回合生效', () => {
    const r = endTurn(
      dummy([{ type: 'attack', damage: 4, also: [{ type: 'defend', block: 8 }, { type: 'debuff', status: 'weak', stacks: 2 }] }]),
    )
    expect(r.state.player.hp).toBe(76)
    expect(r.state.enemies[0]!.block).toBe(8)
    expect(r.state.player.statuses.weak).toBe(2)
  })
  it('追加塞牌', () => {
    const r = endTurn(dummy([{ type: 'defend', block: 1, also: [{ type: 'addCards', cardId: 'x', count: 2 }] }]))
    expect(r.state.discardPile.filter((c) => c === 'x').length + r.state.drawPile.filter((c) => c === 'x').length).toBeGreaterThan(0)
  })
  it('一个回合只推进一个意图', () => {
    const r = endTurn(dummy([{ type: 'attack', damage: 1, also: [{ type: 'defend', block: 1 }] }, { type: 'idle' }]))
    expect(r.state.enemies[0]!.intentIndex).toBe(1)
  })
})

describe('敌人数据校验与构建', () => {
  const base = (intents: unknown[]): EnemyData =>
    ({ enemies: [{ id: 'a', name: 'A', role: 'other', maxHp: 10, intents }], encounters: [] }) as EnemyData
  it('合法的 hits / also 通过并被构建', () => {
    const d = base([{ type: 'attack', damage: 3, hits: 2, also: [{ type: 'defend', block: 2 }] }])
    expect(validateEnemyData(d)).toEqual([])
    expect(buildEnemies(d).byId.a!.intents[0]).toMatchObject({ hits: 2, also: [{ type: 'defend', block: 2 }] })
  })
  it('非法段数与追加动作被拒绝', () => {
    expect(validateEnemyData(base([{ type: 'attack', damage: 3, hits: 0 }])).length).toBe(1)
    expect(validateEnemyData(base([{ type: 'idle', also: [{ type: 'defend', block: -1 }] }])).length).toBe(1)
    expect(validateEnemyData(base([{ type: 'idle', also: [{ type: 'summon', enemy: 'nope' }] }])).length).toBe(1)
  })
})
