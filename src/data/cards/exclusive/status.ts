import { Card } from '../card'

export const exclusiveStatus = [
  Card.status('eggLiquid', '蛋液').icon('🥚').cost(1).targetSelf().exhaust().mustPlayFirst().text('绝望：手牌中有蛋液时，必须先打出蛋液（多张可任选）。消耗'),
  Card.curse('curseReplicate', '增殖').icon('🧫').cost(0).unplayable().retain().endTurnReplicate().text('无法打出。保留。回合结束时，每张在手牌中的增殖向弃牌堆生成一张增殖'),
]
