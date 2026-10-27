import type { CardDef } from '@/engine/types'
import { Card, CardPool } from './card'
import { loadCardOverrides } from './overrides'
import type { CardSpec } from './cardSpec'
import { curseCards } from './curses'
import { exclusiveStatus } from './exclusive/status'
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

/** 玩家改动只在打包后的版本生效；开发模式的编辑直接改源码，不读这份记录。记录里有但内置已不存在的 id 自然被忽略 */
const overrides = import.meta.env.DEV ? {} : loadCardOverrides()
/** 玩家只能调数值和效果：id、稀有度、是否进奖励池、初始张数以内置为准；改坏了无法构建就沿用原卡 */
const patch = (list: Card[]): Card[] =>
  list.map((c) => {
    const o = overrides[c.id]
    if (!o) return c
    try {
      const base = c.spec()
      const card = Card.fromSpec({
        ...o,
        id: base.id,
        rarity: base.rarity,
        reward: base.reward,
        starter: base.starter,
      })
      card.build()
      return card
    } catch {
      return c
    }
  })

/** 各职业的卡牌（按白 → 蓝 → 金注册，顺序决定奖励候选和初始牌组的顺序）；key 为目录名 */
const rawClassCards = {
  warrior: [...warriorWhite, ...warriorBlue, ...warriorGold],
  doctor: [...doctorWhite, ...doctorBlue, ...doctorGold],
  swordSaint: [...swordSaintWhite, ...swordSaintBlue, ...swordSaintGold],
  ancientTree: [...ancientTreeWhite, ...ancientTreeBlue, ...ancientTreeGold],
}
const classCards = Object.fromEntries(
  Object.entries(rawClassCards).map(([dir, list]) => [dir, patch(list)]),
) as typeof rawClassCards

/** 通用无色牌：所有职业共用，进每个职业的奖励池 / 图鉴 */
const rawColorless = [...colorlessWhite, ...colorlessBlue, ...colorlessGold]
const colorless = patch(rawColorless)
const exclusive = patch(exclusiveStatus)
export const exclusiveAllIds = exclusive.map((c) => c.id)
const colorlessPool = new CardPool(colorless)

const classPools = Object.fromEntries(
  Object.entries(classCards).map(([id, list]) => [id, new CardPool(list)]),
)

/** 全部卡牌定义；跨职业重复的 id 会报错 */
const pool = new CardPool([
  ...Object.values(classCards).flat(),
  ...colorless,
  ...exclusive,
  ...curseCards,
])

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

/**
 * 编辑面板用：全部可编辑卡牌及其所在职业目录（按需生成，不进正常游戏流程）。
 * spec 是当前生效的数据（含玩家改动），base 是内置原版，用来判断是否被改过 / 还原
 */
export const editableCards = (): { dir: string; spec: CardSpec; base: CardSpec }[] => {
  const baseOf = new Map<string, CardSpec>()
  Object.values({ ...rawClassCards, colorless: rawColorless, exclusive: exclusiveStatus }).forEach(
    (l) => l.forEach((c) => baseOf.set(c.id, c.spec())),
  )
  return Object.entries({ ...classCards, colorless, exclusive }).flatMap(([dir, list]) =>
    list.map((c) => ({ dir, spec: c.spec(), base: baseOf.get(c.id)! })),
  )
}
