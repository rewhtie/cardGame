import { Card } from '../card'

/** 参天古树 · 白卡；新增卡牌在末尾追加 */
export const ancientTreeWhite: Card[] = [
  Card.white('parasitize', '寄生')
    .icon('🌱')
    .cost(1)
    .targetEnemy()
    .asSkill()
    .applyStatus('parasite', 6, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('parasite', 8, 'target')),
  Card.white('nourish', '营养')
    .icon('🍃')
    .cost(0)
    .targetEnemy()
    .asSkill()
    .applyStatus('nutrient', 1, 'target')
    .reward(),
  Card.white('gnaw', '蚕食')
    .icon('🪱')
    .cost(1)
    .targetEnemy()
    .devourParasite(4, 3)
    .reward()
    .upgrade((u) => u.devourParasite(4, 4)),
  Card.white('flourish', '繁茂')
    .icon('🌿')
    .cost(1)
    .targetSelf()
    .block(6)
    .drawIfParasite(10, 1)
    .reward()
    .upgrade((u) => u.block(9).drawIfParasite(10, 1)),
  Card.white('sow', '播种')
    .icon('🌰')
    .cost(0)
    .targetEnemy()
    .asSkill()
    .applyStatus('parasite', 4, 'target')
    .reward()
    .upgrade((u) => u.applyStatus('parasite', 6, 'target')),
]
