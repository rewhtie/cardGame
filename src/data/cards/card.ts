import { statusById } from '@/engine/statuses'
import type { CardDef, Effect, Rarity } from '@/engine/types'
import type { CardSpec, EditableRarity, UpgradeSpec } from './cardSpec'

/** 单个效果对应的卡面文字；perX 的数值显示为 N×{x} */
export function effectText(e: Effect): string {
  const amount = (n: number, perX?: boolean) => (perX ? `${n}×{x}` : String(n))
  switch (e.type) {
    case 'damage':
      return e.woundBonus
        ? `造成 ${e.amount} 点伤害，牌堆中每有一张伤口，伤害 +${e.woundBonus}`
        : `造成 ${amount(e.amount, e.perX)} 点伤害`
    case 'block':
      return `获得 ${amount(e.amount, e.perX)} 点格挡`
    case 'draw':
      return `抽 ${e.count} 张牌`
    case 'gainEnergy':
      return `获得 ${e.amount} 点能量`
    case 'applyStatus': {
      const name = statusById[e.status]?.name ?? e.status
      if (e.to === 'self') return `获得 ${e.stacks} 层${name}`
      if (e.to === 'target') return `给予 ${e.stacks} 层${name}`
      return `给予所有敌人 ${e.stacks} 层${name}`
    }
    case 'heal':
      return `恢复 ${e.amount} 点生命`
    case 'loseHp':
      return `失去 ${e.amount} 点生命`
    case 'addWound':
      return `将 ${e.count} 张伤口置入弃牌堆`
    case 'exhaustWounds': {
      const from = e.from === 'hand' ? '手牌' : '弃牌堆'
      const gain = {
        block: `获得 ${e.per} 点格挡`,
        gash: `给予 ${e.per} 层裂伤`,
        gashAll: `给予所有敌人 ${e.per} 层裂伤`,
        draw: `抽 ${e.per} 张牌`,
      }[e.gain]
      return `消耗${from}中所有伤口，每张${gain}`
    }
  }
}

/**
 * 卡牌构建器：只在定义阶段使用，build() 产出引擎用的普通 CardDef。
 * 引擎状态里仍是纯对象（会被展开、克隆、序列化），所以类不进入运行时。
 * 卡面文字默认由 effects 自动生成，避免数值与文字不一致；特殊文案用 text() 覆盖。
 */
export class Card {
  private _icon?: string
  private _cost: number | 'X' = 1
  private _target: 'enemy' | 'self' = 'enemy'
  private _effects: Effect[] = []
  private _text?: string
  private _power = false
  private _exhaust = false
  private _unplayable = false
  private _endTurnLoseHp = 0
  private _reward = false
  private _starter = 0
  private _upgrade?: (u: Card) => Card

  private constructor(
    readonly id: string,
    readonly name: string,
    readonly rarity: Rarity,
  ) {}

  /** 从可编辑数据还原构建器（开发面板预览、写回代码用） */
  static fromSpec(spec: CardSpec): Card {
    const c = new Card(spec.id, spec.name, spec.rarity)
    if (spec.icon) c.icon(spec.icon)
    c.cost(spec.cost)
    if (spec.target === 'power') c.power()
    else if (spec.target === 'self') c.targetSelf()
    else c.targetEnemy()
    if (spec.exhaust) c.exhaust()
    if (spec.unplayable) c.unplayable()
    if (spec.endTurnLoseHp > 0) c.endTurnLoseHp(spec.endTurnLoseHp)
    spec.effects.forEach((e) => c.effect(e))
    if (spec.text) c.text(spec.text)
    if (spec.reward) c.reward()
    if (spec.starter > 0) c.starter(spec.starter)
    const up = spec.upgrade
    if (up) {
      c.upgrade((u) => {
        if (up.cost !== undefined) u.cost(up.cost)
        if (up.exhaust === true) u.exhaust()
        else if (up.exhaust === false) u.noExhaust()
        up.effects?.forEach((e) => u.effect(e))
        if (up.text) u.text(up.text)
        return u
      })
    }
    return c
  }

