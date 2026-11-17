import { Card } from '../card'

/** 剑圣 · 白卡；新增卡牌在末尾追加 */
export const swordSaintWhite: Card[] = [
  // 剑圣版打击：独立 id（战士的 strike 不进化），名字仍叫「打击」
  Card.white('swordStrike0', '打击')
    .icon('⚔️')
    .cost(1)
    .damage(6)
    .starter(4)
    .evolve(10, 'swordStrike')
    .upgrade((u) => u.damage(9)),
  // 进化目标，不进奖励；数字只写伤害（附魔成长会把所有数字 +1）
  Card.white('glint', '掠影')
    .icon('✨')
    .cost(0)
    .damage(4)
    .reward()
    .upgrade((u) => u.damage(7)),
  Card.white('stance', '架势')
    .icon('🧘')
    .cost(1)
    .targetSelf()
    .block(6)
    .draw(1)
    .reward()
    .upgrade((u) => u.block(9).draw(1)),
  Card.white('mikiri', '见切')
    .icon('🌀')
    .cost(0)
    .targetSelf()
    .block(3)
    .reward()
    .upgrade((u) => u.block(6)),
  // —— 属性剑：物理 / 冰 / 雷 / 炎 / 毒 ——
  Card.white('slash', '割伤')
    .icon('🩸')
    .cost(1)
    .loseHp(2)
    .damage(12)
    .reward()
    .upgrade((u) => u.loseHp(2).damage(17)),
  Card.white('frostSlash', '霜斩')
    .icon('❄️')
    .cost(1)
    .targetEnemy()
    .damage(6)
    .applyStatus('frost', 2, 'target')
    .reward()
    .upgrade((u) => u.damage(8).applyStatus('frost', 3, 'target')),
  Card.white('thunderClap', '雷剑')
    .icon('blade-thunder')
    .cost(1)
    .targetEnemy()
    .damage(4)
    .applyStatus('shock', 1)
    .reward()
    .upgrade((u) => u.damage(6).applyStatus('shock', 2)),
  Card.white('flameTongue', '炎剑')
    .icon('blade-flame')
    .cost(1)
    .targetEnemy()
    .damage(4)
    .applyStatus('burn', 4, 'target')
    .reward()
    .upgrade((u) => u.damage(6).applyStatus('burn', 6, 'target')),
  // —— 引擎与衔接 ——
  Card.white('cutWater', '断水')
    .icon('💧')
    .cost(1)
    .damageIfTargetBlock(7, 4)
    .reward()
    .upgrade((u) => u.damageIfTargetBlock(10, 6)),
  Card.white('sweepingSlash', '横斩')
    .icon('🗡️')
    .cost(1)
    .targetAllEnemies()
    .damage(5)
    .reward()
    .upgrade((u) => u.damage(8)),
  Card.white('frostGale', '霜风')
    .icon('🌬️')
    .cost(1)
    .targetAllEnemies()
    .damage(4)
    .applyStatus('frost', 1, 'target')
    .reward()
    .upgrade((u) => u.damage(6).applyStatus('frost', 2, 'target')),
  Card.white('flameRing', '火环')
    .icon('🔥')
    .cost(1)
    .targetAllEnemies()
    .damage(3)
    .applyStatus('burn', 3, 'target')
    .reward()
    .upgrade((u) => u.damage(4).applyStatus('burn', 5, 'target')),
]
