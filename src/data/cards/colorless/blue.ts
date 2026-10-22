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
  Card.blue('tooth', '痛苦分担')
    .icon('🦷')
    .cost(2)
    .targetSelf()
    .applyStatus('tit4tat', 1)
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
  Card.blue('swapHand', '换手')
    .icon('🔄')
    .cost(1)
    .targetSelf()
    .redraw(0)
    .reward()
    .upgrade((u) => u.redraw(1)),
]