  /** 导出可编辑数据（诅咒牌不可编辑，不应调用） */
  spec(): CardSpec {
    const upgrade = this.upgradeSpec()
    return {
      id: this.id,
      name: this.name,
      rarity: this.rarity as EditableRarity,
      ...(this._icon && { icon: this._icon }),
      cost: this._cost,
      target: this._power ? 'power' : this._target,
      exhaust: this._exhaust,
      unplayable: this._unplayable,
      endTurnLoseHp: this._endTurnLoseHp,
      reward: this._reward,
      starter: this._starter,
      ...(this._text && { text: this._text }),
      effects: this._effects,
      ...(upgrade && { upgrade }),
    }
  }

  private upgradeSpec(): UpgradeSpec | undefined {
    if (!this._upgrade) return undefined
    const u = new Card(this.id, this.name, this.rarity)
    u._cost = this._cost
    u._target = this._target
    u._power = this._power
    u._exhaust = this._exhaust
    const r = this._upgrade(u)
    return {
      ...(r._cost !== this._cost && { cost: r._cost }),
      ...(r._exhaust !== this._exhaust && { exhaust: r._exhaust }),
      ...(r._effects.length > 0 && { effects: r._effects }),
      ...(r._text && { text: r._text }),
    }
  }

  static white(id: string, name: string) {
    return new Card(id, name, 'white')
  }
  static blue(id: string, name: string) {
    return new Card(id, name, 'blue')
  }
  static gold(id: string, name: string) {
    return new Card(id, name, 'gold')
  }
  /** 诅咒牌：自身目标的技能牌，不进奖励池 */
  static curse(id: string, name: string) {
    return new Card(id, name, 'curse').targetSelf()
  }

  /** 状态牌：自身目标，由事件 / 敌人塞进牌组的负面牌，不进奖励池 */
  static status(id: string, name: string) {
    return new Card(id, name, 'status').targetSelf()
  }

  /** 无法打出 */
  unplayable() {
    this._unplayable = true
    return this
  }
  /** 回合结束时若在手牌中，失去 n 点生命 */
  endTurnLoseHp(n: number) {
    this._endTurnLoseHp = n
    return this
  }
  loseHp(amount: number) {
    return this.effect({ type: 'loseHp', amount })
  }

  icon(icon: string) {
    this._icon = icon
    return this
  }
  cost(cost: number | 'X') {
    this._cost = cost
    return this
  }
  /** 单体攻击牌需要选择敌人 */
  targetEnemy() {
    this._target = 'enemy'
    return this
  }
  targetSelf() {
    this._target = 'self'
    return this
  }

  /** 能力牌：打出后不进任何牌堆，必须是自身目标 */
  power() {
    this._power = true
    this._target = 'self'
    return this
  }
  /** 打出后进消耗牌堆 */
  exhaust() {
    this._exhaust = true
    return this
  }

  damage(amount: number, perX = false) {
    return this.effect({ type: 'damage', amount, ...(perX && { perX }) })
  }
  block(amount: number, perX = false) {
    return this.effect({ type: 'block', amount, ...(perX && { perX }) })
  }
  draw(count: number) {
    return this.effect({ type: 'draw', count })
  }
  gainEnergy(amount: number) {
    return this.effect({ type: 'gainEnergy', amount })
  }
  applyStatus(status: string, stacks: number, to: 'self' | 'target' | 'allEnemies' = 'self') {
    return this.effect({ type: 'applyStatus', status, stacks, to })
  }
  /** 伤害随三个牌堆里的伤口数增长 */
  damageByWounds(amount: number, perWound: number) {
    return this.effect({ type: 'damage', amount, woundBonus: perWound })
  }
  addWound(count: number) {
    return this.effect({ type: 'addWound', count })
  }
  exhaustWounds(from: 'hand' | 'discard', gain: 'block' | 'gash' | 'gashAll' | 'draw', per: number) {
    return this.effect({ type: 'exhaustWounds', from, gain, per })
  }
  heal(amount: number) {
    return this.effect({ type: 'heal', amount })
  }
  effect(e: Effect) {
    this._effects.push(e)
    return this
  }

