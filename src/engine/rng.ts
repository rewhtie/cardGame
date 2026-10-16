/** 纯函数式 PRNG（mulberry32）：状态就是一个 uint32，便于存档与复现 */
export function nextRandom(state: number): [value: number, nextState: number] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** Fisher-Yates 洗牌，返回新数组与新的 rng 状态，不修改入参 */
export function shuffle<T>(items: readonly T[], state: number): [result: T[], nextState: number] {
  const result = [...items]
  let s = state
  for (let i = result.length - 1; i > 0; i--) {
    const [r, ns] = nextRandom(s)
    s = ns
    const j = Math.floor(r * (i + 1))
    const tmp = result[i] as T
    result[i] = result[j] as T
    result[j] = tmp
  }
  return [result, s]
}
