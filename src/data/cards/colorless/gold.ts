import { Card } from '../card'

/** 通用无色 · 金卡 */
export const colorlessGold: Card[] = [
  Card.gold('reboot', '重启')
    .icon('🔁')
    .cost(2)
    .targetSelf()
    .reshuffle()
    .draw(2)
    .exhaust()
    .reward()
    .upgrade((u) => u.reshuffle().draw(3)),
  Card.gold('destiny', '天命')
    .icon('🎴')
    .cost(1)
    .targetSelf()
    .playTop()
    .exhaust()
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.gold('bounty', '重金悬赏')
    .icon('💰')
    .cost(1)
    .targetEnemy()
    .damage(10)
    .goldIfKill(25)
    .exhaust()
    .reward()
    .upgrade((u) => u.damage(14).goldIfKill(35)),
]
