import { describe, expect, it } from 'vitest'
import { SFX_SLOTS, SLOT_KEYS } from './sfxSlots'

describe('SFX_SLOTS', () => {
  it('键互不相同', () => {
    expect(new Set(SFX_SLOTS.map((s) => s.key)).size).toBe(SFX_SLOTS.length)
  })
  it('键格式合法', () => {
    for (const s of SFX_SLOTS) expect(s.key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/)
  })
  it('label 与 group 非空', () => {
    for (const s of SFX_SLOTS) {
      expect(s.label).not.toBe('')
      expect(s.group).not.toBe('')
    }
  })
  it('包含史莱姆分裂', () => {
    expect(SLOT_KEYS.has('battle.enemy.split')).toBe(true)
  })
})
