import { describe, expect, it } from 'vitest'
import { renderCardsDoc, renderEnemiesDoc, renderSfxDoc, renderStatusesDoc } from './docSyncCore'

describe('编辑面板数据文档', () => {
  it('卡牌清单：和数据一一对应，删掉一张牌文档里就没有，未分组的牌归到其他', () => {
    const c = (id: string, name: string, rarity = 'white') => ({ id, name, cost: 1, kind: 'attack' as const, rarity, text: '造成 6 点伤害' })
    const all = { a: c('a', '甲'), b: c('b', '乙'), curse: c('curse', '诅咒牌', 'curse') }
    const groups = [{ title: '战士', ids: ['a', 'b'] }]
    const full = renderCardsDoc(all, groups)
    expect(full).toContain('| a | 甲 |')
    expect(full).toContain('其他（诅咒 / 状态）')
    const { b: _b, ...rest } = all
    const after = renderCardsDoc(rest, [{ title: '战士', ids: ['a', 'b'] }])
    expect(after).not.toContain('乙')
    expect(after).toContain('共 2 张')
  })
  it('敌人文档：意图、遭遇、分裂都能渲染', () => {
    const doc = renderEnemiesDoc({
      enemies: [
        { id: 'x', name: '甲', role: 'monster', maxHp: 10, threat: 1, intents: [{ type: 'attack', damage: 5, hits: 2 }, { type: 'defend', block: 3, also: [{ type: 'idle' }] }] },
      ],
      encounters: [{ id: 'e', name: '组', enemies: ['x', 'x'], minFloor: 1, maxFloor: 3 }],
    })
    expect(doc).toContain('攻击 5×2')
    expect(doc).toContain('防御 3；蓄力')
    expect(doc).toContain('甲 + 甲')
  })
  it('音效与状态文档：未配置槽位标出来', () => {
    expect(renderSfxDoc({}, [{ key: 'k', label: '某动作', group: '战斗' }])).toContain('（未配置）')
    expect(renderStatusesDoc([{ id: 's', name: '力量', icon: '💪', kind: 'buff', decay: 'none', text: '+N' }])).toContain('常驻')
  })
})
