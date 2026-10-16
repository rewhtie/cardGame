export interface Resolution {
  width: number
  height: number
}

export type DisplayMode = 'windowed' | 'fullscreen'

export interface Settings {
  mode: DisplayMode
  resolution: Resolution
}

/** 游戏画面的设计分辨率，所有布局都基于它，再整体缩放到窗口 */
export const DESIGN_SIZE: Resolution = { width: 1280, height: 720 }

export const RESOLUTIONS: readonly Resolution[] = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
]

export const DEFAULT_SETTINGS: Settings = {
  mode: 'windowed',
  resolution: { width: 1280, height: 720 },
}

const STORAGE_KEY = 'cardfire.settings'

export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    const mode: DisplayMode = parsed.mode === 'fullscreen' ? 'fullscreen' : 'windowed'
    const resolution =
      RESOLUTIONS.find(
        (r) => r.width === parsed.resolution?.width && r.height === parsed.resolution?.height,
      ) ?? DEFAULT_SETTINGS.resolution
    return { mode, resolution }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: Settings) {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** 等比缩放系数：让设计分辨率完整放进容器 */
export function fitScale(containerWidth: number, containerHeight: number): number {
  if (containerWidth <= 0 || containerHeight <= 0) return 1
  return Math.min(containerWidth / DESIGN_SIZE.width, containerHeight / DESIGN_SIZE.height)
}
