import { Card } from '../card'

/** 参天古树 · 金卡；新增卡牌在末尾追加 */
export const ancientTreeGold: Card[] = [
  Card.gold('ripen', '催熟')
    .icon('🍎')
    .cost(2)
    .targetEnemy()
    .parasiteBurst()
    .reward()
    .upgrade((u) => u.cost(1).parasiteBurst()),
  Card.gold('ancientBody', '古树之躯')
    .icon('🌳')
    .cost(2)
    .power()
    .applyStatus('ancientBody', 1)
    .reward()
    .upgrade((u) => u.cost(1).applyStatus('ancientBody', 1)),
  Card.gold('rootGrow', '生根')
    .icon('🪴')
    .cost(1)
    .power()
    .applyStatus('rootGrow', 1)
    .reward()
    .upgrade((u) => u.applyStatus('rootGrow', 2)),
  Card.gold('rotRebirth', '腐化重生')
    .icon('🌿')
    .cost(2)
    .targetEnemy()
    .asSkill()
    .convertCorpse()
    .exhaust()
    .reward()
    .upgrade((u) => u.cost(1).convertCorpse().exhaust()),
  Card.gold('towering', '参天一击')
    .icon('🌲')
    .cost(2)
    .targetEnemy()
    .damageMaxHpPercent(50)
    .exhaust()
    .reward()
    .upgrade((u) => u.damageMaxHpPercent(65).exhaust()),
]
