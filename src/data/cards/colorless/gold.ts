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
  Card.gold('bounty', '悬赏')
    .icon('💰')
    .cost(1)
    .targetEnemy()
    .exhaust()
    .damage(10)
    .goldIfKill(25)
    .reward()
    .upgrade((u) => u.damage(14).goldIfKill(35)),
  Card.gold('alchemy', '炼金')
    .icon('⚗️')
    .cost(1)
    .targetSelf()
    .exhaust()
    .gainPotion()
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.gold('duplicate', '复制')
    .icon('📑')
    .cost(1)
    .targetSelf()
    .exhaust()
    .choose('copy', 1)
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.gold('seeThrough', '识破')
    .icon('👁️')
    .cost(2)
    .targetEnemy()
    .asSkill()
    .blockByIntent()
    .reward()
    .upgrade((u) => u.cost(1)),
]
