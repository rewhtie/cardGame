import { Card } from '../card'

/** 通用无色 · 白卡：所有职业的奖励池 / 商店都可能出现 */
export const colorlessWhite: Card[] = [
  Card.white('reclaim', '回收')
    .icon('♻️')
    .cost(1)
    .targetSelf()
    .choose('retrieve', 1)
    .exhaust()
    .reward()
    .upgrade((u) => u.choose('retrieve', 2)),
  Card.white('cleanse', '净化')
    .icon('🧹')
    .cost(1)
    .targetSelf()
    .retain()
    .exhaust()
    .choose('exhaust', 3)
    .text('保留\n从手牌中选择 3 张消耗\n消耗')
    .reward()
    .upgrade((u) => u.choose('exhaust', 5).retain().text('保留\n从手牌中选择 5 张消耗\n消耗')),
  Card.white('foresight', '预知')
    .icon('🔮')
    .cost(0)
    .targetSelf()
    .choose('scry', 3)
    .reward()
    .upgrade((u) => u.choose('scry', 5)),
  Card.white('swapHand', '换手')
    .icon('🔄')
    .cost(1)
    .targetSelf()
    .redraw(0)
    .reward()
    .upgrade((u) => u.redraw(1)),
  Card.white('alchemy', '炼金')
    .icon('⚗️')
    .cost(1)
    .targetSelf()
    .gainPotion()
    .exhaust()
    .reward()
    .upgrade((u) => u.cost(0)),
]
