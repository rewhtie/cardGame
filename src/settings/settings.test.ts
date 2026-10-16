import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, fitScale, loadSettings, saveSettings, type Settings } from './settings'

function memoryStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, v: string) => {
      value = v
    },
  }
}

describe('loadSettings / saveSettings', () => {
  it('没有存档时返回默认值', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('保存后能读回', () => {
    const storage = memoryStorage()
    const settings: Settings = { mode: 'fullscreen', resolution: { width: 1920, height: 1080 } }
    saveSettings(storage, settings)
    expect(loadSettings(storage)).toEqual(settings)
  })

  it('存档损坏或非法时回退默认值', () => {
    expect(loadSettings(memoryStorage('{bad json'))).toEqual(DEFAULT_SETTINGS)
    const weird = JSON.stringify({ mode: 'x', resolution: { width: 1, height: 1 } })
    expect(loadSettings(memoryStorage(weird))).toEqual(DEFAULT_SETTINGS)
  })
})

describe('fitScale', () => {
  it('同比例窗口按比例缩放', () => {
    expect(fitScale(1280, 720)).toBe(1)
    expect(fitScale(1920, 1080)).toBe(1.5)
  })

  it('比例不同时取较小者（留黑边）', () => {
    expect(fitScale(2560, 720)).toBe(1)
    expect(fitScale(1280, 1440)).toBe(1)
  })

  it('容器尺寸为 0 时不崩溃', () => {
    expect(fitScale(0, 0)).toBe(1)
  })
})
