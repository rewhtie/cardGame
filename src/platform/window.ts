import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import type { DisplayMode, Resolution } from '@/settings/settings'

/** 应用显示模式：Tauri 下控制原生窗口，浏览器下退化为 Fullscreen API */
export async function applyWindowMode(mode: DisplayMode, resolution: Resolution) {
  if (isTauri()) {
    const win = getCurrentWindow()
    if (mode === 'fullscreen') {
      await win.setFullscreen(true)
      return
    }
    await win.setFullscreen(false)
    await win.setSize(new LogicalSize(resolution.width, resolution.height))
    await win.center()
    return
  }

  if (mode === 'fullscreen') {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {})
    }
  } else if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {})
  }
}
