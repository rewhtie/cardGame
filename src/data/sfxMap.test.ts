import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { slotStatus } from '@/composables/sfxResolve'
import { SLOT_KEYS } from './sfxSlots'
import { sfxMap } from './sfxMap'

const dir = new URL('../assets/sfx/', import.meta.url)
const onDisk = new Set(readdirSync(dir))

describe('sfxMap', () => {
  it('每个键都在槽位清单里', () => {
    for (const k of Object.keys(sfxMap)) expect(SLOT_KEYS.has(k), k).toBe(true)
  })
  it('引用的文件都存在', () => {
    for (const [k, c] of Object.entries(sfxMap))
      for (const f of c.files ?? []) expect(onDisk.has(f), `${k} → ${f}`).toBe(true)
  })
  it('迁移来的槽位都已配置', () => {
    const keys = [
      'run.gold.gain',
      'battle.heal.player',
      'battle.heal.enemy',
      'battle.damage.player',
      'battle.damage.trigger',
      'battle.damage.enemy',
      'battle.damage.poison',
      'battle.block.player',
      'battle.block.enemy',
      'battle.damage.blocked',
      'run.forge.upgrade',
      'run.enchant',
      'battle.cardAdded.bad',
      'battle.cardAdded.normal',
      'battle.enemy.split',
    ]
    for (const k of keys) expect(slotStatus(sfxMap, k), k).toBe('configured')
    expect(sfxMap['battle.enemy.split']?.synth).toBe('split')
  })
})