  /** 覆盖自动生成的卡面文字 */
  text(text: string) {
    this._text = text
    return this
  }
  /** 加入战斗奖励池 */
  reward() {
    this._reward = true
    return this
  }
  /** 初始牌组中的张数 */
  starter(count: number) {
    this._starter = count
    return this
  }

  /** 取消消耗（升级时去掉"消耗"用） */
  noExhaust() {
    this._exhaust = false
    return this
  }
  /**
   * 手写升级版。回调拿到一个从原卡复制出的构建器（费用、目标、消耗沿用），
   * 可改费用、去掉消耗；只要调用了任何效果方法，就整体替换原效果，没调用则沿用原效果。
   * 卡面文字重新自动生成（除非回调里 text() 覆盖）。
   */
  upgrade(fn: (u: Card) => Card) {
    this._upgrade = fn
    return this
  }

  /** 供 CardPool 读取的池属性 */
  get inReward() {
    return this._reward
  }
  get starterCount() {
    return this._starter
  }

  private upgradedDef(): CardDef['upgraded'] {
    if (!this._upgrade) return undefined
    const u = new Card(this.id, this.name, this.rarity)
    u._cost = this._cost
    u._target = this._target
    u._power = this._power
    u._exhaust = this._exhaust
    const result = this._upgrade(u)
    result._effects = result._effects.length > 0 ? result._effects : this._effects
    const { cost, target, kind, exhaust, effects, text } = result.snapshot()
    return { cost, target, kind, ...(exhaust ? { exhaust } : { exhaust: false }), effects, text }
  }

  build(): CardDef {
    const upgraded = this.upgradedDef()
    return { ...this.snapshot(), ...(upgraded && { upgraded }) }
  }

  private snapshot(): CardDef {
    if (this._power && this._target !== 'self') throw new Error(`能力牌必须是自身目标：${this.id}`)
    const kind = this._power ? 'power' : this._target === 'enemy' ? 'attack' : 'skill'
    const exhaust = this._exhaust && !this._power
    const effectsText = this._effects.map(effectText).join('，')
    return {
      id: this.id,
      ...(this._icon && { icon: this._icon }),
      rarity: this.rarity,
      name: this.name,
      cost: this._cost,
      target: this._target,
      kind,
      ...(exhaust && { exhaust: true }),
      ...(this._unplayable && { unplayable: true }),
      ...(this._endTurnLoseHp > 0 && { endTurnLoseHp: this._endTurnLoseHp }),
      effects: this._effects,
      text: this._text ?? (exhaust ? `${effectsText}，消耗` : effectsText),
    }
  }
}

/** 卡池：集中注册，派生出引擎需要的各种表；重复 id 直接报错 */
export class CardPool {
  private readonly entries: Card[] = []

  constructor(cards: Card[] = []) {
    cards.forEach((c) => this.add(c))
  }

  add(card: Card) {
    if (this.entries.some((c) => c.id === card.id)) throw new Error(`重复的卡牌 id：${card.id}`)
    this.entries.push(card)
    return this
  }

  /** id -> 卡牌定义 */
  defs(): Record<string, CardDef> {
    return Object.fromEntries(this.entries.map((c) => [c.id, c.build()]))
  }
  /** 战斗奖励候选（保持注册顺序，种子结果才稳定） */
  rewardIds(): string[] {
    return this.entries.filter((c) => c.inReward).map((c) => c.id)
  }
  /** 初始牌组（按注册顺序展开张数） */
  starterDeck(): string[] {
    return this.entries.flatMap((c) => Array<string>(c.starterCount).fill(c.id))
  }
}
