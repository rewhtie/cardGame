/** 只看意图的类型与递增量，EnemyDef 与编辑器的 EnemySpec 都满足 */
interface Looping {
  intents: { type: string; grow?: number }[]
  loopFrom?: number
}

/** 敌人已行动 turns 次后，下一次要用的意图下标：走到末尾回到 loopFrom（缺省 0） */
export function intentIndexAt(def: Looping, turns: number): number {
  const n = def.intents.length
  if (n === 0) return 0
  if (turns < n) return Math.max(0, turns)
  const from = Math.min(def.loopFrom ?? 0, n - 1)
  return from + ((turns - from) % (n - from))
}

/** 已行动 turns 次后，攻击意图累计的额外伤害（每次攻击后按 grow 递增） */
export function attackBonusAt(def: Looping, turns: number): number {
  let bonus = 0
  for (let k = 0; k < turns; k++) {
    const it = def.intents[intentIndexAt(def, k)]
    if (it?.type === 'attack') bonus += it.grow ?? 0
  }
  return bonus
}
