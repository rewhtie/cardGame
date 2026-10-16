import { Card } from './card'

/** 攻击牌（目标为单个敌人）；新增攻击牌在末尾追加，注册顺序影响种子下的奖励顺序 */
export const attackCards: Card[] = [
  Card.white('strike', '打击')
    .icon('⚔️')
    .cost(1)
    .damage(6)
    .starter(5)
    .upgrade((u) => u.damage(9)),
  Card.blue('heavyBlow', '重击')
    .icon('🔨')
    .cost(2)
    .damage(14)
    .reward()
    .upgrade((u) => u.damage(18)),
  Card.blue('quickStrike', '快速打击')
    .icon('🗡️')
    .cost(0)
    .damage(4)
    .reward()
    .upgrade((u) => u.damage(7)),
  Card.white('counter', '反击')
    .icon('🤺')
    .cost(1)
    .damage(5)
    .block(5)
    .reward()
    .upgrade((u) => u.damage(8).block(8)),
  Card.white('spinStrike', '旋身打击')
    .icon('🌪️')
    .cost('X')
    .damage(6, true)
    .reward()
    .upgrade((u) => u.damage(8, true)),
  Card.blue('bash', '痛击')
    .icon('🔨')
    .cost(2)
    .damage(8)
    .applyStatus('vulnerable', 2, 'target')
    .reward()
    .upgrade((u) => u.damage(10).applyStatus('vulnerable', 3, 'target')),
  Card.blue('venom', '毒针')
    .icon('🪡')
    .cost(1)
    .applyStatus('poison', 4, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('poison', 6, 'target')),
  // ---- 追加：白卡 ----
  Card.white('pommelStrike', '剑柄打击')
    .icon('🗡️')
    .cost(1)
    .damage(8)
    .draw(1)
    .reward()
    .upgrade((u) => u.damage(10).draw(2)),
  Card.white('crippleStrike', '致残打击')
    .icon('🦵')
    .cost(1)
    .damage(6)
    .applyStatus('weak', 1, 'target')
    .reward()
    .upgrade((u) => u.damage(8).applyStatus('weak', 2, 'target')),
  Card.white('poisonStab', '毒刃')
    .icon('🔪')
    .cost(1)
    .damage(5)
    .applyStatus('poison', 3, 'target')
    .reward()
    .upgrade((u) => u.damage(7).applyStatus('poison', 4, 'target')),
  Card.white('bulwarkStrike', '盾击')
    .icon('🛡️')
    .cost(1)
    .damage(7)
    .block(3)
    .reward()
    .upgrade((u) => u.damage(9).block(5)),
  // ---- 追加：蓝卡 ----
  Card.blue('clothesline', '闷棍')
    .icon('🏏')
    .cost(2)
    .damage(12)
    .applyStatus('weak', 2, 'target')
    .reward()
    .upgrade((u) => u.damage(14).applyStatus('weak', 3, 'target')),
  Card.blue('expose', '破绽')
    .icon('🎯')
    .cost(0)
    .applyStatus('vulnerable', 2, 'target')
    .exhaust()
    .reward()
    .upgrade((u) => u.applyStatus('vulnerable', 3, 'target')),
  Card.blue('hammerBlow', '重锤')
    .icon('⚒️')
    .cost(3)
    .damage(26)
    .reward()
    .upgrade((u) => u.damage(34)),
  Card.blue('viperFang', '蛇牙')
    .icon('🐍')
    .cost(1)
    .damage(4)
    .applyStatus('poison', 5, 'target')
    .reward()
    .upgrade((u) => u.damage(6).applyStatus('poison', 7, 'target')),
  // ---- 追加：金卡 ----
  Card.gold('execute', '斩杀')
    .icon('🪓')
    .cost(2)
    .damage(25)
    .exhaust()
    .reward()
    .upgrade((u) => u.damage(32)),
  Card.gold('infernoSlash', '烈焰斩')
    .icon('☄️')
    .cost(2)
    .damage(16)
    .applyStatus('vulnerable', 2, 'target')
    .reward()
    .upgrade((u) => u.damage(20).applyStatus('vulnerable', 3, 'target')),
  // ---- 第二批 ----
  Card.white('sweepKick', '扫腿')
    .icon('🦶')
    .cost(1)
    .damage(4)
    .applyStatus('vulnerable', 1, 'target')
    .reward()
    .upgrade((u) => u.damage(6).applyStatus('vulnerable', 2, 'target')),
  Card.white('ironFist', '铁拳')
    .icon('👊')
    .cost(1)
    .damage(9)
    .reward()
    .upgrade((u) => u.damage(12)),
  Card.white('parry', '招架')
    .icon('🤺')
    .cost(1)
    .damage(4)
    .block(7)
    .reward()
    .upgrade((u) => u.damage(6).block(10)),
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
  Card.blue('plague', '瘟疫')
    .icon('☠️')
    .cost(2)
    .applyStatus('poison', 9, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('poison', 13, 'target')),
  Card.blue('dazeBlow', '眩晕击')
    .icon('💫')
    .cost(1)
    .damage(8)
    .applyStatus('weak', 2, 'target')
    .reward()
    .upgrade((u) => u.damage(10).applyStatus('weak', 3, 'target')),
  Card.blue('bloodlust', '嗜血')
    .icon('🧛')
    .cost(1)
    .damage(9)
    .heal(3)
    .reward()
    .upgrade((u) => u.damage(12).heal(5)),
  Card.gold('annihilate', '湮灭')
    .icon('🌋')
    .cost(3)
    .damage(26)
    .applyStatus('vulnerable', 3, 'target')
    .reward()
    .upgrade((u) => u.damage(32).applyStatus('vulnerable', 4, 'target')),
  Card.gold('deathMark', '死亡标记')
    .icon('💀')
    .cost(2)
    .applyStatus('poison', 12, 'target')
    .applyStatus('vulnerable', 2, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('poison', 16, 'target').applyStatus('vulnerable', 3, 'target')),
]
