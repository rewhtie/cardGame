export type Effect =
  /** perX：数值 × 本次打出时的 X（花掉的全部能量 + 附魔加成） */
  /** woundBonus：三个牌堆（手牌 / 抽牌堆 / 弃牌堆）里每有一张伤口，伤害 +woundBonus */
  | { type: 'damage'; amount: number; perX?: boolean; woundBonus?: number }
  | { type: 'block'; amount: number; perX?: boolean }
  | { type: 'draw'; count: number }
  | { type: 'gainEnergy'; amount: number }
  | { type: 'applyStatus'; status: string; stacks: number; to: 'self' | 'target' | 'allEnemies' }
  | { type: 'heal'; amount: number }
  /** 玩家失去生命：无视格挡 */
  | { type: 'loseHp'; amount: number }
  /** 把 count 张伤口置入弃牌堆 */
  | { type: 'addWound'; count: number }
  /** 消耗手牌 / 弃牌堆中所有伤口，每张按 gain 结算 per 点收益 */
  | {
      type: 'exhaustWounds'
      from: 'hand' | 'discard'
      gain: 'block' | 'gash' | 'gashAll' | 'draw'
      per: number
    }

/** 稀有度：白卡 < 蓝卡 < 金卡；诅咒牌、状态牌只能由事件获得 */
export type Rarity = 'white' | 'blue' | 'gold' | 'curse' | 'status'

export interface CardDef {
  id: string
  rarity: Rarity
  /** 插图（emoji 占位，缺省时按攻击/技能显示默认图标） */
  icon?: string
  name: string
  /** 'X' 表示消耗全部剩余能量 */
  cost: number | 'X'
  target: 'enemy' | 'self'
  /** 攻击/技能打出后进弃牌堆；能力牌打出后不进任何牌堆 */
  kind: 'attack' | 'skill' | 'power'
  /** 打出后进消耗牌堆（能力牌无效） */
  exhaust?: boolean
  /** 无法打出（状态牌 / 诅咒牌） */
  unplayable?: boolean
  /** 回合结束时若在手牌中，玩家失去这么多生命 */
  endTurnLoseHp?: number
  effects: Effect[]
  /** 卡面文字；X 牌用 {x} 占位，显示时由 cardText 展开 */
  text: string
  /** 手写的升级版：火堆锻造时覆盖到原卡上；缺省则按通用规则自动加数值 */
  upgraded?: Partial<Pick<CardDef, 'cost' | 'target' | 'kind' | 'exhaust' | 'effects' | 'text'>>
  /** 已被附魔（卡面显示宝石标识，不改名字） */
  enchanted?: boolean
  /** X 牌被附魔后累积的 X 加成 */
  xBonus?: number
}

export type Intent =
  | { type: 'attack'; damage: number; addCards?: { cardId: string; count: number } }
  | { type: 'defend'; block: number }
  /** 给玩家上状态 */
  | { type: 'debuff'; status: string; stacks: number }
  /** 给自己上状态 */
  | { type: 'buff'; status: string; stacks: number }
  /** 往玩家弃牌堆塞牌 */
  | { type: 'addCards'; cardId: string; count: number }
  /** 什么都不做（蓄力） */
  | { type: 'idle' }
  /** 召唤一只敌人，追加到敌人列表末尾；同时存活已满时落空 */
  | { type: 'summon'; enemy: EnemyDef }
  /** 偷走玩家金币，存在这只敌人身上；它死亡时归还 */
  | { type: 'steal'; amount: number }
  /** 逃离战斗 */
  | { type: 'flee' }

export interface EnemyDef {
  id: string
  name: string
  /** 模型图标（emoji 占位） */
  icon?: string
  maxHp: number
  intents: Intent[]
  /** 开战时自带的状态（被动机制） */
  startStatuses?: Record<string, number>
  /** 生命降到一半以下时分裂出的敌人，按顺序追加（需要配合 split 状态） */
  splitInto?: EnemyDef[]
}

export type Phase = 'player' | 'enemy' | 'won' | 'lost'

export interface PlayerState {
  hp: number
  maxHp: number
  block: number
  energy: number
  maxEnergy: number
  statuses: Record<string, number>
}

export interface EnemyState {
  def: EnemyDef
  hp: number
  block: number
  intentIndex: number
  statuses: Record<string, number>
  /** 偷走的玩家金币；死亡时归还 */
  stolenGold?: number
  /** 已逃离战斗 */
  fled?: boolean
}

