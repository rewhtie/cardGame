export interface ItemDef {
  id: string
  name: string
  icon: string
  text: string
}

export const potions: Record<string, ItemDef> = {
  healPotion: { id: 'healPotion', name: '治疗药水', icon: '🧪', text: '恢复 20 点生命' },
  firePotion: { id: 'firePotion', name: '火焰药水', icon: '🔥', text: '对敌人造成 20 点伤害' },
  guardPotion: { id: 'guardPotion', name: '护盾药水', icon: '🛡️', text: '获得 12 点格挡' },
}

export const relics: Record<string, ItemDef> = {
  burningBlood: {
    id: 'burningBlood',
    name: '燃烧之血',
    icon: '🩸',
    text: '战斗结束时恢复 6 点生命',
  },
  ancientCoin: { id: 'ancientCoin', name: '古老硬币', icon: '🪙', text: '获得 50 金币' },
  goldPouch: { id: 'goldPouch', name: '金钱袋', icon: '👝', text: '获得 150 金币' },
  trainingGuide: {
    id: 'trainingGuide',
    name: '训练指南',
    icon: '📖',
    text: '附魔一张牌：每场战斗中每打出一次，卡面数值 +1',
  },
  roundShield: {
    id: 'roundShield',
    name: '圆盾',
    icon: '🛡️',
    text: '完美格挡（格挡完全吸收攻击）时，给予攻击的敌人 1 层易伤',
  },
  energyCrystal: {
    id: 'energyCrystal',
    name: '能量水晶',
    icon: '💎',
    text: '每回合额外获得 1 点能量',
  },
  bronzeScale: { id: 'bronzeScale', name: '青铜鳞片', icon: '🐉', text: '战斗开始时获得 3 层荆棘' },
  vajra: { id: 'vajra', name: '金刚杵', icon: '🔱', text: '战斗开始时获得 1 点力量' },
  anchor: { id: 'anchor', name: '锚', icon: '⚓', text: '每场战斗第一回合获得 10 点格挡' },
  lantern: { id: 'lantern', name: '灯笼', icon: '🏮', text: '每场战斗第一回合额外获得 1 点能量' },
  orichalcum: {
    id: 'orichalcum',
    name: '奥利哈钢',
    icon: '🔶',
    text: '回合结束时若没有格挡，获得 6 点格挡',
  },
  preparedBag: {
    id: 'preparedBag',
    name: '准备背包',
    icon: '🎒',
    text: '每场战斗第一回合额外抽 2 张牌',
  },
  smoothStone: { id: 'smoothStone', name: '光滑石', icon: '🪨', text: '战斗开始时获得 1 点敏捷' },
  meatOnBone: {
    id: 'meatOnBone',
    name: '骨头肉',
    icon: '🍖',
    text: '战斗结束时若生命不高于一半，恢复 12 点生命',
  },
  bloodVial: { id: 'bloodVial', name: '血瓶', icon: '🧴', text: '每场战斗开始时恢复 2 点生命' },
  penNib: {
    id: 'penNib',
    name: '钢笔尖',
    icon: '🖋️',
    text: '每打出 10 张攻击牌，下一张攻击牌伤害翻倍',
  },
  happyFlower: { id: 'happyFlower', name: '开心花', icon: '🌼', text: '每 3 个回合获得 1 点能量' },
  strawberry: { id: 'strawberry', name: '草莓', icon: '🍓', text: '最大生命 +7' },
  potionBelt: { id: 'potionBelt', name: '药水腰带', icon: '🎗️', text: '药水栏位 +2' },
  whetstone: { id: 'whetstone', name: '磨刀石', icon: '🔧', text: '获得时升级牌组中的 2 张攻击牌' },
}
