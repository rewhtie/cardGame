import { describe, expect, it } from 'vitest'
import { SFX_SLOTS } from '@/data/sfxSlots'
import { sfxSlotsForEvent } from '@/composables/sfxResolve'
import { sceneFor } from './sfxScenes'

/** 允许没有场景的槽位白名单：目前为空，每个槽位都必须能复现 */
const NO_SCENE = new Set<string>()

describe('sceneFor', () => {
  it('每个槽位都有场景', () => {
    for (const s of SFX_SLOTS) expect(() => sceneFor(s.key), s.key).not.toThrow()
  })

  it('战斗场景的事件序列能触发该槽位', () => {
    for (const s of SFX_SLOTS) {
      const scene = sceneFor(s.key)
      if (scene.kind !== 'battle') continue
      const { state, events } = scene.build()
      expect(events.length, `${s.key} 事件为空`).toBeGreaterThan(0)
      const keys = events.flatMap((e, i) => sfxSlotsForEvent(e, events[i - 1], state.cards))
      expect(keys, s.key).toContain(s.key)
    }
  })

  it('战斗外场景都挂了组件', () => {
    for (const s of SFX_SLOTS) {
      const scene = sceneFor(s.key)
      if (scene.kind !== 'run') continue
      if (NO_SCENE.has(s.key)) continue
      expect(scene.component, s.key).not.toBe('none')
    }
  })
})

describe('场景只演示槽位相关的事件', () => {
  it('结束回合类场景不夹带整回合（弃牌 / 抽 5 张 / 无关的敌人攻击）', () => {
    for (const s of SFX_SLOTS) {
      const scene = sceneFor(s.key)
      if (scene.kind !== 'battle') continue
      const { events } = scene.build()
      const draws = events.filter((e) => e.type === 'cardDrawn').length
      const limit = s.key === 'battle.turnStarted' ? 5 : 3
      expect(draws, `${s.key} 抽牌事件过多`).toBeLessThanOrEqual(limit)
      if (s.key !== 'battle.handDiscarded')
        expect(events.some((e) => e.type === 'handDiscarded'), `${s.key} 夹带了弃牌`).toBe(false)
    }
  })
  it('非攻击类槽位的场景里没有伤害事件', () => {
    const calm = ['battle.cardDrawn', 'battle.reshuffled', 'battle.block.enemy', 'battle.enemy.act', 'battle.enemy.spawn',
      'battle.enemy.split', 'battle.status.debuff', 'battle.status.removed', 'battle.gold.stolen', 'battle.enemy.flee', 'battle.turnStarted']
    for (const key of calm) {
      const scene = sceneFor(key)
      if (scene.kind !== 'battle') continue
      expect(scene.build().events.some((e) => e.type === 'damageDealt'), key).toBe(false)
    }
  })
})
