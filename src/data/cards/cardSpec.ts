import type { Effect } from '@/engine/types'

export type EditableRarity = 'white' | 'blue' | 'gold'

/** 升级版相对原卡的改动：只记录有变化的项 */
export interface UpgradeSpec {
  cost?: number | 'X'
  /** 升级后是否消耗（仅在与原卡不同时记录） */
  exhaust?: boolean
  /** 升级后是否保留（仅在与原卡不同时记录） */
  retain?: boolean
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
  target: 'enemy' | 'allEnemies' | 'self' | 'power'
  /** 需要选敌人但不算攻击牌的技能牌（仅 target 为 enemy / allEnemies 时有意义） */
  asSkill?: boolean
  exhaust: boolean
  /** 虚无：回合结束时若还在手牌中则消耗 */
  ethereal?: boolean
  /** 保留：回合结束时留在手牌 */
  retain?: boolean
  /** 蓄势：每保留一回合，第一段伤害 +n（隐含保留） */
  retainGrow?: number
  /** 固有：每场战斗第一回合必定抽上手 */
  innate?: boolean
  /** 增量：每打出一次，卡面数值 +n */
  grow?: number
  unplayable: boolean
  endTurnLoseHp: number
  reward: boolean
  starter: number
  /** 手写卡面文字；缺省由效果自动生成 */
  text?: string
  effects: Effect[]
  upgrade?: UpgradeSpec
  /** 进化：打出 plays 次后变成 into */
  evolve?: { plays: number; into: string }
  /** 全场寄生种子合计达到该值时免费 */
  freeIfParasiteTotal?: number
  /** 有剑意时免费 */
  freeIfSwordIntent?: boolean
}
