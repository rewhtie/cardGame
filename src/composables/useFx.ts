import { shallowRef } from 'vue'
import type { GameEvent } from '@/engine/types'

/** 最近一次 dispatch 产生的引擎事件；seq 保证相同内容也能触发 watch */
export const fxBatch = shallowRef<{ seq: number; events: GameEvent[] }>({ seq: 0, events: [] })

/** 引擎事件 -> 表现层：状态照常立即更新，动画只是叠在上面的纯视觉效果 */
export function pushFx(events: GameEvent[]) {
  if (events.length) fxBatch.value = { seq: fxBatch.value.seq + 1, events }
}