export interface BattleState {
  turn: number
  phase: Phase
  player: PlayerState
  /** 敌人列表；死亡的敌人保留在原位（hp <= 0），以保证下标稳定 */
  enemies: EnemyState[]
  /** 卡牌定义表，引擎不直接依赖 data 目录 */
  cards: Readonly<Record<string, CardDef>>
  drawPile: string[]
  hand: string[]
  discardPile: string[]
  exhaustPile: string[]
  handSize: number
  /** 本场战斗生效的遗物 id */
  relics: string[]
  /** 遗物的计数 / 标记，按遗物 id 存放（如钢笔尖的攻击牌计数）；跨战斗保留 */
  relicState: Record<string, number>
  rngState: number
  /** 玩家金币（战斗开始时带入，结束时回写） */
  gold: number
  /** 战斗以敌人全部离场（含逃跑）收尾，没有奖励 */
  escaped?: boolean
}

export type Action =
  /** target：目标敌人下标；单体攻击牌缺省时打第一只存活的敌人 */
  | { type: 'playCard'; handIndex: number; target?: number }
  | { type: 'endTurn' }
  /** 使用药水：投掷类需要 target（敌人下标），缺省时打第一只存活的敌人 */
  | { type: 'usePotion'; potionId: string; target?: number }
  /** 作弊：直接对所有敌人造成指定伤害 */
  | { type: 'cheatDamage'; amount: number }
  | { type: 'cheatDraw'; count: number }
  | { type: 'cheatEnergy'; amount: number }

export type Side = 'player' | 'enemy'

export type GameEvent =
  | { type: 'cardPlayed'; cardId: string; handIndex: number }
  | { type: 'potionUsed'; potionId: string; enemyIndex?: number }
  | { type: 'damageDealt'; target: Side; amount: number; blocked: number; enemyIndex?: number }
  | { type: 'blockGained'; target: Side; amount: number; enemyIndex?: number }
  | { type: 'cardDrawn'; cardId: string }
  | { type: 'reshuffled' }
  | { type: 'energyGained'; amount: number }
  | { type: 'handDiscarded'; count: number }
  | { type: 'perfectBlock' }
  | { type: 'statusApplied'; target: Side; status: string; stacks: number; enemyIndex?: number }
  | { type: 'statusRemoved'; target: Side; status: string; enemyIndex?: number }
  | { type: 'healed'; target: Side; amount: number; enemyIndex?: number }
  /** 战斗外玩家失去生命（事件代价 / 结果）：播放与回血对应的全屏受伤特效；战斗内扣血走 damageDealt */
  | { type: 'hpLost'; amount: number }
  | { type: 'statusTriggered'; target: Side; status: string; enemyIndex?: number }
  /** 手牌里的牌在回合结束时生效（灼伤等）：先演这个，再演随后的扣血 */
  | { type: 'cardTriggered'; cardId: string }
  | { type: 'cardEnchantGrew'; cardId: string }
  /** 获得遗物；heal 为获得时回复 / 增加的生命；cards 为被遗物改动的牌（from -> to），用于播放升级 / 附魔动画 */
  | { type: 'relicGained'; id: string; cards?: { from: string; to: string }[]; heal?: number }
  /** 火堆锻造：升级了的牌，播放与遗物升级相同的摇晃换牌动画 */
  | { type: 'cardsUpgraded'; cards: { from: string; to: string }[] }
  | { type: 'turnStarted'; turn: number }
  | { type: 'enemyActed'; intent: Intent; enemyIndex: number }
  /** 往玩家弃牌堆置入牌（蜂巢等） */
  | { type: 'cardAdded'; cardId: string; count: number }
  | { type: 'enemySpawned'; enemyIndex: number }
  | { type: 'enemySplit'; enemyIndex: number; spawned: number[] }
  | { type: 'goldStolen'; amount: number; enemyIndex: number }
  | { type: 'goldReturned'; amount: number }
  | { type: 'enemyFled'; enemyIndex: number }
  | { type: 'battleEnded'; result: 'won' | 'lost' }
  | { type: 'invalidAction'; reason: string }

export interface DispatchResult {
  state: BattleState
  events: GameEvent[]
  /** 回合结束时：敌人行动完、新回合尚未开始（还没抽牌）的中间状态，供界面先演出敌人行动 */
  pre?: BattleState
}

export interface BattleConfig {
  seed: number
  deck: string[]
  /** 本场战斗的敌人；单个敌人可用 enemy 简写 */
  enemies?: EnemyDef[]
  enemy?: EnemyDef
  cards: Record<string, CardDef>
  playerMaxHp?: number
  /** 当前血量，缺省为满血；用于跨战斗继承 */
  playerHp?: number
  maxEnergy?: number
  handSize?: number
  /** 持有的遗物 id */
  relics?: string[]
  /** 带入战斗的玩家金币 */
  playerGold?: number
  /** 遗物的跨战斗计数，战斗结束后由整局回写 */
  relicState?: Record<string, number>
}
