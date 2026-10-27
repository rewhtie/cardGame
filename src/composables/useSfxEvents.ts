import { watch } from 'vue'
import { fxBatch, fxReset } from '@/composables/useFx'
import { playSfx } from '@/composables/useSfx'
import { enchantOf } from '@/engine/enchant'
import type { GameEvent } from '@/engine/types'

/**
 * 引擎事件 -> 音效：和动画是平行的两个表现层，都只订阅 fxBatch，谁也不依赖谁。
 * 动画组件被跳过、卸载或根本没渲染时，声音照样按事件发出；新增事件来源只要发同一个事件就自动有声音。
 * 这里只放"整局层面"的事件音效；战斗内音效挂在 `useFx` 的演出队列上。
 */

/** 升级：连敲几下，间隔略有错落，最后一下更重；音效文件较长，每下只取开头 0.5 秒 */
const HAMMER_HITS: [delay: number, volume: number][] = [
  [0, 0.8],
  [170, 0.85],
  [340, 0.9],
  [540, 1],
]

let timers: ReturnType<typeof setTimeout>[] = []
function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers = timers.filter((x) => x !== t)
    fn()
  }, ms)
  timers.push(t)
}
function hammer() {
  HAMMER_HITS.forEach(([delay, volume]) => later(delay, () => void playSfx('run.forge.upgrade', { volume, maxSeconds: 0.5 })))
}

/** 这批牌改动里是否包含"新附魔"（附魔有镶嵌音，升级没有） */
export const isNewEnchant = (cards?: { from: string; to: string }[]) =>
  !!cards?.some((c) => !!enchantOf(c.to) && !enchantOf(c.from))

/** 事件 -> 音效的映射表；没登记的事件不发声 */
const SOUNDS: { [T in GameEvent['type']]?: (e: Extract<GameEvent, { type: T }>) => void } = {
  // 火堆锻造、事件升级共用
  cardsUpgraded: () => hammer(),
  cardsEnchanted: () => void playSfx('run.enchant'),
  // 卡牌成长（火堆训练 / 战斗后进化）：蓄力裂开 + 爆发的合成音，时间轴与 RelicReveal 的成长动画对齐
  cardsEvolved: () => void playSfx('run.evolve'),
  // 成长未满：蓄力后裂痕加深，不爆发
  cardsTrained: () => void playSfx('run.train'),
  // 遗物改牌：附魔（训练指南）镶嵌音；升级（磨刀石）同火堆
  relicGained: (e) => {
    if (!e.cards?.length) void playSfx('run.relic.gained')
    else if (isNewEnchant(e.cards)) void playSfx('run.enchant')
    else hammer()
    if (e.heal) void playSfx('battle.heal.player')
  },
  hpLost: () => void playSfx('run.hpLost'),
  maxHpGained: () => void playSfx('battle.heal.player'),
}

let installed = false
/** 全局只挂一次：读档 / 开新局（fxReset）时作废没响完的敲击 */
export function installSfxEvents() {
  if (installed) return
  installed = true
  watch(fxBatch, (b) => {
    for (const e of b.events) (SOUNDS[e.type] as ((e: GameEvent) => void) | undefined)?.(e)
  })
  watch(fxReset, () => {
    timers.forEach(clearTimeout)
    timers = []
  })
}
