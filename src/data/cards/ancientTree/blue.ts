import { Card } from '../card'

/** 参天古树 · 蓝卡；新增卡牌在末尾追加 */
export const ancientTreeBlue: Card[] = [
  Card.blue('siphon', '汲取')
    .icon('🩸')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .consumeParasite(8)
    .stealMaxHp(3)
    .reward()
    .upgrade((u) => u.consumeParasite(8).stealMaxHp(5)),
  Card.blue('thornVine', '荆棘藤')
    .icon('🌵')
    .cost(2)
    .targetSelf()
    .exhaust()
    .applyStatus('thorns', 1)
    .reward()
    .freeIfParasiteTotal(12)
    .upgrade((u) => u.applyStatus('thorns', 3)),
  Card.blue('envenom', '毒化')
    .icon('☠️')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .exhaust()
    .parasiteStatus('poison', 1)
    .reward()
    .upgrade((u) => u.cost(0).parasiteStatus('poison', 1)),
  Card.blue('wither', '衰朽')
    .icon('🥀')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .parasiteStatus('weak', 2)
    .parasiteStatus('vulnerable', 2)
    .reward()
    .upgrade((u) => u.parasiteStatus('weak', 1).parasiteStatus('vulnerable', 1)),
  Card.blue('overgrowth', '蔓延')
    .icon('🍄')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .applyStatus('parasite', 3, 'allEnemies')
    .reward()
    .upgrade((u) => u.applyStatus('parasite', 5, 'allEnemies')),
  Card.blue('propagate', '传播')
    .icon('🧬')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .spreadParasite()
    .reward()
    .upgrade((u) => u.cost(0).spreadParasite()),
  Card.blue('vitality', '活力')
    .icon('🌱')
    .cost(1)
    .power()
    .applyStatus('regen', 4)
    .reward()
    .upgrade((u) => u.applyStatus('regen', 6)),
]
