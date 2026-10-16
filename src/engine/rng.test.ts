import { describe, expect, it } from 'vitest'
import { nextRandom, shuffle } from './rng'

describe('rng', () => {
  it('同种子产生相同序列', () => {
    const a = nextRandom(42)
    const b = nextRandom(42)
    expect(a).toEqual(b)
    expect(a[0]).toBeGreaterThanOrEqual(0)
    expect(a[0]).toBeLessThan(1)
  })

  it('shuffle 可复现且不修改入参', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const [r1, s1] = shuffle(input, 7)
    const [r2, s2] = shuffle(input, 7)
    expect(r1).toEqual(r2)
    expect(s1).toBe(s2)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...r1].sort()).toEqual([...input].sort())
  })
})
