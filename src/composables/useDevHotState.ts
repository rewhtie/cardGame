import { nextTick, onBeforeUnmount, type Ref } from 'vue'

export function useDevHotState(
  hot: ImportMeta['hot'],
  name: string,
  refs: Record<string, Ref<unknown>>,
): boolean {
  if (!hot) return false
  const key = `dev-hot-state:${name}`
  let restored = false
  try {
    const raw = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    if (raw) {
      const values = JSON.parse(raw) as Record<string, unknown>
      for (const [name, state] of Object.entries(refs)) {
        if (Object.hasOwn(values, name)) state.value = values[name]
      }
      restored = true
    }
  } catch {
    // 存储不可用时不影响面板使用。
  }
  const save = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify(
        Object.fromEntries(Object.entries(refs).map(([name, state]) => [name, state.value])),
      ))
    } catch {
      // 大型音效草稿可能超出浏览器存储限额。
    }
  }
  let mounted = true
  let updating = false
  const beforeUpdate = () => {
    updating = true
    save()
  }
  const clear = () => {
    void nextTick(() => {
      updating = false
      if (!mounted) return
      try {
        sessionStorage.removeItem(key)
      } catch {
        // 存储不可用时不影响面板使用。
      }
    })
  }
  hot.on('vite:beforeUpdate', beforeUpdate)
  hot.on('vite:afterUpdate', clear)
  hot.on('vite:beforeFullReload', beforeUpdate)
  onBeforeUnmount(() => {
    mounted = false
    hot.off('vite:beforeUpdate', beforeUpdate)
    hot.off('vite:afterUpdate', clear)
    hot.off('vite:beforeFullReload', beforeUpdate)
    if (!updating) {
      try {
        sessionStorage.removeItem(key)
      } catch {
        // 存储不可用时不影响面板使用。
      }
    }
  })
  return restored
}
