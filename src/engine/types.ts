export type Effect =
  /** 把目标尸体转成随从：目标的寄生层数须不低于其当前生命的一半；召唤 / 分裂的敌人不行 */
  | { type: 'convertCorpse' }
  /** 消耗目标敌人的寄生层数（不足时这张牌打不出去；不触发寄生回血） */
  | { type: 'consumeParasite'; amount: number }
  /** 消耗目标全部寄生层数，造成等量伤害（不触发寄生回血） */
  | { type: 'parasiteBurst' }
  | { type: 'devourParasite'; max: number; per: number }
  /** 全场寄生层数合计 ≥ min 时抽 count 张牌 */
  | { type: 'drawIfParasite'; min: number; count: number }
  /** 给目标 status，层数 = max(1, floor(目标寄生层数 / divisor))；目标没有寄生则无事发生，不消耗寄生 */
  | { type: 'parasiteStatus'; status: string; divisor: number }
  /** 把其他存活敌人的寄生层数提升到与目标相同（只升不降） */
  | { type: 'spreadParasite' }
  | { type: 'purgeSelfBuff' }
  /** 目标失去 amount 点力量，到敌人回合结束时恢复（记在 restore:strength） */
  | { type: 'sapStrength'; amount: number }
  /** 熔化：移除目标敌人的全部格挡 */
  | { type: 'meltBlock' }
  /** 获得等同于本张牌刚造成的伤害（含被格挡吸收的部分）的格挡 */
  | { type: 'blockFromDamage' }
  /** 透支：立刻失去 amount 点力量，直到下个回合结束前（下回合结束时恢复） */
  | { type: 'overdraft'; amount: number }
  /** 往指定牌堆置入任意牌（状态牌、诅咒牌等）；抽牌堆为随机位置 */
  | { type: 'addCard'; cardId: string; count: number; to: 'discard' | 'draw' | 'hand' }
  /** 代价：能量 / 抽牌 = 下个回合开始时减少；力量 / 敏捷 = 立刻失去，下个回合结束时恢复 */
  | { type: 'penalty'; stat: 'energy' | 'draw' | 'strength' | 'dexterity'; amount: number }
  /** 偷取目标敌人的最大生命值给自己（本场战斗有效，敌人最低留 1） */
  | { type: 'stealMaxHp'; amount: number }
  /** perX：数值 × 本次打出时的 X（花掉的全部能量 + 附魔加成） */
  /** woundBonus：三个牌堆（手牌 / 抽牌堆 / 弃牌堆）里每有一张伤口，伤害 +woundBonus */
  /** perStack：伤害基数 += 玩家身上该状态的层数 × per，结算完后清零该状态 */
  | {
      type: 'damage'
      amount: number
      perX?: boolean
      /** 段数：同一数值连续打 hits 次（每段单独结算力量 / 易伤 / 格挡等），缺省 1 */
      hits?: number
      woundBonus?: number
      perStack?: { status: string; per: number }
      /** 玩家生命不高于一半时，基数改用 lowHp.amount */
      lowHp?: { amount: number }
      /** 基数 += 目标敌人身上该状态的层数 × per；after 决定结算后该状态怎么处理：keep 保留 / clear 清除 / double 层数翻倍（缺省） */
      perTargetStatus?: { status: string; per: number; after?: 'keep' | 'clear' | 'double' }
      /** 目标敌人有格挡时，基数 += bonus */
      ifTargetBlock?: { bonus: number }
      /** 基数 += 本回合已打出的攻击牌数（含这张）× per */
      perAttackPlayed?: { per: number }
      /** 基数改为场上（玩家 + 存活敌人）所有增益的层数总和；总和为 0 时用 amount 兜底 */
      buffTotal?: boolean
      /** 基数改为玩家当前最大生命值的 pct%（四舍五入），amount 忽略 */
      maxHpPct?: number
    }
  /** 本回合已打出的攻击牌数（含这张）≥ min 时，抽 count 张牌 */
  | { type: 'drawIfAttacks'; min: number; count: number }
  /** 把目标敌人身上某状态的层数乘以 factor；没有该状态则无事发生 */
  | { type: 'multiplyStatus'; status: string; factor: number }
  | { type: 'block'; amount: number; perX?: boolean }
  | { type: 'draw'; count: number }
  | { type: 'gainEnergy'; amount: number }
  /** temp：仅对自身有效，层数在玩家回合结束时失去 */
  | { type: 'applyStatus'; status: string; stacks: number; to: 'self' | 'target' | 'allEnemies'; temp?: boolean }
  | { type: 'heal'; amount: number }
  /** 玩家失去生命：无视格挡 */
  | { type: 'loseHp'; amount: number }
  /** 把 count 张伤口置入弃牌堆 */
  | { type: 'addWound'; count: number }
  /** 消耗手牌 / 弃牌堆中所有伤口，每张按 gain 结算 per 点收益 */
  | {
      type: 'exhaustWounds'
      from: 'hand' | 'discard'
      gain: 'block' | 'gash' | 'gashAll' | 'draw' | 'damage' | 'damageAll'
      per: number
    }
  /** 三个牌堆（手牌 / 抽牌堆 / 弃牌堆）里每有一张伤口，给予 per 层状态 */
  | { type: 'woundStatus'; status: string; per: number; to: 'self' | 'target' | 'allEnemies' }
  /** 把 count 张非伤口牌放进手牌：from 为弃牌堆时取最近进入的，为抽牌堆时取最上面的（不洗牌，伤口留在原处） */
  | { type: 'fetch'; from: 'discard' | 'draw'; count: number }
  /** 打出时选手牌里的一张状态牌消耗（playCard 必须带 pick）；本身不结算，由 playCard 处理 */
  | { type: 'exhaustStatusCard' }
  /** 打出后让玩家做一次选择（净化 / 复制 / 预知 / 发现）；count 为消耗张数 / 查看张数 / 候选张数 */
  | { type: 'choose'; mode: 'exhaust' | 'copy' | 'scry' | 'discover' | 'retrieve'; count: number }
  /**
   * 从 from 指定的牌堆里消耗符合 kind 的牌（进消耗牌堆）；count 缺省 = 全部。
   * kind：wound 伤口 / status 状态牌（含伤口）/ curse 诅咒牌 / other 其余的牌 / any 任意牌。
   * 先后顺序：手牌从左、抽牌堆从顶、弃牌堆从最近进入的；from 为 all 时依次为手牌、抽牌堆、弃牌堆。
   */
  | { type: 'exhaustCards'; from: 'hand' | 'draw' | 'discard' | 'all'; kind: 'wound' | 'status' | 'curse' | 'other' | 'any'; count?: number
      /** 每消耗一张牌就结算一遍这些效果（如每张造成 6 点伤害、抽 1 张牌、回 1 点能量） */
      perCard?: Effect[]
    }
  /** 弃掉全部手牌，再抽同样数量（+extra）的牌 */
  | { type: 'redraw'; extra: number }
  /** 把弃牌堆洗进抽牌堆 */
  | { type: 'reshuffle' }
  /** 目标敌人的意图是攻击时，获得等同其单段伤害的格挡 */
  | { type: 'blockByIntent' }
  /** 前面的伤害击杀了目标，则获得金币 */
  | { type: 'goldIfKill'; gold: number }
  /** 获得一瓶随机药水（战斗外由整局结算进药水栏） */
  | { type: 'gainPotion' }
  /** 无视费用，打出抽牌堆顶的一张牌；由 playCard 处理 */
  | { type: 'playTop' }

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
  /** allEnemies：不需要选目标，以目标为对象的效果对每只存活敌人各结算一次 */
  target: 'enemy' | 'self' | 'allEnemies'
  /** 攻击/技能打出后进弃牌堆；能力牌打出后不进任何牌堆 */
  kind: 'attack' | 'skill' | 'power'
  /** 打出后进消耗牌堆（能力牌无效） */
  exhaust?: boolean
  /** 保留：回合结束时留在手牌里 */
  retain?: boolean
  /** 每在手中停留（保留）一回合，伤害 +n；蓄势用，按战斗实例各自累积 */
  retainGrow?: number
  /** 全场存活敌人的寄生层数合计达到该值时，这张牌免费打出 */
  freeIfParasiteTotal?: number
  /** 无法打出（状态牌 / 诅咒牌） */
  unplayable?: boolean
  /** 回合结束时若在手牌中，玩家失去这么多生命 */
  endTurnLoseHp?: number
  effects: Effect[]
  /** 卡面文字；X 牌用 {x} 占位，显示时由 cardText 展开 */
  text: string
  /** 手写的升级版：火堆锻造时覆盖到原卡上；缺省则按通用规则自动加数值 */
  upgraded?: Partial<Pick<CardDef, 'cost' | 'target' | 'kind' | 'exhaust' | 'retain' | 'retainGrow' | 'effects' | 'text'>>
  /** 增量：每打出一次，卡面数值 +grow（战斗实例各自累积） */
  grow?: number
  /** 固有：每场战斗第一回合必定抽上手，不改费用 */
  innate?: boolean
  /** 牌组里记的附魔名（enchants.ts 的键）；只用于界面呈现，引擎不读 */
  enchant?: string
  /** X 牌被附魔后累积的 X 加成 */
  xBonus?: number
  /** 进化：这张牌累计打出 plays 次后（战斗胜利时结算）变成 into；只由卡牌自己声明 */
  evolve?: { plays: number; into: string }
}

