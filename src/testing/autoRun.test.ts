import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { DEFAULT_TEST_TURNS, traceCard, verifyCard } from './autoRun'

describe('自动运行轨迹', () => {
  it('默认跑 3 个回合：最后一步停在第 4 回合开始', () => {
    expect(DEFAULT_TEST_TURNS).toBe(3)
    const t = traceCard('footwork')
    expect(t.turns).toBe(3)
    expect(t.steps.filter((s) => s.label.endsWith('结束回合'))).toHaveLength(3)
    expect(t.steps.at(-1)!.state.turn).toBe(4)
  })

  it('灵巧步法：第 1 回合就打出，敏捷 2 层保留到最后', () => {
    const t = traceCard('footwork')
    expect(t.played).toBeGreaterThan(0)
    expect(t.steps.at(-1)!.state.player.statuses.dexterity).toBeGreaterThanOrEqual(2)
    expect(t.problems).toEqual([])
  })

  it('可以指定回合数', () => {
    const t = traceCard('strike', { turns: 1 })
    expect(t.steps.filter((s) => s.label.endsWith('结束回合'))).toHaveLength(1)
  })

  it('同种子同轨迹', () => {
    const a = traceCard('heavyBlow').steps.map((s) => s.lines)
    const b = traceCard('heavyBlow').steps.map((s) => s.lines)
    expect(a).toEqual(b)
  })

  it('日志是中文文字，不含非法操作', () => {
    const lines = traceCard('footwork').steps.flatMap((s) => s.lines)
    expect(lines.some((l) => l.includes('敏捷'))).toBe(true)
    expect(lines.some((l) => l.includes('非法操作'))).toBe(false)
  })

  describe('卡池里每张牌都能自动跑完', () => {
    for (const id of Object.keys(cards)) {
      it(`${cards[id]!.name} (${id})`, () => {
        const t = traceCard(id)
        expect(t.played).toBeGreaterThan(0)
        expect(t.problems).toEqual([])
        expect(t.steps.flatMap((s) => s.lines).some((l) => l.includes('非法操作'))).toBe(false)
      })
    }
  })

  it('verifyCard 能发现问题：未知卡牌', () => {
    expect(verifyCard('nope')).not.toEqual([])
  })
})
