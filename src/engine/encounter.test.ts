import { describe, expect, it } from 'vitest'
import { monsterPool } from '@/data/enemies'
import { pickEncounter } from './encounter'
import { createRng } from './seed'

describe('pickEncounter', () => {
  it.each([
    ['summoner', 'goblin'],
    ['summoner', 'split-slime'],
  ])('%s 与 %s 不会同场', (a, b) => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let floor = 1; floor <= 13; floor++) {
        const ids = pickEncounter(monsterPool, floor, [], createRng(seed)).map((e) => e.id)
        expect(ids.includes(a) && ids.includes(b)).toBe(false)
      }
    }
  })
})