/** 一个回合里的单个动作 */
export type IntentAction =
  /** hits：多段攻击，每段独立结算伤害（缺省 1 段） */
  | { type: 'attack'; damage: number; hits?: number; grow?: number; addCards?: { cardId: string; count: number } }
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

/** 敌人一回合的意图：主动作决定图标与预览，also 里的动作在主动作之后依次执行 */
export type Intent = IntentAction & { also?: IntentAction[] }

export interface EnemyDef {
  id: string
  name: string
  /** 模型图标（emoji 占位） */
  icon?: string
  maxHp: number
  /** 威胁值：普通战斗按楼层预算组怪时用，意图和数值不随楼层变，难度只靠"出哪些怪、出几只"；缺省不会被抽到 */
  threat?: number
  intents: Intent[]
  /** 意图走到末尾后回到第几个（缺省 0，整体循环） */
  loopFrom?: number
  /** 开战时自带的状态（被动机制） */
  startStatuses?: Record<string, number>
  /** 生命降到一半以下时分裂出的敌人，按顺序追加（需要配合 split 状态） */
  splitInto?: EnemyDef[]
}

/** 固定遭遇：楼层在 [minFloor, maxFloor] 内的普通战斗有一定概率直接出这一组 */
export interface EncounterDef {
  id: string
  name: string
  enemies: EnemyDef[]
  minFloor: number
  maxFloor: number
}

