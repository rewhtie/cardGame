import type { CardSpec } from '../src/data/cards/cardSpec'
import type { Effect } from '../src/engine/types'

const q = (s: string) =>
  `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`

/** 一个效果对应的构建器方法调用，如 .damage(6) */
function effectCall(e: Effect): string {
  switch (e.type) {
    case 'damage':
      if (e.woundBonus) return `.damageByWounds(${e.amount}, ${e.woundBonus})`
      return e.perX ? `.damage(${e.amount}, true)` : `.damage(${e.amount})`
    case 'block':
      return e.perX ? `.block(${e.amount}, true)` : `.block(${e.amount})`
    case 'draw':
      return `.draw(${e.count})`
    case 'gainEnergy':
      return `.gainEnergy(${e.amount})`
    case 'applyStatus':
      return e.to === 'self'
        ? `.applyStatus(${q(e.status)}, ${e.stacks})`
        : `.applyStatus(${q(e.status)}, ${e.stacks}, ${q(e.to)})`
    case 'heal':
      return `.heal(${e.amount})`
    case 'loseHp':
      return `.loseHp(${e.amount})`
    case 'addWound':
      return `.addWound(${e.count})`
    case 'exhaustWounds':
      return `.exhaustWounds(${q(e.from)}, ${q(e.gain)}, ${e.per})`
  }
}

const cost = (c: number | 'X') => (c === 'X' ? `'X'` : String(c))

/** 把卡牌数据生成为构建器代码（2 空格缩进，每个方法一行，与现有文件风格一致） */
export function cardToCode(spec: CardSpec): string {
  const lines = [`  Card.${spec.rarity}(${q(spec.id)}, ${q(spec.name)})`]
  const add = (call: string) => lines.push(`    ${call}`)
  if (spec.icon) add(`.icon(${q(spec.icon)})`)
  add(`.cost(${cost(spec.cost)})`)
  add(spec.target === 'power' ? '.power()' : spec.target === 'self' ? '.targetSelf()' : '.targetEnemy()')
  if (spec.unplayable) add('.unplayable()')
  if (spec.endTurnLoseHp > 0) add(`.endTurnLoseHp(${spec.endTurnLoseHp})`)
  if (spec.exhaust && spec.target !== 'power') add('.exhaust()')
  spec.effects.forEach((e) => add(effectCall(e)))
  if (spec.text) add(`.text(${q(spec.text)})`)
  if (spec.reward) add('.reward()')
  if (spec.starter > 0) add(`.starter(${spec.starter})`)
  const up = spec.upgrade
  if (up) {
    const calls: string[] = []
    if (up.cost !== undefined) calls.push(`.cost(${cost(up.cost)})`)
    if (up.exhaust === true) calls.push('.exhaust()')
    else if (up.exhaust === false) calls.push('.noExhaust()')
    up.effects?.forEach((e) => calls.push(effectCall(e)))
    if (up.text) calls.push(`.text(${q(up.text)})`)
    add(`.upgrade((u) => u${calls.join('')})`)
  }
  lines[lines.length - 1] += ','
  return lines.join('\n')
}
