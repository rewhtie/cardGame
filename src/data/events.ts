import { isUpgraded } from '@/engine/enchant'
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

/** 16 个随机事件：每个类别 2 个；战斗类、诅咒类权重较低 */
export const events: EventDef[] = [
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
      { label: '供奉 50 金：获得一件遗物', cost: { gold: 50 }, outcomes: [{ type: 'relic' }] },
      {
        label: '献血：失去 15 点生命，获得一件遗物',
        cost: { hp: 15 },
        outcomes: [{ type: 'relic' }],
      },
      leave(),
    ],
  },
  {
    id: 'rustyChest',
    title: '破旧宝箱',
    icon: '🧰',
    text: '箱子的锁已经锈断，但里面有东西在动。',
    options: [
      {
        label: '打开：50% 获得一件遗物；50% 获得【伤口】并失去 8 点生命',
        outcomes: [
          {
            type: 'chance',
            p: 0.5,
            win: [{ type: 'relic' }],
            lose: [{ type: 'addCard', id: 'wound' }, { type: 'hp', amount: -8 }],
          },
        ],
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
        label: '救助：失去 10 点生命，获得 1 瓶药水和 60 金',
        cost: { hp: 10 },
        outcomes: [{ type: 'potion', count: 1 }, { type: 'gold', amount: 60 }],
      },
      {
        label: '搜刮：获得 120 金；40% 引来强盗，进入一场战斗',
        outcomes: [
          { type: 'gold', amount: 120 },
          {
            type: 'chance',
            p: 0.4,
            win: [{ type: 'battle', kind: 'monster' }],
            lose: [],
          },
        ],
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
        label: '抄下符文：获得【狂乱】，获得一张【灼伤】',
        outcomes: [{ type: 'addCard', id: 'frenzy' }, { type: 'addCard', id: 'burn' }],
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
    ],
  },
]