/** 等待玩家做出的选择；期间只能 resolve */
export type Pending =
  | { kind: 'exhaust'; count: number }
  | { kind: 'copy' }
  /** cards 为抽牌堆顶部的牌（自顶向下） */
  | { kind: 'scry'; cards: string[] }
  | { kind: 'discover'; options: string[] }
  /** 从弃牌堆挑 count 张放回手牌；cards 为候选牌 id，slots 为它们在弃牌堆里的位置 */
  | { kind: 'retrieve'; count: number; cards: string[]; slots: number[] }
  /** 遗弃徽章：可选 0~1 张刚弃掉的牌放回手牌 */
  | { kind: 'recover'; cards: string[] }

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
  /** 已行动次数：意图下标与递增攻击的累计伤害都由它推出 */
  turns?: number
  /** 召唤 / 分裂产生的敌人，以及分裂掉的本体：死后不留尸体（界面不再显示） */
  vanishOnDeath?: boolean
  /** 被偷取后的最大生命值；缺省取 def.maxHp */
  maxHpOverride?: number
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
  /** 本场战斗各牌实例的进化累计次数（键为实例 id，含牌组原有进度） */
  evolveCounts?: Record<string, number>
  /** 本回合已打出的攻击牌数（剑心用；每回合开始清零，不跨战斗） */
  turnAttacks?: number
  /** 本回合已打出的技能牌数（剑鞘用；每回合开始清零） */
  turnSkills?: number
  /** 本回合是否已经触发过「弃牌」类遗物（遗弃徽章） */
  turnDiscarded?: boolean
  /** 效果结算中刚被主动弃掉的牌，由 battle 在结算完后统一交给遗物钩子 */
  discarded?: string[]
  /** 斩杀标记：出牌开始时清零，玩家出牌造成的伤害把敌人打死时置 true（蜕变等"斩杀"效果读取） */
  cardKill?: boolean
  /** 最近一次攻击效果造成的伤害总和（含被格挡部分），供「按造成伤害获得格挡」使用 */
  lastDamage?: number
  /** 友方随从：占据一具敌人尸体（enemyIndex）；血量 <= 0 即消失（保留在数组里以保证下标稳定） */
  minions?: { hp: number; enemyIndex: number }[]
  /** 本回合已指挥过的随从下标 */
  commanded?: number[]
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
  /** 待玩家完成的选择 */
  pending?: Pending
  /** 发现可抽取的候选牌 id（通常是角色的奖励卡池） */
  discoverPool?: string[]
  /** 本回合被「发现」置零费用的牌实例，回合结束时恢复 */
  discovered?: string[]
  /** 战斗中生成的牌实例计数 */
  spawned?: number
  /** 本场战斗获得、尚未放进药水栏的药水 */
  newPotions?: string[]
  /** 战斗以敌人全部离场（含逃跑）收尾，没有奖励 */
  escaped?: boolean
}

