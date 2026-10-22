import { describe, expect, it } from 'vitest'
import {
  evolveDeck,
  evolvedId,
  enchantOf,
  withEnchant,
  isUpgraded,
  progressOf,
  rawId,
  toInstanceIds,
  upgradedId,
  withProgress,
} from './enchant'
import type { CardDef } from './types'

const strike0: CardDef = {
  id: 'strike0',
  rarity: 'white',
  name: '打击',
  cost: 1,
  target: 'enemy',
  kind: 'attack',
  effects: [{ type: 'damage', amount: 6 }],
  text: '造成 6 点伤害',
  evolve: { plays: 10, into: 'swordStrike' },
}
const defend: CardDef = {
  id: 'defend',
  rarity: 'white',
  name: '防御',
  cost: 1,
  target: 'self',
  kind: 'skill',
  effects: [{ type: 'block', amount: 5 }],
  text: '获得 5 点格挡',
}
const cards = { strike0, defend }

describe('进化 id 后缀', () => {
  it('progressOf / withProgress', () => {
    expect(progressOf('a~7')).toBe(7)
    expect(progressOf('a')).toBe(0)
    expect(withProgress('a+@grow', 3)).toBe('a+@grow~3')
    expect(withProgress('a~3', 0)).toBe('a')
    expect(withProgress('a~3#2', 5)).toBe('a~5#2')
  })

  it('rawId / isUpgraded / isEnchanted 容忍 ~N', () => {
    expect(rawId('a+@grow~7#3')).toBe('a')
    expect(isUpgraded('a+~7')).toBe(true)
    expect(enchantOf('a@grow~7')).toBe('grow')
  })

  it('upgradedId / enchantedId 把标记插在 ~N 之前', () => {
    expect(upgradedId('a~7')).toBe('a+~7')
    expect(upgradedId('a@grow~7')).toBe('a+@grow~7')
    expect(withEnchant('a+~7', 'grow')).toBe('a+@grow~7')
  })

  it('evolvedId 保留 + / * 并丢掉进度', () => {
    expect(evolvedId('a+@grow~9', 'b')).toBe('b+@grow')
    expect(evolvedId('strike0+@grow~9', 'swordStrike')).toBe('swordStrike+@grow')
  })
})

describe('toInstanceIds', () => {
  it('可进化的牌各自编号，普通牌不编', () => {
    const ids = toInstanceIds(['strike0', 'strike0', 'defend'], cards)
    expect(ids[0]).toBe('strike0#0')
    expect(ids[1]).toBe('strike0#1')
    expect(ids[0]).not.toBe(ids[1])
    expect(ids[2]).toBe('defend')
  })
})

describe('evolveDeck', () => {
  it('达标换牌，未达标写回进度，0 次保持原样', () => {
    const r = evolveDeck(cards, ['strike0', 'strike0', 'strike0', 'defend'], {
      'strike0#0': 10,
      'strike0#1': 7,
      'strike0#2': 0,
    })
    expect(r.deck).toEqual(['swordStrike', 'strike0~7', 'strike0', 'defend'])
    expect(r.evolved).toEqual([{ from: 'strike0', to: 'swordStrike' }])
  })
})
