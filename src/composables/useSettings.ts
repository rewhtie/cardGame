import { ref } from 'vue'
import { applyWindowMode } from '@/platform/window'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type DisplayMode,
  type Resolution,
  type Settings,
} from '@/settings/settings'

// 模块级单例：整个应用共享一份设置
const settings = ref<Settings>(loadSettings(localStorage))

async function apply() {
  try {
    await applyWindowMode(settings.value.mode, settings.value.resolution)
  } catch (error) {
    console.error('应用窗口设置失败', error)
  }
}

function update(next: Settings) {
  settings.value = next
  saveSettings(localStorage, next)
  return apply()
}

export function useSettings() {
  return {
    settings,
    /** 启动时调用一次，把存档里的设置应用到窗口 */
    init: apply,
    setMode: (mode: DisplayMode) => update({ ...settings.value, mode }),
    setResolution: (resolution: Resolution) => update({ ...settings.value, resolution }),
    reset: () => update({ ...DEFAULT_SETTINGS }),
  }
}
