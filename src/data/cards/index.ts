import type { CardDef } from '@/engine/types'
import { attackCards } from './attacks'
import { CardPool } from './card'
import { powerCards } from './powers'
import { skillCards } from './skills'

export { Card, CardPool } from './card'

/** 注册顺序（攻击 → 技能 → 能力）决定奖励候选和初始牌组的顺序 */
const pool = new CardPool([...attackCards, ...skillCards, ...powerCards])

export const cards: Record<string, CardDef> = pool.defs()

/** 可作为战斗奖励出现的卡牌（不含初始卡） */
export const rewardCardIds: string[] = pool.rewardIds()

export const starterDeck: string[] = pool.starterDeck()
