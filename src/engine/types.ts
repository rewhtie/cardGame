export type Effect =
  /** perX：数值 × 本次打出时的 X（花掉的全部能量 + 附魔加成） */
  | { type: 'damage'; amount: number; perX?: boolean }
  | { type: 'block'; amount: number; perX?: boolean }
  | { type: 'draw'; count: number }
  | { type: 'gainEnergy'; amount: number }
  | { type: 'applyStatus'; status: string; stacks: number; to: 'self' | 'target' | 'allEnemies' }
  | { type: 'heal'; amount: number }

/** 稀有度：白卡 < 蓝卡 < 金卡 */
export type Rarity = 'white' | 'blue' | 'gold'

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
  | { type: 'attack'; damage: number }
  | { type: 'defend'; block: number }
  /** 给玩家上状态 */
  | { type: 'debuff'; status: string; stacks: number }
  /** 给自己上状态 */
  | { type: 'buff'; status: string; stacks: number }

export interface EnemyDef {
  id: string
  name: string
  maxHp: number
  intents: Intent[]
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
  /** 遗物的计数 / 标记，按遗物 id 存放（如钢笔尖的攻击牌计数） */
  relicState: Record<string, number>
  rngState: number
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
  | { type: 'statusTriggered'; target: Side; status: string; enemyIndex?: number }
  | { type: 'cardEnchantGrew'; cardId: string }
  /** 获得遗物；heal 为获得时回复 / 增加的生命；cards 为被遗物改动的牌（from -> to），用于播放升级 / 附魔动画 */
  | { type: 'relicGained'; id: string; cards?: { from: string; to: string }[]; heal?: number }
  /** 火堆锻造：升级了的牌，播放与遗物升级相同的摇晃换牌动画 */
  | { type: 'cardsUpgraded'; cards: { from: string; to: string }[] }
  | { type: 'turnStarted'; turn: number }
  | { type: 'enemyActed'; intent: Intent; enemyIndex: number }
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
}
