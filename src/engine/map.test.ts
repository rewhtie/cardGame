import { describe, expect, it } from 'vitest'
import { BOSS_ID, COLS, FLOORS, findNode, generateMap, type GameMap, type NodeType } from './map'

const SEEDS = Array.from({ length: 300 }, (_, i) => `SEED-${i}`)
const maps = SEEDS.map((s) => generateMap(s))

function forEachMap(check: (map: GameMap) => void) {
  for (const map of maps) check(map)
}

describe('generateMap 确定性', () => {
  it('同种子生成完全相同的地图', () => {
    expect(generateMap('ABC12345')).toEqual(generateMap('ABC12345'))
  })

  it('不同种子会生成不同的地图', () => {
    const signatures = new Set(maps.map((m) => JSON.stringify(m.floors)))
    expect(signatures.size).toBeGreaterThan(maps.length * 0.9)
  })
})

describe('generateMap 结构', () => {
  it('共 15 层，每层 1–4 个节点', () => {
    forEachMap((map) => {
      expect(map.floors).toHaveLength(FLOORS)
      for (const floor of map.floors) {
        expect(floor.length).toBeGreaterThanOrEqual(1)
        expect(floor.length).toBeLessThanOrEqual(4)
      }
    })
  })

  it('起点只有一个，且是先古房；第一步至少分成 2 条路', () => {
    forEachMap((map) => {
      expect(map.floors[0]).toHaveLength(1)
      expect(map.floors[0]![0]!.type).toBe('ancient')
      expect(map.floors[0]![0]!.next.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('列号在范围内，且同层节点列号唯一', () => {
    forEachMap((map) => {
      for (const floor of map.floors) {
        const cols = floor.map((n) => n.col)
        expect(new Set(cols).size).toBe(cols.length)
        for (const c of cols) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThan(COLS)
        }
      }
    })
  })

  it('没有死路：每个节点都有出路，且出路指向下一层真实存在的节点', () => {
    forEachMap((map) => {
      for (const floor of map.floors) {
        for (const node of floor) {
          expect(node.next.length).toBeGreaterThanOrEqual(1)
          for (const id of node.next) {
            const target = findNode(map, id)
            expect(target).toBeDefined()
            expect(target!.floor).toBe(node.floor + 1)
            expect(Math.abs(target!.col - node.col)).toBeLessThanOrEqual(id === BOSS_ID ? COLS : 1)
          }
        }
      }
    })
  })

  it('没有孤儿：第 1 层之后每个节点都至少有一个父节点', () => {
    forEachMap((map) => {
      for (let f = 1; f < FLOORS; f++) {
        for (const node of map.floors[f]!) {
          expect(map.floors[f - 1]!.some((p) => p.next.includes(node.id))).toBe(true)
        }
      }
    })
  })

  it('连线不交叉', () => {
    forEachMap((map) => {
      for (let f = 0; f < FLOORS - 1; f++) {
        const edges = map.floors[f]!.flatMap((n) =>
          n.next.map((id) => ({ from: n.col, to: findNode(map, id)!.col })),
        )
        for (const a of edges) {
          for (const b of edges) {
            expect(a.from < b.from && a.to > b.to).toBe(false)
          }
        }
      }
    })
  })

  it('最后一层全部连向 Boss，Boss 是唯一的 boss 类型节点', () => {
    forEachMap((map) => {
      for (const node of map.floors[FLOORS - 1]!) expect(node.next).toEqual([BOSS_ID])
      expect(map.boss.type).toBe('boss')
      const bossCount = map.floors.flat().filter((n) => n.type === 'boss').length
      expect(bossCount).toBe(0)
    })
  })
})

describe('generateMap 类型规则', () => {
  const typeAt = (map: GameMap, id: string) => findNode(map, id)!.type

  it('只有 Boss 前一层固定为休息，其余层不是全部同类型的固定层', () => {
    forEachMap((map) => {
      for (const node of map.floors[FLOORS - 1]!) expect(node.type).toBe('rest')
      expect(map.floors[FLOORS - 2]!.some((n) => n.type === 'rest')).toBe(false)
    })
  })

  it('楼层限制：前 5 层无精英和休息，前 3 层无商店和宝箱', () => {
    forEachMap((map) => {
      map.floors.forEach((floor, f) => {
        for (const node of floor) {
          if (f < 5) expect(['elite', 'rest']).not.toContain(node.type)
          if (f < 3) expect(['shop', 'treasure']).not.toContain(node.type)
        }
      })
    })
  })

  it('精英、休息、商店不与父节点同类型', () => {
    const restricted: NodeType[] = ['elite', 'rest', 'shop']
    forEachMap((map) => {
      for (const floor of map.floors) {
        for (const parent of floor) {
          for (const id of parent.next) {
            if (id === BOSS_ID) continue
            const type = typeAt(map, id)
            if (restricted.includes(type)) expect(type).not.toBe(parent.type)
          }
        }
      }
    })
  })

  it('各种类型整体上都会出现', () => {
    const seen = new Set<NodeType>()
    for (const map of maps) for (const n of map.floors.flat()) seen.add(n.type)
    for (const t of ['monster', 'elite', 'rest', 'shop', 'event', 'treasure'] as NodeType[]) {
      expect(seen.has(t)).toBe(true)
    }
  })
})

describe('findNode', () => {
  it('能按 id 找到节点和 Boss', () => {
    const map = generateMap('FIND-ME')
    const first = map.floors[0]![0]!
    expect(findNode(map, first.id)).toBe(first)
    expect(findNode(map, BOSS_ID)).toBe(map.boss)
    expect(findNode(map, '99-9')).toBeUndefined()
  })
})
