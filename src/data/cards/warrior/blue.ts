import { Card } from '../card'

/** 战士 · 蓝卡；新增卡牌在末尾追加 */
export const warriorBlue: Card[] = [
  Card.blue('quickStrike', '快速打击')
    .icon('🗡️')
    .cost(0)
    .damage(4)
    .reward()
    .upgrade((u) => u.damage(7)),
  Card.blue('expose', '破绽')
    .icon('🎯')
    .cost(0)
    .targetEnemy()
    .exhaust()
    .applyStatus('vulnerable', 2, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('vulnerable', 2, 'allEnemies')),
  Card.blue('hammerBlow', '重锤')
    .icon('⚒️')
    .cost(3)
    .damage(26)
    .reward()
    .upgrade((u) => u.damage(34)),
  Card.blue('rend', '撕裂')
    .icon('🩸')
    .cost(2)
    .damage(10)
    .applyStatus('vulnerable', 1, 'target')
    .applyStatus('weak', 1, 'target')
    .reward()
    .upgrade((u) =>
      u.damage(13).applyStatus('vulnerable', 2, 'target').applyStatus('weak', 2, 'target'),
    ),
  Card.blue('shockwave', '震荡波')
    .icon('💥')
    .cost(2)
    .targetSelf()
    .applyStatus('weak', 3, 'allEnemies')
    .applyStatus('vulnerable', 3, 'allEnemies')
    .exhaust()
    .reward()
    .upgrade((u) =>
      u.applyStatus('weak', 5, 'allEnemies').applyStatus('vulnerable', 5, 'allEnemies'),
    ),
  Card.blue('weakenAll', '削弱')
    .icon('📉')
    .cost(1)
    .targetSelf()
    .block(4)
    .applyStatus('weak', 1, 'allEnemies')
    .reward()
    .upgrade((u) => u.block(7).applyStatus('weak', 2, 'allEnemies')),
  Card.blue('bracing', '稳固')
    .icon('🪨')
    .cost(1)
    .targetSelf()
    .block(10)
    .reward()
    .upgrade((u) => u.block(13)),
  Card.blue('throwSpear', '投掷长矛')
    .icon('🔱')
    .cost(1)
    .targetEnemy()
    .meltBlock()
    .damage(10)
    .text('移除目标所有格挡，造成10点伤害')
    .reward()
    .upgrade((u) => u.meltBlock().damage(14).text('移除目标所有格挡，造成14点伤害')),
  Card.blue('upright', '堂堂正正')
    .icon('🦁')
    .cost(1)
    .targetSelf()
    .purgeSelfBuff()
    .exhaust()
    .reward()
    .upgrade((u) => u.noExhaust()),
  Card.blue('awe', '震慑')
    .icon('😨')
    .cost(2)
    .targetEnemy()
    .asSkill()
    .sapStrength(9)
    .applyStatus('weak', 2, 'target')
    .exhaust()
    .reward()
    .upgrade((u) => u.sapStrength(15).applyStatus('weak', 3, 'target')),
  Card.blue('intuition', '直觉')
    .icon('🔮')
    .cost(1)
    .targetSelf()
    .applyStatus('intuition', 1, 'self')
    .text('打出此牌后，直到回合结束卡牌获得的格挡在下个回合开始获得')
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.blue('bloodBattle', '血战')
    .icon('🩸')
    .cost(1)
    .targetSelf()
    .loseHp(3)
    .gainEnergy(2)
    .reward()
    .upgrade((u) => u.loseHp(3).gainEnergy(3)),
  Card.blue('spikeShell', '刺甲')
    .icon('🦔')
    .cost(1)
    .power()
    .applyStatus('thorns', 2)
    .reward()
    .upgrade((u) => u.applyStatus('thorns', 3)),
  Card.blue('pommelStrike', '速攻')
    .icon('🗡️')
    .cost(1)
    .targetEnemy()
    .damage(8)
    .draw(1)
    .reward()
    .upgrade((u) => u.damage(10).draw(2)),
]
