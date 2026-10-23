import type { CardSpec } from './cardSpec'

/** 玩家对内置卡牌的改动：卡牌 id -> 改过的完整数据；内置数据本身不动，删掉记录即还原 */
export type CardOverrides = Record<string, CardSpec>

const KEY = 'cardfire.cardOverrides'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** 读取玩家改动；数据损坏或格式不对的条目直接丢弃，不影响游戏启动 */
export function loadCardOverrides(): CardOverrides {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, CardSpec>
    return Object.fromEntries(
      Object.entries(data).filter(([id, s]) => s && s.id === id && Array.isArray(s.effects)),
    )
  } catch {
    return {}
  }
}

export function saveCardOverrides(overrides: CardOverrides) {
  const s = storage()
  if (!s) return
  if (Object.keys(overrides).length) s.setItem(KEY, JSON.stringify(overrides))
  else s.removeItem(KEY)
}
