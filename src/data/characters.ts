import { classAllIds, classRewardIds, colorlessAllIds, colorlessRewardIds, starterDeck } from './cards'

export interface CharacterDef {
  id: string
  name: string
  /** 形象（emoji 占位，后期换美术） */
  icon: string
  desc: string
  deck: string[]
  /** 图鉴用：该职业的全部卡牌（含初始卡） */
  allCards: string[]
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
    allCards: [...new Set([...starterDeck, ...classAllIds.warrior!, ...colorlessAllIds])],
    rewardCards: [...classRewardIds.warrior!, ...colorlessRewardIds],
    relics: ['legendVest'],
    exclusiveRelics: ['valiantHood'],
  },
  {
    id: 'plagueDoctor',
    name: '鸦嘴医生',
    icon: '🐦',
    desc: '戴着长喙面具的游医，以治疗与回复为生，每一次包扎都会留下伤痕。',
    deck: [...Array<string>(4).fill('strike'), ...Array<string>(4).fill('defend'), 'bandage', 'recover'],
    allCards: [...new Set(['strike', 'defend', ...classAllIds.doctor!, ...colorlessAllIds])],
    rewardCards: [...classRewardIds.doctor!, ...colorlessRewardIds],
    relics: ['bandaging'],
    exclusiveRelics: ['abandonBadge', 'toxinSac', 'scalpel', 'caseFile', 'boneUrn', 'ravenMask', 'herbalSachet', 'vaccine', 'petriDish', 'plagueBell', 'surgicalKit', 'medicineChest', 'sickbedAmulet', 'shroud'],
  },
  {
    id: 'swordSaint',
    name: '剑圣',
    icon: '🗡️',
    desc: '一回合连出数张攻击牌，积蓄剑意。',
    deck: [...Array<string>(4).fill('swordStrike0'), ...Array<string>(4).fill('defend')],
    allCards: [...new Set(['defend', ...classAllIds.swordSaint!, ...colorlessAllIds])],
    rewardCards: [...classRewardIds.swordSaint!, ...colorlessRewardIds],
    relics: ['swordHeart'],
    exclusiveRelics: ['braveBadge', 'bloodBlade', 'frostBlade', 'thunderBlade', 'flameBlade', 'venomBlade2', 'scabbard', 'bladeTomb', 'nothingBetween', 'metamorphosis', 'kingdomSeal'],
  },
  {
    id: 'ancientTree',
    name: '参天古树',
    icon: '🌳',
    desc: '低伤害的狗流：用寄生种子养出回复与随从，靠中毒、反伤和吸血苟住。',
    deck: [...Array<string>(4).fill('strike'), ...Array<string>(4).fill('defend')],
    allCards: [...new Set(['strike', 'defend', ...classAllIds.ancientTree!, ...colorlessAllIds])],
    rewardCards: [...classRewardIds.ancientTree!, ...colorlessRewardIds],
    relics: ['parasiteSeed'],
  },
]

export const characterById = (id?: string) => characters.find((c) => c.id === id) ?? characters[0]!

/** 职业遗物（初始 + 专属）：不进通用奖励池，也不在调试开局时发放 */
export const CHARACTER_RELIC_IDS = characters.flatMap((c) => [...c.relics, ...(c.exclusiveRelics ?? [])])
