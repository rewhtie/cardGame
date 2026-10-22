import { createRng, deriveSeed, type Rng } from './seed'

export type NodeType =
  'ancient' | 'monster' | 'elite' | 'rest' | 'shop' | 'event' | 'treasure' | 'boss'

export interface MapNode {
  id: string
  floor: number
  col: number
  type: NodeType
  next: string[]
}

export interface GameMap {
  seed: string
  /** floors[0] 只有一个起点（先古房），floors[FLOORS - 1] 是 Boss 前的休息层 */
  floors: MapNode[][]
  boss: MapNode
}

export const FLOORS = 15
export const COLS = 7
export const BOSS_ID = 'boss'
const MIN_PATHS = 2
const MAX_PATHS = 4

const WEIGHTS: Record<Exclude<NodeType, 'boss' | 'ancient'>, number> = {
  monster: 45,
  event: 22,
  rest: 12,
  elite: 8,
  shop: 5,
  treasure: 4,
}

/** 各类型最早出现的楼层 */
const MIN_FLOOR: Partial<Record<NodeType, number>> = {
  elite: 5,
  rest: 5,
  shop: 3,
  treasure: 3,
}

/** 不能与父节点同类型的类型 */
const NO_REPEAT_WITH_PARENT: readonly NodeType[] = ['elite', 'rest', 'shop']

const nodeId = (floor: number, col: number) => `${floor}-${col}`

/** 路径法：随机走出 2–4 条路径，合并成地图，再分配节点类型 */
function buildGraph(rng: Rng): Map<number, Set<number>>[] {
  // links[f].get(col) = 第 f 层 col 列节点连向第 f+1 层的列集合
  const links: Map<number, Set<number>>[] = Array.from({ length: FLOORS }, () => new Map())
  const pathCount = MIN_PATHS + rng.int(MAX_PATHS - MIN_PATHS + 1)
  const startCol = Math.floor(COLS / 2)

  for (let p = 0; p < pathCount; p++) {
    // 所有路径共用同一个起点
    let col = startCol

    for (let f = 0; f < FLOORS; f++) {
      if (!links[f]!.has(col)) links[f]!.set(col, new Set())
      if (f === FLOORS - 1) break

      const candidates = [col - 1, col, col + 1].filter((c) => {
        if (c < 0 || c >= COLS) return false
        // 会与已有对角线交叉的走法排除
        if (c === col + 1 && links[f]!.get(col + 1)?.has(col)) return false
        if (c === col - 1 && links[f]!.get(col - 1)?.has(col)) return false
        return true
      })
      // 起点处尽量让每条路径走向不同的分支，避免地图退化成一条线
      const fresh = f === 0 ? candidates.filter((c) => !links[0]!.get(col)?.has(c)) : []
      const pool = fresh.length > 0 ? fresh : candidates
      const next = pool[rng.int(pool.length)] as number
      links[f]!.get(col)!.add(next)
      col = next
    }
  }
  return links
}

function pickType(
  rng: Rng,
  floor: number,
  parentTypes: NodeType[],
  siblingTypes: Set<NodeType>,
): NodeType {
  const types = Object.keys(WEIGHTS) as Exclude<NodeType, 'boss' | 'ancient'>[]
  const allowed = types.filter((t) => {
    if (floor < (MIN_FLOOR[t] ?? 0)) return false
    if (t === 'rest' && floor === FLOORS - 2) return false // 下一层已是休息层
    if (NO_REPEAT_WITH_PARENT.includes(t) && parentTypes.includes(t)) return false
    return true
  })
  const preferred = allowed.filter((t) => !siblingTypes.has(t))
  const pool = preferred.length > 0 ? preferred : allowed
  if (pool.length === 0) return 'monster'

  let roll = rng.float() * pool.reduce((sum, t) => sum + WEIGHTS[t], 0)
  for (const t of pool) {
    roll -= WEIGHTS[t]
    if (roll < 0) return t
  }
  return pool[pool.length - 1] as NodeType
}

/** 保底：整张图至少有一个商店。随机分配没出商店时，把一个普通战斗 / 事件节点改成商店；只在缺商店时才消耗随机数，不影响已有商店的地图 */
function ensureShop(floors: MapNode[][], rng: Rng) {
  const nodes = floors.flat()
  if (nodes.some((n) => n.type === 'shop')) return
  const lo = MIN_FLOOR.shop ?? 1
  const inRange = nodes.filter((n) => n.floor >= lo && n.floor <= FLOORS - 2)
  const plain = inRange.filter((n) => n.type === 'monster' || n.type === 'event')
  const pool = plain.length > 0 ? plain : inRange.filter((n) => n.type !== 'elite' && n.type !== 'rest')
  if (pool.length === 0) return
  ;(pool[rng.int(pool.length)] as MapNode).type = 'shop'
}

export function generateMap(seed: string): GameMap {
  const rng = createRng(deriveSeed(seed, 'map'))
  const links = buildGraph(rng)

  const floors: MapNode[][] = links.map((floorLinks, floor) =>
    [...floorLinks.keys()]
      .sort((a, b) => a - b)
      .map((col) => ({
        id: nodeId(floor, col),
        floor,
        col,
        type: 'monster' as NodeType,
        next:
          floor === FLOORS - 1
            ? [BOSS_ID]
            : [...(floorLinks.get(col) as Set<number>)]
                .sort((a, b) => a - b)
                .map((c) => nodeId(floor + 1, c)),
      })),
  )

  // 分配类型：逐层处理，父节点类型已确定
  const byId = new Map<string, MapNode>(floors.flat().map((n) => [n.id, n]))
  const assigned = new Set<string>()
  for (let f = 0; f < FLOORS; f++) {
    for (const node of floors[f] as MapNode[]) {
      if (f === FLOORS - 1) {
        node.type = 'rest'
      } else if (f === 0) {
        node.type = 'ancient' // 唯一的起点是先古遗物三选一
      } else {
        const parents = (floors[f - 1] ?? []).filter((p) => p.next.includes(node.id))
        const siblings = new Set<NodeType>()
        for (const p of parents) {
          for (const id of p.next) {
            if (id !== node.id && assigned.has(id)) siblings.add((byId.get(id) as MapNode).type)
          }
        }
        node.type = pickType(
          rng,
          f,
          parents.map((p) => p.type),
          siblings,
        )
      }
      assigned.add(node.id)
    }
  }

  ensureShop(floors, rng)

  const boss: MapNode = {
    id: BOSS_ID,
    floor: FLOORS,
    col: Math.floor(COLS / 2),
    type: 'boss',
    next: [],
  }
  return { seed, floors, boss }
}

export function findNode(map: GameMap, id: string): MapNode | undefined {
  if (id === BOSS_ID) return map.boss
  const floor = Number(id.split('-')[0])
  return map.floors[floor]?.find((n) => n.id === id)
}
