/**
 * 敌人立绘：src/assets/enemies/<敌人 id>.webp；进入血量阶段后优先用 <id>-hatched / <id>-phase。
 * 没有立绘的敌人回退到 def.icon 表情。
 */
const files = import.meta.glob('@/assets/enemies/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const sprites = new Map<string, string>(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -5), url]),
)

/** 同一形象的不同体型共用立绘 */
const ALIAS: Record<string, string> = {
  'ghost-wisp': 'ghost',
  'medium-spike-slime': 'large-spike-slime',
  'medium-acid-slime': 'large-acid-slime',
  'small-slime': 'slime',
}

const PHASE_SUFFIX: Record<string, string> = { eggshell: 'hatched' }

export function enemySprite(id: string, phaseChanged = false): string | undefined {
  if (phaseChanged && PHASE_SUFFIX[id]) {
    const phased = sprites.get(`${id}-${PHASE_SUFFIX[id]}`)
    if (phased) return phased
  }
  return sprites.get(id) ?? sprites.get(ALIAS[id] ?? '')
}

/** 体型较小的变体按比例缩小显示 */
export function enemySpriteScale(id: string): number {
  if (id === 'small-slime' || id === 'ghost-wisp') return 0.7
  if (id.startsWith('medium-')) return 0.85
  return 1
}
