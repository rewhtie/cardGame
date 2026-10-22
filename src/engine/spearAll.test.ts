import { describe, expect, it } from 'vitest'
import { createBattle, dispatch } from './battle'
import type { CardDef } from './types'

const sweep: CardDef = { rarity: 'white', cost: 0, kind: 'attack', text: '', id: 'sweep', name: '横扫', target: 'allEnemies', effects: [{ type: 'damage', amount: 6 }] }

describe('长枪 vs 全体攻击', () => {
  it('每个存活敌人各剥一个增益，英勇累加', () => {
    const e = { id: 'd', name: 'd', maxHp: 100, intents: [{ type: 'attack' as const, damage: 5 }] }
    const s = createBattle({ seed: 1, deck: ['sweep'], enemies: [e, e, e], cards: { sweep } }).state
    s.player.statuses.legendSpear = 1
    s.enemies[0]!.statuses = { strength: 2 }
    s.enemies[1]!.statuses = { strength: 3 }
    s.enemies[2]!.statuses = { dexterity: 4 }
    const r = dispatch(s, { type: 'playCard', handIndex: 0 }).state
    expect(r.enemies.map((x) => x.statuses)).toEqual([{}, {}, {}])
    expect(r.player.statuses.bladeMaster).toBe(9)
  })
})
