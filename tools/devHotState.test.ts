import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ModuleKind, transpileModule } from 'typescript'
import * as vue from 'vue'
import * as cardData from '../src/data/cards'
import * as characters from '../src/data/characters'
import * as enemies from '../src/data/enemies'
import * as events from '../src/data/events'
import * as items from '../src/data/items'
import * as runEngine from '../src/engine/run'
import * as save from '../src/engine/save'
import * as seed from '../src/engine/seed'
import type { useRun } from '../src/composables/useRun'
import type { useDevHotState } from '../src/composables/useDevHotState'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

function hotContext(data: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>()
  const disposers: (() => void)[] = []
  return {
    data,
    on(event: string, callback: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(callback)
    },
    off(event: string, callback: () => void) { listeners.get(event)?.delete(callback) },
    dispose(callback: () => void) { disposers.push(callback) },
    emit(event: string) { for (const callback of [...listeners.get(event) ?? []]) callback() },
    disposeModule() { for (const callback of disposers) callback() },
  }
}

function evaluate<T>(file: string, hot: ReturnType<typeof hotContext> | undefined, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.hot', '__hot')
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } })
  const exports = {}
  new Function('__hot', 'require', 'exports', outputText)(hot, (id: string) => {
    if (!(id in dependencies)) throw new Error(`Missing test dependency: ${id}`)
    return dependencies[id]
  }, exports)
  return exports as T
}

let tickets: (() => void)[]
function loadRun(hot?: ReturnType<typeof hotContext>, fx?: typeof import('../src/composables/useFx')) {
  const dependencies = {
    vue,
    './useFx': fx ?? {
      pushFx: vi.fn(), resetFx: vi.fn(),
      enqueueFx: () => ({ done: new Promise<void>((resolve) => { tickets.push(resolve) }) }),
    },
    '@/data/cards': cardData,
    '@/data/characters': characters,
    '@/data/enemies': enemies,
    '@/data/events': events,
    '@/data/items': items,
    '@/engine/run': runEngine,
    '@/engine/save': save,
    '@/engine/seed': seed,
  }
  return evaluate<{ useRun: typeof useRun }>('../src/composables/useRun.ts', hot, dependencies).useRun()
}

