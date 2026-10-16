import { describe, expect, it } from 'vitest'
import { deriveSeed, generateSeed, hashSeed, normalizeSeed } from './seed'

describe('seed', () => {
  it('hashSeed 稳定且区分不同输入', () => {
    expect(hashSeed('ABC')).toBe(hashSeed('ABC'))
    expect(hashSeed('ABC')).not.toBe(hashSeed('ABD'))
  })

  it('deriveSeed：同标签相同，不同标签不同', () => {
    expect(deriveSeed('S', 'map')).toBe(deriveSeed('S', 'map'))
    expect(deriveSeed('S', 'map')).not.toBe(deriveSeed('S', 'battle:0-0'))
  })

  it('normalizeSeed 去空白并转大写', () => {
    expect(normalizeSeed('  abc12 ')).toBe('ABC12')
  })

  it('generateSeed 生成 8 位无易混淆字符的短码', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSeed()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    }
  })

  it('generateSeed 可注入随机源，结果可复现', () => {
    expect(generateSeed(() => 0)).toBe('AAAAAAAA')
  })
})
