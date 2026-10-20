import { classRewardIds, starterDeck } from './cards'

export interface CharacterDef {
  id: string
  name: string
  /** 形象（emoji 占位，后期换美术） */
  icon: string
  desc: string
  deck: string[]
  /** 战斗奖励的卡池 */
  rewardCards: string[]
  /** 初始遗物 */
  relics: string[]
  /** 专属遗物：只会出现在该职业的遗物奖励里 */
  exclusiveRelics?: string[]
  maxHp?: number
}

export const characters: CharacterDef[] = [
  {
    id: 'warrior',
    name: '战士',
    icon: '⚔️',
    desc: '均衡的冒险者。',
    deck: starterDeck,
    rewardCards: classRewardIds.warrior!,
    relics: [],
  },
  {
    id: 'plagueDoctor',
    name: '鸦嘴医生',
    icon: '🐦‍⬛',
    desc: '戴着长喙面具的游医，以治疗与回复为生，每一次包扎都会留下伤痕。',
    deck: [...Array<string>(4).fill('strike'), ...Array<string>(4).fill('defend'), 'bandage', 'recover'],
    rewardCards: classRewardIds.doctor!,
    relics: ['bandaging'],
    exclusiveRelics: ['toxinSac', 'scalpel', 'caseFile', 'boneUrn', 'ravenMask', 'herbalSachet', 'vaccine', 'petriDish', 'plagueBell', 'surgicalKit', 'medicineChest', 'sickbedAmulet'],
  },
]

export const characterById = (id?: string) => characters.find((c) => c.id === id) ?? characters[0]!

/** 职业遗物（初始 + 专属）：不进通用奖励池，也不在调试开局时发放 */
export const CHARACTER_RELIC_IDS = characters.flatMap((c) => [...c.relics, ...(c.exclusiveRelics ?? [])])
