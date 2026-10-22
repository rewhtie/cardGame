import { migrateLegacyId } from './enchant'
import type { RunContent, RunScreen, RunState } from './run'

const SAVE_KEY = 'cardfire.save'
const SAVE_VERSION = 1
/** 只在这些界面存档：地图节点之间，以及战斗后的奖励结算（唯一的例外） */
const SAVABLE_SCREENS: readonly RunScreen[] = ['map', 'reward']

/** 选中但尚未结算的地图节点：读档后重新进入它（战斗 / 事件由种子决定，结果一致） */
export interface NodeEntry {
  id: string
  god?: boolean
}

/**
 * 存档：整局状态去掉可由 data 重建的静态内容（卡牌定义、敌人、事件池等），
 * 只保留会变化的牌组。事件池里有函数，本来也无法序列化。
 * enter 存在时，run 是选节点之前的地图状态，读档后要重新进入该节点。
 */
export interface RunSave {
  version: number
  run: Omit<RunState, 'content'>
  deck: string[]
  enter?: NodeEntry
}

/** 当前状态是否应当存档；战斗、休息、事件等中途界面返回 null（沿用上一次存档） */
export function toSave(run: RunState, enter?: NodeEntry): RunSave | null {
  if (!SAVABLE_SCREENS.includes(run.screen)) return null
  const { content, ...rest } = run
  return {
    version: SAVE_VERSION,
    run: { ...rest, battle: null },
    deck: content.deck,
    ...(enter && { enter }),
  }
}

/** 用存档 + 最新的静态内容还原整局 */
export function fromSave(save: RunSave, content: RunContent): RunState {
  return { ...save.run, battle: null, content: { ...content, deck: save.deck.map(migrateLegacyId) } }
}

function isSave(raw: unknown): raw is RunSave {
  const s = raw as Partial<RunSave> | null
  return (
    !!s &&
    s.version === SAVE_VERSION &&
    Array.isArray(s.deck) &&
    !!s.run &&
    typeof s.run.seed === 'string' &&
    SAVABLE_SCREENS.includes(s.run.screen)
  )
}

/** 读取存档；没有或损坏时返回 null */
export function loadSave(storage: Pick<Storage, 'getItem'>): RunSave | null {
  try {
    const raw = storage.getItem(SAVE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isSave(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 状态变化后调用：地图 / 奖励界面写入存档，通关 / 失败清除存档，其余界面保持原存档不动。
 * 选中地图节点时传入选节点之前的地图状态和 enter，存档就停在"刚点下这个节点"。
 */
export function persistRun(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  run: RunState,
  enter?: NodeEntry,
) {
  try {
    const save = toSave(run, enter)
    if (save) storage.setItem(SAVE_KEY, JSON.stringify(save))
    else if (run.screen === 'victory' || run.screen === 'defeat') storage.removeItem(SAVE_KEY)
  } catch {
    // 存储不可用（如配额已满）时忽略，不影响当前这局
  }
}