export type Action =
  /** target：目标敌人下标；单体攻击牌缺省时打第一只存活的敌人 */
  | { type: 'playCard'; handIndex: number; target?: number; pick?: number }
  | { type: 'endTurn' }
  /** 完成待选：picks 为手牌 / 抽牌堆顶 / 候选的下标 */
  | { type: 'resolve'; picks: number[] }
  /** 使用药水：投掷类需要 target（敌人下标），缺省时打第一只存活的敌人 */
  | { type: 'usePotion'; potionId: string; target?: number }
  /** 作弊：直接对所有敌人造成指定伤害 */
  /** 指挥牌：让一只随从格挡 / 攻击 / 奉献 */
  | { type: 'command'; minion: number; choice: 'block' | 'attack' | 'devote' }
  | { type: 'cheatDamage'; amount: number }
  | { type: 'cheatDraw'; count: number }
  | { type: 'cheatEnergy'; amount: number }
  /** 作弊：给玩家（enemyIndex 忽略）或指定敌人加状态层；负数为扣层，扣光即移除 */
  | { type: 'cheatStatus'; side: Side; enemyIndex: number; status: string; stacks: number }

export type Side = 'player' | 'enemy'

export type GameEvent =
  | { type: 'cardsEvolved'; cards: { from: string; to: string }[] }
  | { type: 'cardPlayed'; cardId: string; handIndex: number }
  | { type: 'potionGained'; potionId: string }
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
  /** 战斗外玩家最大生命值增长（火堆扎根等）：播放全屏特效，不回血 */
  | { type: 'maxHpGained'; amount: number }
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
  | { type: 'maxHpStolen'; amount: number; enemyIndex: number }
  | { type: 'minionRaised'; enemyIndex: number }
  | { type: 'minionDied'; minion: number }
  | { type: 'commanded'; minion: number; choice: 'block' | 'attack' | 'devote' }
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
  /** 发现的候选牌 */
  discoverPool?: string[]
  /** 带入战斗的玩家金币 */
  playerGold?: number
  /** 遗物的跨战斗计数，战斗结束后由整局回写 */
  relicState?: Record<string, number>
}
