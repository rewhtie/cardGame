import { Card } from './card'

/** 状态牌、诅咒牌与带代价的强牌：不进奖励池和初始牌组，只能从事件获得 */
export const curseCards: Card[] = [
  Card.status('wound', '伤口').icon('🩹').cost(0).unplayable().text('无法打出'),
  Card.status('stun', '晕眩').icon('💫').cost(0).unplayable().ethereal().text('无法打出。虚无（回合结束时若在手牌中，消耗）'),
  Card.status('slimed', '粘液').icon('🟢').cost(1).exhaust().text('消耗'),
  Card.curse('possession', '附灵')
    .icon('👻')
    .cost(0)
    .unplayable()
    .text('无法打出。此牌在手中时，每打出一张牌，对自己造成 1 点伤害'),
  Card.curse('burn', '灼伤')
    .icon('🔥')
    .cost(0)
    .unplayable()
    .endTurnLoseHp(2)
    .text('无法打出。回合结束时若在手牌中，失去 2 点生命'),
  Card.gold('bloodPact', '血之契约')
    .icon('🩸')
    .cost(0)
    .targetEnemy()
    .loseHp(4)
    .damage(18)
    .upgrade((u) => u.loseHp(4).damage(24)),
  Card.gold('frenzy', '狂乱')
    .icon('🌀')
    .cost(0)
    .targetSelf()
    .exhaust()
    .loseHp(5)
    .gainEnergy(2)
    .draw(2)
    .upgrade((u) => u.loseHp(5).gainEnergy(2).draw(3)),
]
