import type { CardDef } from '@/engine/types'
import { CardPool } from './card'
import type { CardSpec } from './cardSpec'
import { curseCards } from './curses'
import { colorlessBlue } from './colorless/blue'
import { colorlessGold } from './colorless/gold'
import { colorlessWhite } from './colorless/white'
import { ancientTreeBlue } from './ancientTree/blue'
import { ancientTreeGold } from './ancientTree/gold'
import { ancientTreeWhite } from './ancientTree/white'
import { doctorBlue } from './doctor/blue'
import { doctorGold } from './doctor/gold'
import { doctorWhite } from './doctor/white'
import { swordSaintBlue } from './swordSaint/blue'
import { swordSaintGold } from './swordSaint/gold'
import { swordSaintWhite } from './swordSaint/white'
import { warriorBlue } from './warrior/blue'
import { warriorGold } from './warrior/gold'
import { warriorWhite } from './warrior/white'

export { Card, CardPool } from './card'

/** 各职业的卡牌（按白 → 蓝 → 金注册，顺序决定奖励候选和初始牌组的顺序）；key 为目录名 */
const classCards = {
  warrior: [...warriorWhite, ...warriorBlue, ...warriorGold],
  doctor: [...doctorWhite, ...doctorBlue, ...doctorGold],
  swordSaint: [...swordSaintWhite, ...swordSaintBlue, ...swordSaintGold],
  ancientTree: [...ancientTreeWhite, ...ancientTreeBlue, ...ancientTreeGold],
}

/** 通用无色牌：所有职业共用，进每个职业的奖励池 / 图鉴 */
const colorless = [...colorlessWhite, ...colorlessBlue, ...colorlessGold]
const colorlessPool = new CardPool(colorless)

const classPools = Object.fromEntries(
  Object.entries(classCards).map(([id, list]) => [id, new CardPool(list)]),
)

/** 全部卡牌定义；跨职业重复的 id 会报错 */
const pool = new CardPool([...Object.values(classCards).flat(), ...colorless, ...curseCards])

export const cards: Record<string, CardDef> = pool.defs()

/** 各职业可作为战斗奖励出现的卡牌（不含初始卡）；key 为目录名 */
export const classRewardIds: Record<string, string[]> = Object.fromEntries(
  Object.entries(classPools).map(([id, p]) => [id, p.rewardIds()]),
)

/** 通用无色牌的奖励候选 / 全部 id */
export const colorlessRewardIds: string[] = colorlessPool.rewardIds()
export const colorlessAllIds: string[] = colorless.map((c) => c.id)

/** 各职业目录下的全部卡牌 id（含初始卡，不含跨职业共用的卡）；key 为目录名 */
export const classAllIds: Record<string, string[]> = Object.fromEntries(
  Object.entries(classCards).map(([id, list]) => [id, list.map((c) => c.id)]),
)

/** 战士的初始牌组 */
export const starterDeck: string[] = classPools.warrior!.starterDeck()

/** 开发面板用：全部可编辑卡牌及其所在职业目录（按需生成，不进正常游戏流程） */
export const editableCards = (): { dir: string; spec: CardSpec }[] =>
  Object.entries({ ...classCards, colorless }).flatMap(([dir, list]) => list.map((c) => ({ dir, spec: c.spec() })))
