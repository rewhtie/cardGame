import { describe, expect, it } from 'vitest'
import { SLOT_KEYS } from '@/data/sfxSlots'
import type { CardDef, GameEvent } from '@/engine/types'
import { pickFile, sfxSlotsForEvent, shouldPlay, slotStatus } from './sfxResolve'

const cards = {
  defend: { id: 'defend', kind: 'skill' },
  strike: { id: 'strike', kind: 'attack' },
} as unknown as Record<string, CardDef>

describe('slotStatus', () => {
  it('三态', () => {
    expect(slotStatus({ a: { files: ['x.ogg'] } }, 'a')).toBe('configured')
    expect(slotStatus({ a: { silent: true, files: ['x.ogg'] } }, 'a')).toBe('silent')
    expect(slotStatus({ a: { synth: 'split' } }, 'a')).toBe('configured')
    expect(slotStatus({}, 'a')).toBe('missing')
    expect(slotStatus({ a: { files: [] } }, 'a')).toBe('missing')
  })
})

describe('pickFile', () => {
  it('按 rand 取文件', () => {
    const c = { files: ['a.ogg', 'b.ogg', 'c.ogg'] }
    expect(pickFile(c, () => 0)).toBe('a.ogg')
    expect(pickFile(c, () => 0.999)).toBe('c.ogg')
    expect(pickFile({ files: [] }, () => 0)).toBeUndefined()
    expect(pickFile({}, () => 0)).toBeUndefined()
  })
})

describe('shouldPlay', () => {
  it('40ms 窗口', () => {
    expect(shouldPlay(undefined, 100)).toBe(true)
    expect(shouldPlay(100, 139)).toBe(false)
    expect(shouldPlay(100, 140)).toBe(true)
  })
})

describe('sfxSlotsForEvent', () => {
  const slots = (e: GameEvent, prev?: GameEvent) => sfxSlotsForEvent(e, prev, cards)
  const hit = (target: 'player' | 'enemy', amount: number, blocked = 0): GameEvent => ({
    type: 'damageDealt',
    target,
    amount,
    blocked,
  })

  it('伤害按目标与成因', () => {
    expect(slots(hit('player', 5))).toEqual(['battle.damage.player'])
    expect(slots(hit('enemy', 5))).toEqual(['battle.damage.enemy'])
    expect(slots(hit('player', 0, 3))).toEqual(['battle.damage.blocked'])
    expect(
      slots(hit('enemy', 2), { type: 'statusTriggered', target: 'enemy', status: 'poison' }),
    ).toEqual(['battle.damage.poison'])
    expect(slots(hit('player', 2), { type: 'cardTriggered', cardId: 'burn' })).toEqual([
      'battle.damage.trigger',
    ])
  })
  it('敌人行动 / 分裂', () => {
    expect(
      slots({ type: 'enemyActed', intent: { type: 'attack', damage: 3 }, enemyIndex: 0 }),
    ).toEqual(['battle.enemy.attack'])
    expect(slots({ type: 'enemySplit', enemyIndex: 0, spawned: [1] })).toEqual([
      'battle.enemy.split',
    ])
  })
  it('cardAdded 不映射，出牌按牌类型', () => {
    expect(slots({ type: 'cardAdded', cardId: 'wound', count: 1 })).toEqual([])
    expect(slots({ type: 'cardPlayed', cardId: 'defend', handIndex: 0 })).toEqual([
      'battle.cardPlayed.skill',
    ])
    expect(slots({ type: 'cardPlayed', cardId: 'nope', handIndex: 0 })).toEqual([])
  })

  it('所有事件返回的键都在清单里', () => {
    const samples: Record<GameEvent['type'], GameEvent> = {
      cardPlayed: { type: 'cardPlayed', cardId: 'strike', handIndex: 0 },
      potionUsed: { type: 'potionUsed', potionId: 'p' },
      potionGained: { type: 'potionGained', potionId: 'p' },
      damageDealt: hit('enemy', 3),
      blockGained: { type: 'blockGained', target: 'player', amount: 3 },
      cardDrawn: { type: 'cardDrawn', cardId: 'strike' },
      reshuffled: { type: 'reshuffled' },
      energyGained: { type: 'energyGained', amount: 1 },
      cardDiscarded: { type: 'cardDiscarded', cardId: 'strike' },
      cardExhausted: { type: 'cardExhausted', cardId: 'strike' },
      handDiscarded: { type: 'handDiscarded', count: 1 },
      perfectBlock: { type: 'perfectBlock' },
      statusApplied: { type: 'statusApplied', target: 'player', status: 'strength', stacks: 1 },
      statusRemoved: { type: 'statusRemoved', target: 'player', status: 'strength' },
      healed: { type: 'healed', target: 'enemy', amount: 2 },
      hpLost: { type: 'hpLost', amount: 1 },
      maxHpGained: { type: 'maxHpGained', amount: 1 },
      statusTriggered: { type: 'statusTriggered', target: 'enemy', status: 'poison' },
      cardTriggered: { type: 'cardTriggered', cardId: 'burn' },
      cardEnchantGrew: { type: 'cardEnchantGrew', cardId: 'strike' },
      relicGained: { type: 'relicGained', id: 'r' },
      cardsUpgraded: { type: 'cardsUpgraded', cards: [] },
      cardsEnchanted: { type: 'cardsEnchanted', cards: [] },
      cardRemoved: { type: 'cardRemoved', cardId: 'strike' },
      enemyExplosionPending: { type: 'enemyExplosionPending', enemyIndex: 0, damage: 5 },
      enemyExploded: { type: 'enemyExploded', enemyIndex: 0, damage: 5 },
      enemyRevived: { type: 'enemyRevived', enemyIndex: 0, amount: 5 },
      cardsEvolved: { type: 'cardsEvolved', cards: [] },
      cardsTrained: { type: 'cardsTrained', cards: [] },
      turnStarted: { type: 'turnStarted', turn: 1 },
      enemyActed: { type: 'enemyActed', intent: { type: 'idle' }, enemyIndex: 0 },
      cardAdded: { type: 'cardAdded', cardId: 'wound', count: 1 },
      enemySpawned: { type: 'enemySpawned', enemyIndex: 0 },
      enemySplit: { type: 'enemySplit', enemyIndex: 0, spawned: [1] },
      goldStolen: { type: 'goldStolen', amount: 5, enemyIndex: 0 },
      goldReturned: { type: 'goldReturned', amount: 5 },
      enemyFled: { type: 'enemyFled', enemyIndex: 0 },
      maxHpStolen: { type: 'maxHpStolen', amount: 1, enemyIndex: 0 },
      minionRaised: { type: 'minionRaised', enemyIndex: 0 },
      minionDied: { type: 'minionDied', minion: 0 },
      commanded: { type: 'commanded', minion: 0, choice: 'block' },
      battleEnded: { type: 'battleEnded', result: 'won' },
      invalidAction: { type: 'invalidAction', reason: 'x' },
    }
    for (const e of Object.values(samples))
      for (const k of slots(e)) expect(SLOT_KEYS.has(k), `${e.type} → ${k}`).toBe(true)
    expect(slots({ ...samples.battleEnded, result: 'lost' } as GameEvent)).toEqual([
      'battle.end.lost',
    ])
  })
})
