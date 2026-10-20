import type { CardDef } from '@/engine/types'
import { CardPool } from './card'
import type { CardSpec } from './cardSpec'
import { curseCards } from './curses'
import { doctorBlue } from './doctor/blue'
import { doctorGold } from './doctor/gold'
import { doctorWhite } from './doctor/white'
import { warriorBlue } from './warrior/blue'
import { warriorGold } from './warrior/gold'
import { warriorWhite } from './warrior/white'

export { Card, CardPool } from './card'

/** 各职业的卡牌（按白 → 蓝 → 金注册，顺序决定奖励候选和初始牌组的顺序）；key 为目录名 */
const classCards = {
  warrior: [...warriorWhite, ...warriorBlue, ...warriorGold],
  doctor: [...doctorWhite, ...doctorBlue, ...doctorGold],
}

const classPools = Object.fromEntries(
  Object.entries(classCards).map(([id, list]) => [id, new CardPool(list)]),
)

/** 全部卡牌定义；跨职业重复的 id 会报错 */
const pool = new CardPool([...Object.values(classCards).flat(), ...curseCards])

export const cards: Record<string, CardDef> = pool.defs()

/** 各职业可作为战斗奖励出现的卡牌（不含初始卡）；key 为目录名 */
export const classRewardIds: Record<string, string[]> = Object.fromEntries(
  Object.entries(classPools).map(([id, p]) => [id, p.rewardIds()]),
)

/** 战士的初始牌组 */
export const starterDeck: string[] = classPools.warrior!.starterDeck()

/** 开发面板用：全部可编辑卡牌及其所在职业目录（按需生成，不进正常游戏流程） */
export const editableCards = (): { dir: string; spec: CardSpec }[] =>
  Object.entries(classCards).flatMap(([dir, list]) => list.map((c) => ({ dir, spec: c.spec() })))
