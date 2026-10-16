import { nextRandom } from './rng'

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SEED_LENGTH = 8

/** FNV-1a：把任意字符串稳定地哈希成 uint32 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 从一局种子派生出独立的随机流种子，互不干扰 */
export function deriveSeed(seed: string, label: string): number {
  return hashSeed(`${seed}:${label}`)
}

/** 玩家输入的种子：去空白、转大写，因此不区分大小写 */
export function normalizeSeed(input: string): string {
  return input.trim().toUpperCase()
}

/** 随机生成一个便于分享的短种子；random 可注入以便测试 */
export function generateSeed(random: () => number = Math.random): string {
  let seed = ''
  for (let i = 0; i < SEED_LENGTH; i++) {
    seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)]
  }
  return seed
}

export interface Rng {
  /** [0, 1) */
  float(): number
  /** [0, max) 的整数 */
  int(max: number): number
}

/** 有内部状态的随机数发生器，仅在单次生成过程内部使用 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const float = () => {
    const [value, next] = nextRandom(state)
    state = next
    return value
  }
  return { float, int: (max) => Math.floor(float() * max) }
}

/** 从 pool 中不放回地随机抽 count 个 */
export function sample<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  const rest = [...pool]
  const picked: T[] = []
  while (picked.length < count && rest.length > 0) {
    picked.push(rest.splice(rng.int(rest.length), 1)[0] as T)
  }
  return picked
}
