import { describe, expect, it } from 'vitest'
import { CHARACTER_RELIC_IDS, characterById, characters } from './characters'

describe('参天古树', () => {
  it('起手 4 打击 + 4 防御，带寄生之种', () => {
    const c = characters.find((x) => x.id === 'ancientTree')
    expect(c).toBeDefined()
    expect(characterById('ancientTree').name).toBe('参天古树')
    expect(c!.deck).toEqual([...Array(4).fill('strike'), ...Array(4).fill('defend')])
    expect(c!.relics).toEqual(['parasiteSeed'])
    expect(CHARACTER_RELIC_IDS).toContain('parasiteSeed')
  })
})
