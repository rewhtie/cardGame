import { describe, expect, it } from 'vitest'
import { cards } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createRun, dispatchRun, maxPotions, type RunState } from './run'
import { fromSave, toSave } from './save'

const rest = (character: string, deck: string[], extra: Partial<RunState> = {}): RunState => {
  const run = createRun({ seed: 'T', cards, deck, enemy: slime, potionIds: ['p1', 'p2', 'p3'] })
  return { ...run, character, screen: 'rest', content: { ...run.content, deck }, ...extra }
}
const use = (run: RunState) => dispatchRun(run, { type: 'campfireSpecial' })

describe('剑圣火堆：训练', () => {
  const deck = ['swordStrike0', 'swordStrike0~5', 'swordStrike0~19', 'defend']

  it('所有可进化的牌 +1，其余不变，回到地图', () => {
    const s = use(rest('swordSaint', deck.slice(0, 2).concat('defend'))).state
    expect(s.screen).toBe('map')
    expect(s.content.deck).toEqual(['swordStrike0~1', 'swordStrike0~6', 'defend'])
  })

  it('进度达标立即进化并发事件', () => {
    const r = use(rest('swordSaint', deck))
    expect(r.state.content.deck[2]).not.toContain('swordStrike0')
    expect(r.events.some((e) => e.type === 'cardsEvolved')).toBe(true)
  })

  it('没有可进化的牌不能训练', () => {
    expect(use(rest('swordSaint', ['defend'])).state.screen).toBe('rest')
  })
})

describe('医生火堆：药剂台', () => {
  it('发现两瓶不同的药水进入待选，不直接入栏；回到地图', () => {
    const r = use(rest('plagueDoctor', ['defend'])).state
    expect(r.screen).toBe('map')
    expect(r.potions).toHaveLength(0)
    expect(r.potionOffer).toHaveLength(2)
    expect(new Set(r.potionOffer).size).toBe(2)
  })

  it('药水栏已满也能使用（待选里可放弃）', () => {
    const base = rest('plagueDoctor', ['defend'])
    const full = { ...base, potions: Array(maxPotions(base.relics)).fill('p1') }
    expect(use(full).state.potionOffer).toHaveLength(2)
  })

  it('待选药水可逐瓶拿走', () => {
    const s = use(rest('plagueDoctor', ['defend'])).state
    const t = dispatchRun(s, { type: 'takePotion', index: 0 }).state
    expect(t.potions).toHaveLength(1)
    expect(t.potionOffer).toHaveLength(1)
  })
})

describe('古树火堆：扎根', () => {
  it('只涨最大生命：当前生命的 20%（四舍五入，至少 1），不回血', () => {
    const s = use(rest('ancientTree', ['defend'], { player: { hp: 45, maxHp: 80 } })).state
    expect(s.player).toEqual({ hp: 45, maxHp: 89 })
    const low = use(rest('ancientTree', ['defend'], { player: { hp: 3, maxHp: 80 } })).state
    expect(low.player).toEqual({ hp: 3, maxHp: 81 })
  })

  it('火堆界面本身不写存档：读档回到进入火堆之前，加成不会叠加', () => {
    expect(toSave(rest('ancientTree', ['defend']))).toBeNull()
  })

  it('用完回地图后的存档只含一次加成', () => {
    const s = use(rest('ancientTree', ['defend'], { player: { hp: 40, maxHp: 80 } })).state
    const loaded = fromSave(JSON.parse(JSON.stringify(toSave(s))), s.content)
    expect(loaded.player).toEqual({ hp: 40, maxHp: 88 })
    expect(loaded.screen).toBe('map')
  })
})

describe('其他职业', () => {
  it('战士没有专属选项', () => {
    expect(use(rest('warrior', ['defend'])).state.screen).toBe('rest')
  })
})
