export interface SlotDef {
  key: string
  label: string
  group: string
}

const g = (group: string, items: [string, string][]): SlotDef[] =>
  items.map(([key, label]) => ({ key, label, group }))

/** 音效槽位清单：新增动作时在这里登记一行，编辑面板自动多出一项 */
export const SFX_SLOTS: SlotDef[] = [
  ...g('战斗·出牌', [
    ['battle.cardPlayed.attack', '出攻击牌'],
    ['battle.cardPlayed.skill', '出技能牌'],
    ['battle.cardPlayed.power', '出能力牌'],
  ]),
  ...g('战斗·牌堆', [
    ['battle.cardDrawn', '抽牌'],
    ['battle.reshuffled', '洗牌'],
    ['battle.handDiscarded', '弃手牌'],
    ['battle.energyGained', '获得能量'],
    ['battle.turnStarted', '回合开始'],
  ]),
  ...g('战斗·伤害', [
    ['battle.damage.enemy', '敌人受伤'],
    ['battle.damage.player', '玩家受伤'],
    ['battle.damage.poison', '毒伤'],
    ['battle.damage.trigger', '触发类伤害'],
    ['battle.damage.blocked', '伤害被护盾挡住'],
    ['battle.perfectBlock', '完美格挡'],
  ]),
  ...g('战斗·护盾回血', [
    ['battle.block.player', '玩家获得护盾'],
    ['battle.block.enemy', '敌人获得护盾'],
    ['battle.heal.player', '玩家回血'],
    ['battle.heal.enemy', '敌人回血'],
  ]),
  ...g('战斗·状态', [
    ['battle.status.buff', '增益上身'],
    ['battle.status.debuff', '减益上身'],
    ['battle.status.removed', '状态移除'],
    ['battle.status.triggered', '状态触发'],
    ['battle.cardTriggered', '手牌触发'],
    ['battle.enchantGrew', '附魔成长'],
  ]),
  ...g('战斗·塞牌', [
    ['battle.cardAdded.bad', '塞入诅咒 / 状态牌'],
    ['battle.cardAdded.normal', '塞入普通牌'],
  ]),
  ...g('战斗·药水', [['battle.potion', '使用药水']]),
  ...g('战斗·敌人', [
    ['battle.enemy.attack', '敌人攻击'],
    ['battle.enemy.act', '敌人其他行动'],
    ['battle.enemy.spawn', '敌人登场'],
    ['battle.enemy.split', '史莱姆分裂'],
    ['battle.enemy.flee', '敌人逃跑'],
  ]),
  ...g('战斗·金币', [
    ['battle.gold.stolen', '金币被偷'],
    ['battle.gold.returned', '金币还回'],
  ]),
  ...g('战斗·结束', [
    ['battle.end.won', '战斗胜利'],
    ['battle.end.lost', '战斗失败'],
  ]),
  ...g('战斗外', [
    ['run.gold.gain', '金币增加'],
    ['run.gold.spend', '金币减少'],
    ['run.shop.poor', '商店买不起'],
    ['run.forge.upgrade', '锻造 / 升级敲击'],
    ['run.enchant', '附魔镶嵌'],
    ['run.evolve', '卡牌成长（蓄力裂开 + 爆发）'],
    ['run.train', '卡牌训练（成长未满，裂痕加深）'],
    ['run.relic.gained', '获得遗物'],
    ['run.hpLost', '战斗外失血'],
  ]),
]

export const SLOT_KEYS: Set<string> = new Set(SFX_SLOTS.map((s) => s.key))
