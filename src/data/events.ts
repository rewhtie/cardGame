import { canEnchantCard, isUpgraded } from '@/engine/enchant'
import type { EventDef, EventOption } from '@/engine/event'
import type { RunState } from '@/engine/run'

const NOT_UPGRADABLE = '没有可升级的牌'
const NOT_REMOVABLE = '牌组为空'

const hasUpgradable = (run: RunState, n = 1) =>
  run.content.deck.filter((c) => !isUpgraded(c)).length >= n
const needUpgradable =
  (n = 1) =>
  (run: RunState) =>
    hasUpgradable(run, n) ? null : NOT_UPGRADABLE
const needCards = (run: RunState) => (run.content.deck.length > 0 ? null : NOT_REMOVABLE)

const leave = (label = '离开'): EventOption => ({ label, outcomes: [] })

const hasEnchantable = (run: RunState, enchant: string) =>
  run.content.deck.some((id) => canEnchantCard(run.content.cards, id, enchant))

/** 21 个随机事件，共用不放回池；过载、战斗类与诅咒类权重较低 */
export const events: EventDef[] = [
  {
    id: 'lastHeartbeat',
    title: '荣耀捍卫',
    icon: '❤️‍🔥',
    text: '活下去！',
    weight: 0.7,
    requires: (run) => (run.character ?? 'warrior') === 'warrior',
    options: [
      {
        label: '记住这份战意：获得【生命过载】',
        outcomes: [{ type: 'addCard', id: 'lifeOverload' }],
      },
      leave('缝好背心，继续前行'),
    ],
  },
  {
    id: 'forbiddenDiagnosis',
    title: '禁忌秘术',
    icon: '🧠',
    text: '假如...当初拥有这份力量的话。',
    weight: 0.7,
    requires: (run) => run.character === 'plagueDoctor',
    options: [
      {
        label: '带走禁忌病历：获得【感官过载】',
        outcomes: [{ type: 'addCard', id: 'sensoryOverload' }],
      },
      leave('合上病历，离开'),
    ],
  },
  {
    id: 'mindBeyondLimit',
    title: '勇者之名',
    icon: '⚔️',
    text: '剑已出。',
    weight: 0.7,
    requires: (run) => run.character === 'swordSaint',
    options: [
      {
        label: '领悟绝境剑诀：获得【精神过载】',
        outcomes: [{ type: 'addCard', id: 'mentalOverload' }],
      },
      leave('封存剑诀，离开'),
    ],
  },
  {
    id: 'echoMirror',
    title: '回响之镜',
    icon: '🪞',
    text: '镜中的你慢了半拍，随后又重复了一遍同样的动作。镜框上的字迹写着：“让一招留下回响，或让两招永远消失。”',
    enchantment: true,
    weight: 10,
    requires: (run) => hasEnchantable(run, 'replay') || run.content.deck.length >= 2,
    options: [
      {
        label: '留下回响：为一张攻击牌或技能牌附魔【重放】，打出时额外打出一次',
        requires: (run) => hasEnchantable(run, 'replay') ? null : '没有可附魔的攻击牌或技能牌',
        outcomes: [{ type: 'enchantCard', enchant: 'replay' }],
      },
      {
        label: '抹去倒影：自选移除两张牌',
        requires: (run) => run.content.deck.length >= 2 ? null : '需要至少两张牌',
        outcomes: [{ type: 'removeCard' }, { type: 'removeCard' }],
      },
    ],
  },
  {
    id: 'spiritInJade',
    title: '玉中之灵',
    icon: '💠',
    text: '灵玉里传来叩击声：“让我寄居于你的招式，它便不再消逝。或者，把我留在玉里，用消逝的招式供养我。”',
    enchantment: true,
    weight: 10,
    requires: (run) => hasEnchantable(run, 'noExhaust') || !run.relics.includes('spiritJade'),
    options: [
      {
        label: '解开封印：选择一张牌附魔【去除消耗】，获得诅咒牌【附灵】',
        requires: (run) => hasEnchantable(run, 'noExhaust') ? null : '没有可附魔的消耗牌',
        outcomes: [{ type: 'enchantCard', enchant: 'noExhaust' }, { type: 'addCard', id: 'possession' }],
      },
      {
        label: '带走灵玉：获得遗物【灵玉】；每消耗一张牌，对全体敌人造成 1 点伤害',
        requires: (run) => run.relics.includes('spiritJade') ? '已经拥有灵玉' : null,
        outcomes: [{ type: 'relic', id: 'spiritJade' }],
      },
    ],
  },
  {
    id: 'threefoldInscription',
    title: '三相铭刻',
    icon: '💎',
    text: '三道铭文悬在石台上：刃、盾与羽。将一张牌放上石台，只能唤醒其中一道。',
    enchantment: true,
    weight: 20,
    requires: (run) => ['sharp', 'sturdy', 'swift'].some((id) => hasEnchantable(run, id)),
    options: [
      {
        label: '锋利：为一张攻击牌附魔，攻击数值增加 2 点',
        requires: (run) => hasEnchantable(run, 'sharp') ? null : '没有可附魔的攻击牌',
        outcomes: [{ type: 'enchantCard', enchant: 'sharp' }],
      },
      {
        label: '稳固：为一张技能牌附魔，格挡增加 2 点；无格挡则新增获得 2 点格挡',
        requires: (run) => hasEnchantable(run, 'sturdy') ? null : '没有可附魔的技能牌',
        outcomes: [{ type: 'enchantCard', enchant: 'sturdy' }],
      },
      {
        label: '迅捷：为一张能力牌附魔，打出时额外抽 2 张牌',
        requires: (run) => hasEnchantable(run, 'swift') ? null : '没有可附魔的能力牌',
        outcomes: [{ type: 'enchantCard', enchant: 'swift' }],
      },
    ],
  },
  // ---- 删除 ----
  {
    id: 'forgetfulSpring',
    title: '遗忘之泉',
    icon: '🌊',
    text: '泉水清澈得不真实。有人说喝下去，就能忘掉一些不想要的东西。',
    options: [
      {
        label: '饮水：失去 8 点生命，删除一张牌',
        cost: { hp: 8 },
        requires: needCards,
        outcomes: [{ type: 'removeCard' }],
      },
      {
        label: '深饮：失去 16 点生命上限，删除两张牌',
        requires: (run) =>
          run.player.maxHp <= 16 ? '生命上限不足' : run.content.deck.length < 2 ? '需要至少两张牌' : null,
        outcomes: [{ type: 'maxHp', amount: -16 }, { type: 'removeCard' }, { type: 'removeCard' }],
      },
      leave(),
    ],
  },
  {
    id: 'wanderingTailor',
    title: '流浪裁缝',
    icon: '🧵',
    text: '裁缝抖开一块布：“你的行囊太满了，我替你剪掉一点。”',
    options: [
      {
        label: '付 75 金：删除一张牌',
        cost: { gold: 75 },
        requires: needCards,
        outcomes: [{ type: 'removeCard' }],
      },
      {
        label: '免费修补：删除一张牌，并获得一张【伤口】',
        requires: needCards,
        outcomes: [{ type: 'removeCard' }, { type: 'addCard', id: 'wound' }],
      },
      leave(),
    ],
  },
  // ---- 升级 ----
  {
    id: 'oldSmith',
    title: '老铁匠',
    icon: '🔨',
    text: '一间没人看管的铁匠铺，炉子还是热的。',
    requires: (run) => hasUpgradable(run, 2),
    options: [
      {
        label: '亲手锻打：失去 6 点生命，升级一张牌',
        cost: { hp: 6 },
        requires: needUpgradable(),
        outcomes: [{ type: 'upgradeCard' }],
      },
      {
        label: '借用炉火：随机升级 2 张牌，获得一张【灼伤】',
        requires: needUpgradable(2),
        outcomes: [{ type: 'upgradeRandom', count: 2 }, { type: 'addCard', id: 'burn' }],
      },
      leave(),
    ],
  },
  {
    id: 'knifeGrinder',
    title: '磨刀的旅人',
    icon: '🪨',
    text: '旅人蹲在路边磨刀，抬头看你的武器：“给你也磨磨？”',
    requires: (run) => hasUpgradable(run),
    options: [
      {
        label: '付 40 金：升级一张牌',
        cost: { gold: 40 },
        requires: needUpgradable(),
        outcomes: [{ type: 'upgradeCard' }],
      },
      {
        label: '请他随手磨：随机升级 1 张牌，最大生命 -5',
        requires: needUpgradable(),
        outcomes: [{ type: 'upgradeRandom', count: 1 }, { type: 'maxHp', amount: -5 }],
      },
      leave(),
    ],
  },
  // ---- 遗物 ----
  {
    id: 'mysticAltar',
    title: '神秘祭坛',
    icon: '⛩️',
    text: '祭坛上刻着凹槽，像是在等待供奉。',
    options: [
      { label: '供奉 99 金：获得一件遗物', cost: { gold: 99 }, outcomes: [{ type: 'relic' }] },
      {
        label: '献血：失去 15 点生命，获得一件遗物',
        cost: { hp: 15 },
        outcomes: [{ type: 'relic' }],
      },
      leave(),
    ],
  },
  // ---- 诅咒 ----
  {
    id: 'demonPact',
    title: '恶魔的契约',
    icon: '😈',
    text: '“给你力量，”低语说，“只收一点点代价。”',
    weight: 0.7,
    options: [
      {
        label: '签下契约：获得一件遗物，获得两张【伤口】',
        outcomes: [
          { type: 'relic' },
          { type: 'addCard', id: 'wound' },
          { type: 'addCard', id: 'wound' },
        ],
      },
      { label: '拒绝：恢复 10 点生命', outcomes: [{ type: 'hp', amount: 10 }] },
    ],
  },
  {
    id: 'whisperingStatue',
    title: '低语的石像',
    icon: '🗿',
    text: '石像的嘴里吐出金币，眼睛却一直盯着你。',
    weight: 0.7,
    options: [
      {
        label: '拿走金币：获得 200 金，获得一张【灼伤】',
        outcomes: [{ type: 'gold', amount: 200 }, { type: 'addCard', id: 'burn' }],
      },
      { label: '只拿一半：获得 90 金', outcomes: [{ type: 'gold', amount: 90 }] },
      leave(),
    ],
  },
  // ---- 金钱 ----
  {
    id: 'roadsideGambler',
    title: '路边赌徒',
    icon: '🎲',
    text: '“押多少？赢了翻倍，输了归我。”',
    options: [
      {
        label: '押 50 金：50% 得 100 金，50% 输掉押金',
        cost: { gold: 50 },
        outcomes: [{ type: 'chance', p: 0.5, win: [{ type: 'gold', amount: 100 }], lose: [] }],
      },
      {
        label: '押 100 金：45% 得 220 金，55% 输掉押金',
        cost: { gold: 100 },
        outcomes: [{ type: 'chance', p: 0.45, win: [{ type: 'gold', amount: 220 }], lose: [] }],
      },
      leave(),
    ],
  },
  {
    id: 'fallenMerchant',
    title: '倒下的商人',
    icon: '🐪',
    text: '商人倒在路边，货车翻了，他还有一口气。',
    options: [
      {
        label: '救活他：消耗 1 瓶治疗药水，获得 300 金币和一件遗物',
        requires: (run) => run.potions.includes('healPotion') ? null : '需要一瓶治疗药水',
        outcomes: [{ type: 'removePotion', id: 'healPotion' }, { type: 'gold', amount: 300 }, { type: 'relic' }],
      },
      {
        label: '无视并搜刮：获得 1 瓶药水和 50 金币',
        outcomes: [{ type: 'potion', count: 1 }, { type: 'gold', amount: 50 }],
      },
      leave(),
    ],
  },
  // ---- 战斗 ----
  {
    id: 'ambush',
    title: '埋伏',
    icon: '⚔️',
    text: '林子里的动静不对，你已经被围住了。',
    weight: 0.7,
    options: [
      {
        label: '迎战：进入一场战斗，胜利后额外获得 40 金',
        outcomes: [{ type: 'battle', kind: 'monster', bonus: { gold: 40 } }],
      },
      { label: '破财消灾：付 50 金，直接离开', cost: { gold: 50 }, outcomes: [] },
    ],
  },
  {
    id: 'monsterLair',
    title: '怪物巢穴',
    icon: '🕳️',
    text: '洞口散落着骨头，深处闪着光。',
    weight: 0.7,
    options: [
      {
        label: '闯入：进入一场精英战斗，胜利后额外获得一件遗物',
        outcomes: [{ type: 'battle', kind: 'elite', bonus: { relic: true } }],
      },
      leave(),
    ],
  },
  // ---- 诅咒增益卡 ----
  {
    id: 'bloodAltar',
    title: '血色祭坛',
    icon: '🩸',
    text: '祭坛上浮着一张卡牌，边缘还在滴血。',
    options: [
      { label: '取走：获得【血之契约】', outcomes: [{ type: 'addCard', id: 'bloodPact' }] },
      leave(),
    ],
  },
  {
    id: 'frenzyRune',
    title: '狂乱符文',
    icon: '🌀',
    text: '墙上的符文在移动，看久了头会疼。',
    options: [
      {
        label: '抄下符文：获得【狂乱】',
        outcomes: [{ type: 'addCard', id: 'frenzy' }],
      },
      leave(),
    ],
  },
  // ---- 药水 ----
  {
    id: 'potionVendor',
    title: '游方药剂师',
    icon: '⚗️',
    text: '药剂师摊开一排瓶子：“随便拿一瓶，当交个朋友。”',
    options: [
      { label: '随机拿一瓶：获得 1 瓶药水', outcomes: [{ type: 'potion', count: 1 }] },
      {
        label: '付 40 金：获得 2 瓶药水',
        cost: { gold: 40 },
        outcomes: [{ type: 'potion', count: 2 }],
      },
      leave(),
    ],
  },
  {
    id: 'poisonSwamp',
    title: '毒雾沼泽',
    icon: '☣️',
    text: '沼泽边长着发光的草药，空气让你喉咙发紧。',
    options: [
      {
        label: '深入采集：失去 10 点生命，获得 2 瓶药水',
        cost: { hp: 10 },
        outcomes: [{ type: 'potion', count: 2 }],
      },
      { label: '在外围采集：获得 1 瓶药水', outcomes: [{ type: 'potion', count: 1 }] },
      {
        label: '服下发光草药：失去 10 点生命上限，恢复全部生命',
        requires: (run) => run.player.maxHp > 10 ? null : '生命上限不足',
        outcomes: [{ type: 'maxHp', amount: -10 }, { type: 'healFull' }],
      },
    ],
  },
]
