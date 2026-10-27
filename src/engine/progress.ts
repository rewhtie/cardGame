import { findNode } from './map'
import type { RunState } from './run'

export function runProgress(run: Pick<RunState, 'stage' | 'map' | 'current'>) {
  const stage = run.stage ?? 1
  const node = run.current ? findNode(run.map, run.current) : undefined
  const floor = node ? node.floor + 1 : 0
  return { stage, floor }
}
