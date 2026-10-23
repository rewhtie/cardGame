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
  // 连击示例：打出后下一张攻击牌免费；打出的若也是这类牌，就一张接一张连下去
  Card.blue('chainStrike', '连环斩')
    .icon('⚡')
    .cost(1)
    .targetEnemy()
    .damage(5)
    .applyStatus('freeAttack', 1)
    .reward()
    .upgrade((u) => u.damage(7).applyStatus('freeAttack', 1)),
  Card.blue('calmFlow', '行云流水')
    .icon('✨')
    .cost(0)
    .targetSelf()
    .applyStatus('freeSkill', 1)
    .draw(1)
    .reward()
    .upgrade((u) => u.draw(2).applyStatus('freeSkill', 1)),
  // 能力牌示例：每回合第一张攻击牌免费
  Card.blue('assault', '突击')
    .icon('🏹')
    .cost(1)
    .power()
    .applyStatus('freeAttackEachTurn', 1)
    .reward()
    .upgrade((u) => u.cost(0)),
]
