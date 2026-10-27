import type { CardSpec } from '../src/data/cards/cardSpec'
import type { Effect } from '../src/engine/types'

const q = (s: string) =>
  `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`

/** 把纯数据（嵌套的效果）写成 TS 字面量，字符串用单引号，与手写风格一致 */
function literal(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`
  if (v && typeof v === 'object')
    return `{ ${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k}: ${literal(x)}`)
      .join(', ')} }`
  return typeof v === 'string' ? q(v) : String(v)
}

/** 一个效果对应的构建器方法调用，如 .damage(6) */
function effectCall(e: Effect): string {
  switch (e.type) {
    case 'damage':
      if (e.perStack) return `.damagePerStack(${e.amount}, ${q(e.perStack.status)}, ${e.perStack.per})`
      if (e.hits && e.hits > 1) return `.damageHits(${e.amount}, ${e.hits})`
      if (e.buffTotal) return `.damageByBuffs(${e.amount})`
      if (e.maxHpPct) return `.damageMaxHpPercent(${e.maxHpPct})`
      if (e.ifTargetBlock) return `.damageIfTargetBlock(${e.amount}, ${e.ifTargetBlock.bonus})`
      if (e.perAttackPlayed) return `.damagePerAttackPlayed(${e.amount}, ${e.perAttackPlayed.per})`
      if (e.lowHp) return `.damageLowHp(${e.amount}, ${e.lowHp.amount})`
      if (e.perTargetStatus)
        return `.damagePerTargetStatus(${e.amount}, ${q(e.perTargetStatus.status)}, ${e.perTargetStatus.per}${
          e.perTargetStatus.after && e.perTargetStatus.after !== 'double' ? `, ${q(e.perTargetStatus.after)}` : ''
        })`
      if (e.woundBonus) return `.damageByWounds(${e.amount}, ${e.woundBonus})`
      return e.perX ? `.damage(${e.amount}, true)` : `.damage(${e.amount})`
    case 'block':
      return e.perX ? `.block(${e.amount}, true)` : `.block(${e.amount})`
    case 'draw':
      return `.draw(${e.count})`
    case 'drawIfAttacks':
      return `.drawIfAttacks(${e.min}, ${e.count})`
    case 'gainEnergy':
      return `.gainEnergy(${e.amount})`
    case 'applyStatus':
      if (e.temp && e.to === 'self') return `.tempStatus(${q(e.status)}, ${e.stacks})`
      return e.to === 'self'
        ? `.applyStatus(${q(e.status)}, ${e.stacks})`
        : `.applyStatus(${q(e.status)}, ${e.stacks}, ${q(e.to)})`
    case 'heal':
      return `.heal(${e.amount})`
    case 'loseHp':
      return `.loseHp(${e.amount})`
    case 'lifeOverload':
      return `.effect({ type: 'lifeOverload' })`
    case 'mentalOverload':
      return `.effect({ type: 'mentalOverload' })`
    case 'sensoryOverload':
      return `.effect({ type: 'sensoryOverload', per: ${e.per} })`
    case 'addCard':
      return `.addCard(${q(e.cardId)}, ${e.count}${e.to === 'discard' ? '' : `, ${q(e.to)}`})`
    case 'penalty':
      return `.penalty(${q(e.stat)}, ${e.amount})`
    case 'addWound':
      return `.addWound(${e.count})`
    case 'consumeParasite':
      return `.consumeParasite(${e.amount})`
    case 'parasiteBurst':
      return '.parasiteBurst()'
    case 'devourParasite':
      return `.devourParasite(${e.max}, ${e.per})`
    case 'drawIfParasite':
      return `.drawIfParasite(${e.min}, ${e.count})`
    case 'parasiteStatus':
      return `.parasiteStatus(${q(e.status)}, ${e.divisor})`
    case 'blockFromDamage':
      return '.blockFromDamage()'
    case 'overdraft':
      return `.overdraft(${e.amount})`
    case 'meltBlock':
      return '.meltBlock()'
    case 'sapStrength':
      return `.sapStrength(${e.amount})`
    case 'purgeSelfBuff':
      return '.purgeSelfBuff()'
    case 'spreadParasite':
      return '.spreadParasite()'
    case 'stealMaxHp':
      return `.stealMaxHp(${e.amount})`
    case 'convertCorpse':
      return '.convertCorpse()'
    case 'multiplyStatus':
      return `.multiplyStatus(${q(e.status)}, ${e.factor})`
    case 'exhaustWounds':
      return `.exhaustWounds(${q(e.from)}, ${q(e.gain)}, ${e.per})`
    case 'woundStatus':
      return `.statusByWounds(${q(e.status)}, ${e.per}, ${q(e.to)})`
    case 'exhaustStatusCard':
      return '.exhaustStatusCard()'
    case 'choose':
      return `.choose(${q(e.mode)}, ${e.count})`
    case 'redraw':
      return `.redraw(${e.extra})`
    case 'exhaustCards': {
      const args = [q(e.from), q(e.kind)]
      if (e.perCard?.length) args.push(e.count === undefined ? 'undefined' : String(e.count), literal(e.perCard))
      else if (e.count !== undefined) args.push(String(e.count))
      return `.exhaustCards(${args.join(', ')})`
    }
    case 'reshuffle':
      return '.reshuffle()'
    case 'blockByIntent':
      return '.blockByIntent()'
    case 'goldIfKill':
      return `.goldIfKill(${e.gold})`
    case 'gainPotion':
      return '.gainPotion()'
    case 'playTop':
      return '.playTop()'
    case 'fetch':
      return `.fetch(${q(e.from)}, ${e.count})`
  }
}

const cost = (c: number | 'X') => (c === 'X' ? `'X'` : String(c))

/** 把卡牌数据生成为构建器代码（2 空格缩进，每个方法一行，与现有文件风格一致） */
export function cardToCode(spec: CardSpec): string {
  const lines = [`  Card.${spec.rarity}(${q(spec.id)}, ${q(spec.name)})`]
  const add = (call: string) => lines.push(`    ${call}`)
  if (spec.icon) add(`.icon(${q(spec.icon)})`)
  add(`.cost(${cost(spec.cost)})`)
  add(spec.target === 'power' ? '.power()' : spec.target === 'self' ? '.targetSelf()' : spec.target === 'allEnemies' ? '.targetAllEnemies()' : '.targetEnemy()')
  if (spec.asSkill && (spec.target === 'enemy' || spec.target === 'allEnemies')) add('.asSkill()')
  if (spec.unplayable) add('.unplayable()')
  if (spec.mustPlayFirst) add('.mustPlayFirst()')
  if (spec.endTurnLoseHp > 0) add(`.endTurnLoseHp(${spec.endTurnLoseHp})`)
  if (spec.endTurnReplicate) add('.endTurnReplicate()')
  if (spec.exhaust && spec.target !== 'power') add('.exhaust()')
  if (spec.oneShot) add('.oneShot()')
  if (spec.ethereal) add('.ethereal()')
  if (spec.retain) add('.retain()')
  if (spec.retainGrow) add(`.retainGrow(${spec.retainGrow})`)
  if (spec.innate) add('.innate()')
  if (spec.grow) add(`.grow(${spec.grow})`)
  spec.effects.forEach((e) => add(effectCall(e)))
  if (spec.text) add(`.text(${q(spec.text)})`)
  if (spec.reward) add('.reward()')
  if (spec.starter > 0) add(`.starter(${spec.starter})`)
  if (spec.evolve) add(`.evolve(${spec.evolve.plays}, ${q(spec.evolve.into)})`)
  if (spec.freeIfParasiteTotal) add(`.freeIfParasiteTotal(${spec.freeIfParasiteTotal})`)
  if (spec.freeIfSwordIntent) add('.freeIfSwordIntent()')
  const up = spec.upgrade
  if (up) {
    const calls: string[] = []
    if (up.cost !== undefined) calls.push(`.cost(${cost(up.cost)})`)
    if (up.exhaust === true) calls.push('.exhaust()')
    else if (up.exhaust === false) calls.push('.noExhaust()')
    if (up.oneShot === true) calls.push('.oneShot()')
    else if (up.oneShot === false) calls.push('.noOneShot()')
    if (up.retain === true) calls.push('.retain()')
    else if (up.retain === false) calls.push('.noRetain()')
    up.effects?.forEach((e) => calls.push(effectCall(e)))
    if (up.text) calls.push(`.text(${q(up.text)})`)
    add(`.upgrade((u) => u${calls.join('')})`)
  }
  lines[lines.length - 1] += ','
  return lines.join('\n')
}
