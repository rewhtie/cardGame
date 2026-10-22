import { Card } from '../card'

/** 剑圣 · 蓝卡；新增卡牌在末尾追加 */
export const swordSaintBlue: Card[] = [
  Card.blue('iaido', '磨剑')
    .icon('🗡️')
    .cost(1)
    .targetSelf()
    .exhaust()
    .applyStatus('swordIntent', 1)
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.blue('twinSlash', '连斩')
    .icon('⚔️')
    .cost(1)
    .targetEnemy()
    .damageHits(5, 2)
    .reward()
    .evolve(20, 'frenzySlash')
    .upgrade((u) => u.damage(8).damage(8)),
  // 进化目标，不进奖励
  Card.blue('frenzySlash', '乱舞')
    .icon('💫')
    .cost(1)
    .damageHits(5, 3)
    .upgrade((u) => u.damageHits(8, 3)),
  Card.blue('stillMind', '止水')
    .icon('🌊')
    .cost(1)
    .targetSelf()
    .block(10)
    .reward()
    .upgrade((u) => u.block(13)),
  Card.blue('desperate', '骁勇')
    .icon('💢')
    .cost(1)
    .targetEnemy()
    .damageLowHp(8, 16)
    .reward()
    .upgrade((u) => u.damageLowHp(11, 22)),
  Card.blue('coldWave', '备战')
    .icon('🌨️')
    .cost(1)
    .targetSelf()
    .applyStatus('frost', 2, 'allEnemies')
    .draw(1)
    .reward()
    .upgrade((u) => u.applyStatus('frost', 3, 'allEnemies').draw(1)),
  Card.blue('chainLightning', '连刺')
    .icon('🌩️')
    .cost(1)
    .targetEnemy()
    .damageHits(5, 2)
    .reward()
    .upgrade((u) => u.damageHits(5, 2).tempStatus('strength', 2)),
  Card.blue('firestorm', '暴走')
    .icon('🌋')
    .cost(1)
    .targetSelf()
    .applyStatus('burn', 4, 'allEnemies')
    .reward()
    .upgrade((u) => u.applyStatus('burn', 8, 'allEnemies')),
  // —— 引擎与衔接 ——
  Card.blue('chain', '连锁')
    .icon('⛓️')
    .cost(1)
    .targetEnemy()
    .damagePerAttackPlayed(6, 3)
    .reward(),
  Card.blue('swordDance', '剑舞')
    .icon('💃')
    .cost(1)
    .targetSelf()
    .applyStatus('swordIntent', 1)
    .draw(1)
    .exhaust()
    .reward()
    .upgrade((u) => u.applyStatus('swordIntent', 1).draw(2)),
  Card.blue('painForShock', '感悟')
    .icon('💔')
    .cost(0)
    .targetSelf()
    .exhaust()
    .loseHp(3)
    .applyStatus('shock', 1)
    .draw(1)
    .reward()
    .upgrade((u) => u.loseHp(2).applyStatus('shock', 1).draw(1)),
  Card.blue('swordStrike', '剑击')
    .icon('🗡️')
    .cost(1)
    .targetEnemy()
    .damage(10)
    .text('造成 10 点伤害，下一张剑击费用变为零')
    .upgrade((u) => u.damage(14).text('造成 14 点伤害，下一张剑击费用变为零')),
]
