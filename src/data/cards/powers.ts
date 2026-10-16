import { Card } from './card'

/** 能力牌（打出后持续整场战斗）；新增能力牌在末尾追加 */
export const powerCards: Card[] = [
  Card.gold('inflame', '燃烧')
    .icon('🔥')
    .cost(1)
    .power()
    .applyStatus('strength', 2)
    .reward()
    .upgrade((u) => u.applyStatus('strength', 3)),
  // 升级：降费
  Card.gold('footwork', '灵巧步法')
    .icon('🦶')
    .cost(1)
    .power()
    .applyStatus('dexterity', 2)
    .reward()
    .upgrade((u) => u.cost(0)),
  Card.gold('ironBody', '钢铁之躯')
    .icon('🦾')
    .cost(1)
    .power()
    .applyStatus('metallicize', 3)
    .reward()
    .upgrade((u) => u.applyStatus('metallicize', 5)),
  Card.gold('thornArmor', '荆棘护甲')
    .icon('🌵')
    .cost(1)
    .power()
    .applyStatus('thorns', 3)
    .reward()
    .upgrade((u) => u.applyStatus('thorns', 5)),
  // ---- 追加 ----
  Card.white('spikeShell', '尖刺外壳')
    .icon('🦔')
    .cost(1)
    .power()
    .applyStatus('thorns', 2)
    .reward()
    .upgrade((u) => u.applyStatus('thorns', 3)),
  Card.white('agility', '敏捷训练')
    .icon('🤸')
    .cost(1)
    .power()
    .applyStatus('dexterity', 1)
    .reward()
    .upgrade((u) => u.applyStatus('dexterity', 2)),
  Card.blue('vitality', '活力')
    .icon('🌱')
    .cost(1)
    .power()
    .applyStatus('regen', 4)
    .reward()
    .upgrade((u) => u.applyStatus('regen', 6)),
  Card.gold('warFury', '战意')
    .icon('😤')
    .cost(2)
    .power()
    .applyStatus('strength', 4)
    .reward()
    .upgrade((u) => u.applyStatus('strength', 6)),
  // ---- 第二批 ----
  Card.white('ironSkin', '铁皮')
    .icon('🪖')
    .cost(1)
    .power()
    .applyStatus('metallicize', 2)
    .reward()
    .upgrade((u) => u.applyStatus('metallicize', 3)),
  Card.blue('hardShell', '硬壳')
    .icon('🐢')
    .cost(2)
    .power()
    .applyStatus('thorns', 4)
    .reward()
    .upgrade((u) => u.applyStatus('thorns', 6)),
  Card.gold('titan', '泰坦')
    .icon('🗿')
    .cost(3)
    .power()
    .applyStatus('strength', 3)
    .applyStatus('dexterity', 3)
    .reward()
    .upgrade((u) => u.cost(2)),
]
