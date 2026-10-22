import { fillStacks, statusById } from '@/engine/statuses'
import type { CardDef, Effect, Rarity } from '@/engine/types'
import type { CardSpec, EditableRarity, UpgradeSpec } from './cardSpec'

/** 单个效果对应的卡面文字；perX 的数值显示为 N×{x} */
/** 寄生比例：1 倍写"层数"，否则写 1/N */
const parasiteRatio = (divisor: number) => (divisor === 1 ? '' : ` 1/${divisor} `)

/** 把效果列表拼成一句话；相邻、比例相同的寄生状态效果合并（"虚弱和易伤"） */
/** 可置入的状态牌 / 诅咒牌的牌名（卡面文字用） */
const CARD_NAMES: Record<string, string> = { wound: '伤口', stun: '晕眩', slimed: '粘液', burn: '灼伤' }

export function joinEffectTexts(effects: readonly Effect[], allEnemies = false): string {
  const parts: string[] = []
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!
    if (e.type === 'parasiteStatus') {
      const names = [e.status]
      while (true) {
        const n = effects[i + 1]
        if (n?.type !== 'parasiteStatus' || n.divisor !== e.divisor) break
        names.push(n.status)
        i++
      }
      const label = names.map((s) => statusById[s]?.name ?? s).join('和')
      parts.push(`给予目标寄生层数${parasiteRatio(e.divisor)}的${label}`)
    } else if (e.type === 'applyStatus' && mergeKey(e, allEnemies)) {
      // 相邻、去向相同的状态合并："给予所有敌人 3 层虚弱、3 层易伤"
      const key = mergeKey(e, allEnemies)
      const run = [e]
      while (true) {
        const n = effects[i + 1]
        if (n?.type !== 'applyStatus' || mergeKey(n, allEnemies) !== key) break
        run.push(n)
        i++
      }
      const prefix = key === 'self' ? '获得 ' : key === 'all' ? '给予所有敌人 ' : '给予 '
      parts.push(prefix + run.map((r) => `${r.stacks} 层${statusById[r.status]?.name ?? r.status}`).join('、'))
    } else parts.push(allEnemies ? allEnemiesText(e, effectText(e)) : effectText(e))
  }
  return parts.join('，')
}

/** 状态效果的合并分组（去向）；不能用「N 层X」句式合并的（临时、能力型增益）返回 undefined */
function mergeKey(e: Extract<Effect, { type: 'applyStatus' }>, allEnemies: boolean): string | undefined {
  if (e.to === 'self') {
    const def = statusById[e.status]
    return e.temp || (def?.display === 'count' && def.kind === 'buff') ? undefined : 'self'
  }
  return e.to === 'target' && !allEnemies ? 'target' : 'all'
}

/** 群体牌的卡面：把「造成 / 给予」改写成对所有敌人（给予所有敌人的状态本来就写明了） */
function allEnemiesText(e: Effect, text: string): string {
  if (e.type === 'damage' && text.startsWith('造成')) return `对所有敌人${text}`
  if ((e.type === 'applyStatus' || e.type === 'woundStatus') && e.to === 'target')
    return text.replace('给予', '给予所有敌人')
  return text
}

