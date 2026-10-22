import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { cardText } from './enchant'

describe('X 费牌卡面文字', () => {
  it('N×X 显示为 NX：造成 6X 点伤害', () => {
    expect(cardText(cards.spinStrike!)).toBe('对所有敌人造成 6X 点伤害。')
    expect(cardText(cards.spinDefend!)).toContain('获得 6X 点格挡')
  })
  it('有 X 加成时显示 N(X+n)', () => {
    expect(cardText({ ...cards.spinStrike!, xBonus: 1 })).toContain('造成 6(X+1) 点伤害')
  })
})
