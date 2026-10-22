import { Card } from '../card'

/** 通用无色 · 蓝卡 */
export const colorlessBlue: Card[] = [
  Card.blue('discover', '发现')
    .icon('🔍')
    .cost(1)
    .targetSelf()
    .choose('discover')
    .exhaust()
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.blue('duplicate', '复制')
    .icon('📑')
    .cost(1)
    .targetSelf()
    .choose('copy')
    .exhaust()
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.blue('seeThrough', '识破')
    .icon('👁️')
    .cost(2)
    .targetEnemy()
    .asSkill()
    .blockByIntent()
    .reward()
    .upgrade((u) => u.cost(1)),
  Card.blue('tooth', '以牙还牙')
    .icon('🦷')
    .cost(2)
    .targetSelf()
    .applyStatus('tit4tat', 1)
    .text('直到下回合开始时，受到的攻击伤害会等量反弹给攻击者')
    .reward()
    .upgrade((u) => u.cost(1)),
  Card.blue('buildUp', '蓄势')
    .icon('🌀')
    .cost(0)
    .targetEnemy()
    .damage(3)
    .retainGrow(3)
    .text('保留\n造成 3 点伤害，每在手中保留一回合，伤害 +3')
    .reward()
    .upgrade((u) => u.retainGrow(4).damage(3).text('保留\n造成 3 点伤害，每在手中保留一回合，伤害 +4')),
]
