import { Card } from '../card'

/** 剑圣 · 金卡；新增卡牌在末尾追加 */
export const swordSaintGold: Card[] = [
  Card.gold('nothingSlash', '无想一剑')
    .icon('⚡')
    .cost(2)
    .damagePerStack(12, 'swordIntent', 8)
    .exhaust()
    .reward()
    .upgrade((u) =>
      u.damagePerStack(16, 'swordIntent', 8).text('造成 16 点伤害，消耗全部剑意，每层额外 +8\n消耗'),
    ),
  Card.gold('swordSea', '万剑归宗')
    .icon('🌌')
    .cost(3)
    .power()
    .applyStatus('swordMaster', 1)
    .reward()
    .upgrade((u) => u.cost(2)),
  Card.gold('lastStandPower', '背水一战')
    .icon('🩹')
    .cost(1)
    .power()
    .applyStatus('lastStand', 1)
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.gold('frostWorld', '冰封')
    .icon('🧊')
    .cost(1)
    .targetSelf()
    .exhaust()
    .applyStatus('frost', 5, 'allEnemies')
    .reward()
    .upgrade((u) => u.applyStatus('frost', 10, 'allEnemies')),
  Card.gold('thunderGodPower', '雷剑')
    .icon('🌩️')
    .cost(2)
    .power()
    .applyStatus('thunderGod', 1)
    .reward()
    .upgrade((u) => u.cost(1)),
  Card.gold('burnSky', '焚天')
    .icon('☄️')
    .cost(2)
    .targetEnemy()
    .exhaust()
    .damagePerTargetStatus(0, 'burn', 3)
    .reward()
    .upgrade((u) => u.damagePerTargetStatus(0, 'burn', 6)),
  Card.gold('bladeMasterPower', '剑阵')
    .icon('🏯')
    .cost(3)
    .power()
    .applyStatus('bladeMaster', 1)
    .reward()
    .upgrade((u) => u.cost(2)),
  Card.gold('flash', '一闪')
    .icon('🌠')
    .cost(1)
    .damagePerAttackPlayed(3, 4)
    .exhaust()
    .reward()
    .upgrade((u) => u.damagePerAttackPlayed(3, 6)),
]