function enterBattle(api: ReturnType<typeof useRun>) {
  api.seedInput.value = 'HOT-REGRESSION'
  api.start('warrior')
  const node = api.run.value!.map.floors.flat().find((node) => node.type === 'monster')!
  api.send({ type: 'chooseNode', id: node.id, god: true })
  expect(api.run.value!.screen).toBe('battle')
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
  vi.stubGlobal('sessionStorage', storage())
  tickets = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('对局开发刷新恢复', () => {
  it('普通模块热更新复用原 ref 和完整对局', () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    const state = original.run.value
    hot.disposeModule()
    const updated = loadRun(hotContext(hot.data))
    expect(updated.run).toBe(original.run)
    expect(updated.run.value).toBe(state)
  })

  it('整页刷新保留战斗状态和牌组，不覆盖正式存档', () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    const before = original.run.value!
    const formalSave = localStorage.getItem('cardfire.save')
    hot.emit('vite:beforeFullReload')
    const restored = loadRun(hotContext())
    const state = Object.fromEntries(Object.entries(before).filter(([key]) => key !== 'content'))
    expect(restored.run.value).toMatchObject(state)
    expect(restored.run.value!.content.deck).toEqual(before.content.deck)
    expect(localStorage.getItem('cardfire.save')).toBe(formalSave)
    expect(sessionStorage.getItem('dev-hot-state:run')).toBeNull()
    expect(restored.run.value!.content.events!.some((event) => typeof event.requires === 'function')).toBe(true)
  })

  it('刷新前后同一操作的随机结果与伤害一致', () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    const before = original.run.value!
    hot.emit('vite:beforeFullReload')
    const restored = loadRun(hotContext())
    const action = { type: 'battle', action: { type: 'endTurn' } } as const
    const expected = runEngine.dispatchRun(before, action)
    const actual = runEngine.dispatchRun(restored.run.value!, action)
    const withoutContent = (state: runEngine.RunState | undefined) => {
      if (!state) return state
      return Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'content'))
    }
    expect(actual.events).toEqual(expected.events)
    expect(withoutContent(actual.state)).toEqual(withoutContent(expected.state))
    expect(withoutContent(actual.pre)).toEqual(withoutContent(expected.pre))
  })

  it('敌人演出中整页刷新恢复已结算的新回合', () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    const action = { type: 'battle', action: { type: 'endTurn' } } as const
    const expected = runEngine.dispatchRun(original.run.value!, action).state
    original.send(action)
    expect(original.run.value!.battle!.phase).toBe('enemy')
    hot.emit('vite:beforeFullReload')
    const restored = loadRun(hotContext())
    expect(restored.run.value!.battle).toEqual(expected.battle)
    expect(restored.run.value!.battle!.phase).toBe('player')
  })

  it('普通热更新期间原演出回调仍推进共享对局', async () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    original.send({ type: 'battle', action: { type: 'endTurn' } })
    hot.disposeModule()
    const updated = loadRun(hotContext(hot.data))
    tickets[0]!()
    await Promise.resolve()
    expect(updated.run.value!.battle!.phase).toBe('player')
  })

  it('热更新重建战斗视图并取消旧动画计时器后不能卡在敌人回合', async () => {
    vi.useFakeTimers()
    const fx = evaluate<typeof import('../src/composables/useFx')>('../src/composables/useFx.ts', undefined, {
      vue,
      './useSfx': { playSfx: vi.fn() },
      './sfxResolve': { sfxSlotsForEvent: () => [] },
    })
    const timers: ReturnType<typeof setTimeout>[] = []
    const handler = (event: Parameters<typeof fx.pushFx>[0][number]) => {
      if (event.type !== 'cardDiscarded') return
      return new Promise<void>((resolve) => { timers.push(setTimeout(resolve, 70)) })
    }
    const hot = hotContext()
    const original = loadRun(hot, fx)
    enterBattle(original)
    fx.setFxHandler(handler)
    original.send({ type: 'battle', action: { type: 'endTurn' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(timers.length).toBeGreaterThan(0)
    expect(original.run.value!.battle!.phase).toBe('enemy')
    hot.disposeModule()
    fx.clearFxHandler(handler)
    for (const timer of timers) clearTimeout(timer)
    const updated = loadRun(hotContext(hot.data), fx)
    fx.setFxHandler(() => undefined)
    await vi.advanceTimersByTimeAsync(5000)
    expect(updated.run.value!.battle!.phase).toBe('player')
  })

  it('退出后旧回合回调不能把对局重新打开', async () => {
    const original = loadRun(hotContext())
    enterBattle(original)
    original.send({ type: 'battle', action: { type: 'endTurn' } })
    original.quit()
    tickets[0]!()
    await Promise.resolve()
    expect(original.run.value).toBeNull()
  })

  it('主动回主菜单后刷新不会恢复刚退出的对局', () => {
    const hot = hotContext()
    const original = loadRun(hot)
    enterBattle(original)
    original.quit()
    hot.emit('vite:beforeFullReload')
    expect(loadRun(hotContext()).run.value).toBeNull()
  })

  it('生产模式忽略开发快照', () => {
    sessionStorage.setItem('dev-hot-state:run', '{"run":{"seed":"OLD"},"deck":[]}')
    expect(loadRun().run.value).toBeNull()
  })
})

function panel(hot: ReturnType<typeof hotContext>, initial = false) {
  const unmounts: (() => void)[] = []
  const state = vue.ref(initial)
  const module = evaluate<{ useDevHotState: typeof useDevHotState }>('../src/composables/useDevHotState.ts', hot, {
    vue: { ...vue, onBeforeUnmount: (callback: () => void) => { unmounts.push(callback) } },
  })
  const restored = module.useDevHotState(hot as unknown as NonNullable<ImportMeta['hot']>, 'regression-panel', { state })
  return { state, restored, unmount: () => { for (const callback of unmounts) callback() } }
}

describe('面板恢复与正常关闭', () => {
  it('整页刷新恢复打开状态，缓存只消费一次', () => {
    const hot = hotContext()
    panel(hot, true)
    hot.emit('vite:beforeFullReload')
    const restored = panel(hotContext())
    expect(restored.state.value).toBe(true)
    expect(restored.restored).toBe(true)
    expect(panel(hotContext()).state.value).toBe(false)
  })

  it('热更新卸载后延迟挂载的异步面板仍能恢复', async () => {
    const hot = hotContext()
    const old = panel(hot, true)
    hot.emit('vite:beforeUpdate')
    old.unmount()
    hot.emit('vite:afterUpdate')
    await vue.nextTick()
    expect(panel(hotContext()).state.value).toBe(true)
  })

  it('未重建的面板在热更新后清除临时快照', async () => {
    const hot = hotContext()
    panel(hot, true)
    hot.emit('vite:beforeUpdate')
    hot.emit('vite:afterUpdate')
    await vue.nextTick()
    expect(sessionStorage.getItem('dev-hot-state:regression-panel')).toBeNull()
  })

  it('普通关闭不遗留快照，重新打开使用初始状态', () => {
    const hot = hotContext()
    const old = panel(hot, true)
    old.unmount()
    hot.emit('vite:beforeFullReload')
    expect(panel(hotContext()).state.value).toBe(false)
  })

  it('beforeUpdate 与 afterUpdate 之间主动关闭不应恢复已关闭的面板', async () => {
    const hot = hotContext()
    const old = panel(hot, true)
    hot.emit('vite:beforeUpdate')
    old.unmount()
    hot.emit('vite:afterUpdate')
    await vue.nextTick()
    expect(panel(hotContext()).state.value).toBe(false)
  })
})