export function effectText(e: Effect): string {
  const amount = (n: number, perX?: boolean) => (perX ? `${n}×{x}` : String(n))
  switch (e.type) {
    case 'damage':
      if (e.perStack) {
        const name = statusById[e.perStack.status]?.name ?? e.perStack.status
        return `造成 ${e.amount} 点伤害，消耗全部${name}，每层额外 +${e.perStack.per}`
      }
      if (e.buffTotal) return `造成场上所有增益层数的伤害，没有增益时造成 ${e.amount} 点`
      if (e.maxHpPct) return `造成当前最大生命值 ${e.maxHpPct}% 的伤害`
      if (e.ifTargetBlock)
        return `造成 ${e.amount} 点伤害，目标有格挡时伤害 +${e.ifTargetBlock.bonus}`
      if (e.perAttackPlayed)
        return `造成 ${e.amount} 点伤害，本回合每打出一张攻击牌，伤害 +${e.perAttackPlayed.per}`
      if (e.lowHp)
        return `造成 ${e.amount} 点伤害，生命不高于一半时造成 ${e.lowHp.amount} 点`
      if (e.perTargetStatus) {
        const name = statusById[e.perTargetStatus.status]?.name ?? e.perTargetStatus.status
        const after = e.perTargetStatus.after ?? 'double'
        const tail = after === 'double' ? `，并使${name}层数翻倍` : after === 'clear' ? `，并清除${name}` : ''
        return `造成 ${e.amount} 点伤害，目标每有 1 层${name}，伤害 +${e.perTargetStatus.per}${tail}`
      }
      return e.woundBonus
        ? `造成 ${e.amount} 点伤害，牌堆中每有一张伤口，伤害 +${e.woundBonus}`
        : `造成 ${amount(e.amount, e.perX)} 点伤害${e.hits && e.hits > 1 ? ` ×${e.hits}` : ''}`
    case 'block':
      return `获得 ${amount(e.amount, e.perX)} 点格挡`
    case 'draw':
      return `抽 ${e.count} 张牌`
    case 'drawIfAttacks':
      return `本回合已打出 ${e.min} 张以上攻击牌（含这张）时，抽 ${e.count} 张牌`
    case 'gainEnergy':
      return `获得 ${e.amount} 点能量`
    case 'applyStatus': {
      const name = statusById[e.status]?.name ?? e.status
      const def = statusById[e.status]
      // 能力型增益：直接写它的效果（N 代入给予的层数），不再写"获得 N 层"
      if (e.to === 'self' && def?.display === 'count' && def.kind === 'buff') return fillStacks(def.text, e.stacks)
      if (e.to === 'self' && e.temp) return `获得 ${e.stacks} 点临时${name}`
      if (e.to === 'self') return `获得 ${e.stacks} 层${name}`
      if (e.to === 'target') return `给予 ${e.stacks} 层${name}`
      return `给予所有敌人 ${e.stacks} 层${name}`
    }
    case 'heal':
      return `恢复 ${e.amount} 点生命`
    case 'loseHp':
      return `失去 ${e.amount} 点生命`
    case 'addCard': {
      const name = CARD_NAMES[e.cardId] ?? e.cardId
      const to = { discard: '弃牌堆', draw: '抽牌堆', hand: '手牌' }[e.to]
      return `将 ${e.count} 张${name}置入${to}`
    }
    case 'penalty':
      return {
        energy: `下个回合能量 -${e.amount}`,
        draw: `下个回合少抽 ${e.amount} 张牌`,
        strength: `直到下个回合结束前失去 ${e.amount} 点力量`,
        dexterity: `直到下个回合结束前失去 ${e.amount} 点敏捷`,
      }[e.stat]
    case 'addWound':
      return `将 ${e.count} 张伤口置入弃牌堆`
    case 'exhaustStatusCard':
      return '选择手牌中的一张状态牌消耗'
    case 'consumeParasite':
      return `消耗目标 ${e.amount} 层寄生种子`
    case 'parasiteBurst':
      return '消耗目标全部寄生种子，造成等量伤害'
    case 'devourParasite':
      return `消耗目标至多 ${e.max} 层寄生种子，每层造成 ${e.per} 点伤害`
    case 'drawIfParasite':
      return `全场寄生种子合计 ≥ ${e.min} 层时，抽 ${e.count} 张牌`
    case 'parasiteStatus': {
      const name = statusById[e.status]?.name ?? e.status
      return `给予目标寄生层数${parasiteRatio(e.divisor)}的${name}`
    }
    case 'blockFromDamage':
      return '获得等同于造成伤害的格挡'
    case 'overdraft':
      return `直到下个回合结束前失去 ${e.amount} 点力量`
    case 'meltBlock':
      return '熔化敌人格挡（熔化：移除所有格挡值）'
    case 'sapStrength':
      return `目标失去 ${e.amount} 点力量（敌人回合结束时恢复）`
    case 'purgeSelfBuff':
      return '随机移除身上一个buff，获得其层数的格挡'
    case 'spreadParasite':
      return '其他敌人的寄生种子层数提升到与目标相同'
    case 'stealMaxHp':
      return `偷取目标 ${e.amount} 点最大生命值（本场战斗）`
    case 'convertCorpse':
      return '斩杀寄生层数不低于其当前生命一半的敌人，将其尸体转为 20 点生命的随从'
    case 'multiplyStatus': {
      const name = statusById[e.status]?.name ?? e.status
      return e.factor === 2 ? `使目标的${name}层数翻倍` : `使目标的${name}层数 ×${e.factor}`
    }
    case 'exhaustWounds': {
      const from = e.from === 'hand' ? '手牌' : '弃牌堆'
      const gain = {
        block: `获得 ${e.per} 点格挡`,
        gash: `给予 ${e.per} 层裂伤`,
        gashAll: `给予所有敌人 ${e.per} 层裂伤`,
        draw: `抽 ${e.per} 张牌`,
        damage: `造成 ${e.per} 点伤害`,
        damageAll: `对所有敌人造成 ${e.per} 点伤害`,
      }[e.gain]
      return `消耗${from}中所有伤口，每张${gain}`
    }
    case 'woundStatus': {
      const name = statusById[e.status]?.name ?? e.status
      const who = e.to === 'self' ? '获得' : e.to === 'target' ? '给予' : '给予所有敌人'
      return `牌堆中每有一张伤口，${who} ${e.per} 层${name}`
    }
    case 'choose':
      return {
        exhaust: `选择 ${e.count} 张手牌消耗`,
        copy: '选择一张手牌，将其复制一张加入手牌',
        scry: `查看抽牌堆顶部 ${e.count} 张牌，可弃掉其中任意张`,
        discover: '从 3 张随机牌中选择 1 张加入手牌，本回合耗能变为 0',
        retrieve: `从弃牌堆选择 ${e.count} 张牌放回手牌（不含伤口）`,
      }[e.mode]
    case 'redraw':
      return e.extra > 0 ? `弃掉所有手牌，再抽等量加 ${e.extra} 张牌` : '弃掉所有手牌，再抽等量的牌'
    case 'exhaustCards': {
      const where = { hand: '手牌', draw: '抽牌堆', discard: '弃牌堆', all: '手牌、抽牌堆和弃牌堆' }[e.from]
      const kind = { wound: '伤口', status: '状态牌', curse: '诅咒牌', other: '其他牌', any: '牌' }[e.kind]
      const base = `消耗${where}中${e.count === undefined ? '所有' : ` ${e.count} 张`}${kind}`
      return e.perCard?.length ? `${base}，每消耗 1 张${joinEffectTexts(e.perCard)}` : base
    }
    case 'reshuffle':
      return '将弃牌堆洗入抽牌堆'
    case 'blockByIntent':
      return '若目标的意图是攻击，获得等同于其单段伤害的格挡'
    case 'goldIfKill':
      return `若击杀了目标，获得 ${e.gold} 金币`
    case 'gainPotion':
      return '获得一瓶随机药水'
    case 'playTop':
      return '打出抽牌堆顶的牌并消耗'
    case 'fetch':
      return e.from === 'draw'
        ? `从抽牌堆顶部取 ${e.count} 张非伤口牌加入手牌`
        : `从弃牌堆取回最近的 ${e.count} 张非伤口牌加入手牌`
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
  private _target: 'enemy' | 'allEnemies' | 'self' = 'enemy'
  private _effects: Effect[] = []
  private _text?: string
  private _power = false
  private _exhaust = false
  private _retain = false
  private _retainGrow = 0
  private _skill = false
  private _unplayable = false
  private _endTurnLoseHp = 0
  private _reward = false
  private _starter = 0
  private _upgrade?: (u: Card) => Card
  private _evolve?: { plays: number; into: string }
  private _freeParasite?: number
  private _innate = false
  private _grow = 0

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
    else if (spec.target === 'allEnemies') c.targetAllEnemies()
    else c.targetEnemy()
    if (spec.asSkill && (spec.target === 'enemy' || spec.target === 'allEnemies')) c.asSkill()
    if (spec.exhaust) c.exhaust()
    if (spec.retain) c.retain()
    if (spec.retainGrow) c.retainGrow(spec.retainGrow)
    if (spec.innate) c.innate()
    if (spec.grow) c.grow(spec.grow)
    if (spec.unplayable) c.unplayable()
    if (spec.endTurnLoseHp > 0) c.endTurnLoseHp(spec.endTurnLoseHp)
    spec.effects.forEach((e) => c.effect(e))
    if (spec.text) c.text(spec.text)
    if (spec.reward) c.reward()
    if (spec.starter > 0) c.starter(spec.starter)
    if (spec.evolve) c.evolve(spec.evolve.plays, spec.evolve.into)
    if (spec.freeIfParasiteTotal) c.freeIfParasiteTotal(spec.freeIfParasiteTotal)
    const up = spec.upgrade
    if (up) {
      c.upgrade((u) => {
        if (up.cost !== undefined) u.cost(up.cost)
        if (up.exhaust === true) u.exhaust()
        else if (up.exhaust === false) u.noExhaust()
        if (up.retain === true) u.retain()
        else if (up.retain === false) u.noRetain()
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
      ...(this._skill && this._target !== 'self' && !this._power && { asSkill: true }),
      exhaust: this._exhaust,
      ...(this._retain && { retain: true }),
      ...(this._retainGrow > 0 && { retainGrow: this._retainGrow }),
      ...(this._innate && { innate: true }),
      ...(this._grow > 0 && { grow: this._grow }),
      unplayable: this._unplayable,
      endTurnLoseHp: this._endTurnLoseHp,
      reward: this._reward,
      starter: this._starter,
      ...(this._text && { text: this._text }),
      effects: this._effects,
      ...(upgrade && { upgrade }),
      ...(this._evolve && { evolve: this._evolve }),
      ...(this._freeParasite && { freeIfParasiteTotal: this._freeParasite }),
    }
  }

  private upgradeSpec(): UpgradeSpec | undefined {
    if (!this._upgrade) return undefined
    const u = new Card(this.id, this.name, this.rarity)
    u._cost = this._cost
    u._target = this._target
    u._power = this._power
    u._exhaust = this._exhaust
    u._retain = this._retain
    const r = this._upgrade(u)
    return {
      ...(r._cost !== this._cost && { cost: r._cost }),
      ...(r._exhaust !== this._exhaust && { exhaust: r._exhaust }),
      ...(r._retain !== this._retain && { retain: r._retain }),
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
  /** 群体牌：不选目标，以目标为对象的效果（伤害、给敌人上状态等）对每只存活敌人各结算一次 */
  targetAllEnemies() {
    this._target = 'allEnemies'
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
  /** 保留：回合结束时留在手牌 */
  retain() {
    this._retain = true
    return this
  }
  /** 每保留一回合，伤害 +n（同时具有保留） */
  retainGrow(n: number) {
    this._retain = true
    this._retainGrow = n
    return this
  }
  /** 固有：每场战斗第一回合必定抽上手 */
  innate() {
    this._innate = true
    return this
  }
  /** 增量：每打出一次，卡面数值 +n */
  grow(n: number) {
    this._grow = n
    return this
  }
  /** 需要选敌人的技能牌：不算攻击牌 */
  asSkill() {
    this._skill = true
    return this
  }
  choose(mode: 'exhaust' | 'copy' | 'scry' | 'discover' | 'retrieve', count = 1) {
    return this.effect({ type: 'choose', mode, count })
  }
  redraw(extra = 0) {
    return this.effect({ type: 'redraw', extra })
  }
  /** 自动消耗指定牌堆里符合条件的牌；count 缺省 = 全部 */
  exhaustCards(
    from: 'hand' | 'draw' | 'discard' | 'all',
    kind: 'wound' | 'status' | 'curse' | 'other' | 'any',
    count?: number,
    perCard?: Effect[],
  ) {
    return this.effect({
      type: 'exhaustCards',
      from,
      kind,
      ...(count !== undefined && { count }),
      ...(perCard?.length && { perCard }),
    })
  }
  reshuffle() {
    return this.effect({ type: 'reshuffle' })
  }
  blockByIntent() {
    return this.effect({ type: 'blockByIntent' })
  }
  goldIfKill(gold: number) {
    return this.effect({ type: 'goldIfKill', gold })
  }
  gainPotion() {
    return this.effect({ type: 'gainPotion' })
  }
  playTop() {
    return this.effect({ type: 'playTop' })
  }
  /** 打出后进消耗牌堆 */
  exhaust() {
    this._exhaust = true
    return this
  }

  /** 多段伤害：amount 点伤害打 hits 次，卡面写作「N 点伤害 ×M」 */
  damageHits(amount: number, hits: number) {
    return this.effect({ type: 'damage', amount, hits })
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
  /** 获得临时状态（如临时力量）：玩家回合结束时失去这些层数 */
  tempStatus(status: string, stacks: number) {
    return this.effect({ type: 'applyStatus', status, stacks, to: 'self', temp: true })
  }
  applyStatus(status: string, stacks: number, to: 'self' | 'target' | 'allEnemies' = 'self') {
    return this.effect({ type: 'applyStatus', status, stacks, to })
  }
  /** 伤害随三个牌堆里的伤口数增长 */
  damageByWounds(amount: number, perWound: number) {
    return this.effect({ type: 'damage', amount, woundBonus: perWound })
  }
  /** 伤害随玩家某状态层数增长，打完清零该状态 */
  damagePerStack(amount: number, status: string, per: number) {
    return this.effect({ type: 'damage', amount, perStack: { status, per } })
  }
  /** 生命不高于一半时，伤害改为 lowAmount */
  damageLowHp(amount: number, lowAmount: number) {
    return this.effect({ type: 'damage', amount, lowHp: { amount: lowAmount } })
  }
  /** 伤害随目标某状态层数增长；after 为打完后该状态的处理，缺省翻倍 */
  damagePerTargetStatus(amount: number, status: string, per: number, after?: 'keep' | 'clear' | 'double') {
    return this.effect({
      type: 'damage',
      amount,
      perTargetStatus: { status, per, ...(after && after !== 'double' && { after }) },
    })
  }
  /** 目标失去 amount 点力量，敌人回合结束时恢复 */
  sapStrength(amount: number) {
    return this.effect({ type: 'sapStrength', amount })
  }
  /** 随机移除自身一个状态（不分增益减益），获得与其层数相同的格挡 */
  purgeSelfBuff() {
    return this.effect({ type: 'purgeSelfBuff' })
  }
  /** 伤害 = 场上所有增益的层数总和（玩家 + 存活敌人）；没有增益时改用 fallback */
  damageByBuffs(fallback: number) {
    return this.effect({ type: 'damage', amount: fallback, buffTotal: true })
  }
  /** 伤害 = 当前最大生命值的 pct%（四舍五入） */
  damageMaxHpPercent(pct: number) {
    return this.effect({ type: 'damage', amount: 0, maxHpPct: pct })
  }
  /** 目标有格挡时，伤害 +bonus */
  damageIfTargetBlock(amount: number, bonus: number) {
    return this.effect({ type: 'damage', amount, ifTargetBlock: { bonus } })
  }
  /** 伤害随本回合已打出的攻击牌数增长 */
  damagePerAttackPlayed(amount: number, per: number) {
    return this.effect({ type: 'damage', amount, perAttackPlayed: { per } })
  }
  /** 本回合已打出 min 张以上攻击牌时抽牌 */
  drawIfAttacks(min: number, count: number) {
    return this.effect({ type: 'drawIfAttacks', min, count })
  }
  /** 把目标某状态的层数乘以 factor */
  multiplyStatus(status: string, factor: number) {
    return this.effect({ type: 'multiplyStatus', status, factor })
  }
  /** 打出时选一张手牌里的状态牌消耗 */
  exhaustStatusCard() {
    return this.effect({ type: 'exhaustStatusCard' })
  }
  consumeParasite(amount: number) {
    return this.effect({ type: 'consumeParasite', amount })
  }
  devourParasite(max: number, per: number) {
    return this.effect({ type: 'devourParasite', max, per })
  }
  parasiteBurst() {
    return this.effect({ type: 'parasiteBurst' })
  }
  drawIfParasite(min: number, count: number) {
    return this.effect({ type: 'drawIfParasite', min, count })
  }
  parasiteStatus(status: string, divisor = 1) {
    return this.effect({ type: 'parasiteStatus', status, divisor })
  }
  /** 获得等同于本张牌刚造成伤害的格挡（须写在伤害效果之后） */
  blockFromDamage() {
    return this.effect({ type: 'blockFromDamage' })
  }
  addCard(cardId: string, count: number, to: 'discard' | 'draw' | 'hand' = 'discard') {
    return this.effect({ type: 'addCard', cardId, count, to })
  }
  penalty(stat: 'energy' | 'draw' | 'strength' | 'dexterity', amount: number) {
    return this.effect({ type: 'penalty', stat, amount })
  }
  /** 透支：立刻失去 amount 点力量，下个回合结束时恢复 */
  overdraft(amount: number) {
    return this.effect({ type: 'overdraft', amount })
  }
  /** 熔化目标敌人的全部格挡 */
  meltBlock() {
    return this.effect({ type: 'meltBlock' })
  }
  spreadParasite() {
    return this.effect({ type: 'spreadParasite' })
  }
  /** 全场存活敌人的寄生层数合计达到 total 时，这张牌免费 */
  freeIfParasiteTotal(total: number) {
    this._freeParasite = total
    return this
  }
  stealMaxHp(amount: number) {
    return this.effect({ type: 'stealMaxHp', amount })
  }
  convertCorpse() {
    return this.effect({ type: 'convertCorpse' })
  }
  addWound(count: number) {
    return this.effect({ type: 'addWound', count })
  }
  exhaustWounds(
    from: 'hand' | 'discard',
    gain: 'block' | 'gash' | 'gashAll' | 'draw' | 'damage' | 'damageAll',
    per: number,
  ) {
    return this.effect({ type: 'exhaustWounds', from, gain, per })
  }
  /** 状态层数随三个牌堆里的伤口总数增长 */
  statusByWounds(status: string, per: number, to: 'self' | 'target' | 'allEnemies' = 'self') {
    return this.effect({ type: 'woundStatus', status, per, to })
  }
  /** 把非伤口牌从弃牌堆 / 抽牌堆捞进手牌 */
  fetch(from: 'discard' | 'draw', count: number) {
    return this.effect({ type: 'fetch', from, count })
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

  /** 取消保留（升级时去掉"保留"用） */
  noRetain() {
    this._retain = false
    this._retainGrow = 0
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

  /** 进化：累计打出 plays 次后（战斗胜利时结算）变成 into */
  evolve(plays: number, into: string) {
    this._evolve = { plays, into }
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
    u._retain = this._retain
    u._retainGrow = this._retainGrow
    u._innate = this._innate
    u._skill = this._skill
    const result = this._upgrade(u)
    result._effects = result._effects.length > 0 ? result._effects : this._effects
    const { cost, target, kind, exhaust, retain, retainGrow, effects, text } = result.snapshot()
    return {
      cost,
      target,
      kind,
      ...(exhaust ? { exhaust } : { exhaust: false }),
      ...(retain && { retain }),
      ...(retainGrow && { retainGrow }),
      effects,
      text,
    }
  }

  build(): CardDef {
    const upgraded = this.upgradedDef()
    return { ...this.snapshot(), ...(upgraded && { upgraded }) }
  }

  private snapshot(): CardDef {
    if (this._power && this._target !== 'self') throw new Error(`能力牌必须是自身目标：${this.id}`)
    const kind = this._power ? 'power' : this._target !== 'self' && !this._skill ? 'attack' : 'skill'
    const exhaust = this._exhaust && !this._power
    const effectsText = this._effects.length ? joinEffectTexts(this._effects, this._target === 'allEnemies') + '。' : ''
    return {
      id: this.id,
      ...(this._icon && { icon: this._icon }),
      rarity: this.rarity,
      name: this.name,
      cost: this._cost,
      target: this._target,
      kind,
      ...(exhaust && { exhaust: true }),
      ...(this._retain && { retain: true }),
      ...(this._retainGrow > 0 && { retainGrow: this._retainGrow }),
      ...(this._innate && { innate: true }),
      ...(this._grow > 0 && { grow: this._grow }),
      ...(this._unplayable && { unplayable: true }),
      ...(this._endTurnLoseHp > 0 && { endTurnLoseHp: this._endTurnLoseHp }),
      ...(this._evolve && { evolve: this._evolve }),
      ...(this._freeParasite && { freeIfParasiteTotal: this._freeParasite }),
      effects: this._effects,
      text:
        this._text ??
        `${this._innate ? '固有\n' : ''}${this._retain ? '保留\n' : ''}${effectsText}${exhaust ? '\n消耗' : ''}`,
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
