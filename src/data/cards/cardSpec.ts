import type { Effect } from '@/engine/types'

export type EditableRarity = 'white' | 'blue' | 'gold'

/** 升级版相对原卡的改动：只记录有变化的项 */
export interface UpgradeSpec {
  cost?: number | 'X'
  /** 升级后是否消耗（仅在与原卡不同时记录） */
  exhaust?: boolean
  /** 整体替换原效果；缺省沿用原效果 */
  effects?: Effect[]
  text?: string
}

/** 一张卡牌的可编辑数据：与 Card 构建器一一对应，可双向转换（Card.spec / Card.fromSpec） */
export interface CardSpec {
  id: string
  name: string
  rarity: EditableRarity
  icon?: string
  cost: number | 'X'
  target: 'enemy' | 'self' | 'power'
  exhaust: boolean
  unplayable: boolean
  endTurnLoseHp: number
  reward: boolean
  starter: number
  /** 手写卡面文字；缺省由效果自动生成 */
  text?: string
  effects: Effect[]
  upgrade?: UpgradeSpec
}
