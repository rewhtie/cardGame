import { statusById } from '@/engine/statuses'
import type { CardDef, GameEvent } from '@/engine/types'

export interface SlotConfig {
  files?: string[]
  volume?: number
  maxSeconds?: number
  silent?: boolean
  synth?: 'split' | 'evolve' | 'train'
}
export type SfxMap = Record<string, SlotConfig>
export type SlotStatus = 'configured' | 'missing' | 'silent'

export function slotStatus(map: SfxMap, key: string): SlotStatus {
  const c = map[key]
  if (c?.silent) return 'silent'
  return c && (c.files?.length || c.synth) ? 'configured' : 'missing'
}

export function pickFile(config: SlotConfig, rand: () => number): string | undefined {
  const files = config.files
  if (!files?.length) return undefined
  return files[Math.min(files.length - 1, Math.floor(rand() * files.length))]
}

export function shouldPlay(lastAt: number | undefined, now: number, windowMs = 40): boolean {
  return lastAt === undefined || now - lastAt >= windowMs
}

type Cause = 'attack' | 'poison' | 'trigger'

/** 与 BattleView.damageCause 同一规则：成因由紧邻其前的触发事件决定 */
function damageCause(e: Extract<GameEvent, { type: 'damageDealt' }>, prev?: GameEvent): Cause {
  if (prev?.type === 'cardTriggered') return e.target === 'player' ? 'trigger' : 'attack'
  if (prev?.type !== 'statusTriggered') return 'attack'
  if (prev.target !== e.target || (prev.enemyIndex ?? 0) !== (e.enemyIndex ?? 0)) return 'attack'
  return prev.status === 'poison' ? 'poison' : 'trigger'
}

/** 战斗演出队列里一个事件对应的槽位键；cardAdded 由弹牌动画触发，这里不映射以免重复 */
export function sfxSlotsForEvent(
  e: GameEvent,
  prev: GameEvent | undefined,
  cards: Record<string, CardDef>,
): string[] {
  switch (e.type) {
    case 'cardPlayed': {
      const kind = cards[e.cardId]?.kind
      return kind ? [`battle.cardPlayed.${kind}`] : []
    }
    case 'damageDealt': {
      const cause = damageCause(e, prev)
      if (cause === 'poison') return e.amount > 0 ? ['battle.damage.poison'] : []
      if (e.amount <= 0) return e.blocked > 0 ? ['battle.damage.blocked'] : []
      if (cause === 'trigger' && e.target === 'player') return ['battle.damage.trigger']
      return [e.target === 'player' ? 'battle.damage.player' : 'battle.damage.enemy']
    }
    case 'blockGained':
      return [`battle.block.${e.target}`]
    case 'healed':
      return [`battle.heal.${e.target}`]
    case 'cardDrawn':
    case 'reshuffled':
    case 'handDiscarded':
    case 'energyGained':
    case 'turnStarted':
    case 'perfectBlock':
    case 'cardTriggered':
      return [`battle.${e.type}`]
    case 'cardEnchantGrew':
      return ['battle.enchantGrew']
    case 'potionUsed':
      return ['battle.potion']
    case 'statusApplied':
      // 层数为负：状态被消耗（如剑意），按"移除"处理
      if (e.stacks < 0) return ['battle.status.removed']
      return [statusById[e.status]?.kind === 'buff' ? 'battle.status.buff' : 'battle.status.debuff']
    case 'statusRemoved':
      return ['battle.status.removed']
    case 'statusTriggered':
      return ['battle.status.triggered']
    case 'enemyActed':
      return [e.intent.type === 'attack' ? 'battle.enemy.attack' : 'battle.enemy.act']
    case 'enemySpawned':
      return ['battle.enemy.spawn']
    case 'enemySplit':
      return ['battle.enemy.split']
    case 'enemyFled':
      return ['battle.enemy.flee']
    case 'goldStolen':
      return ['battle.gold.stolen']
    case 'goldReturned':
      return ['battle.gold.returned']
    case 'battleEnded':
      return [`battle.end.${e.result}`]
    default:
      return []
  }
}
