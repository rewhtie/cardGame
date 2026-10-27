import { ref } from 'vue'
import menuOst from '@/assets/music/menu-ost.mp3'
import runOst from '@/assets/music/battle-ost.mp3'
import lifeOverloadOst from '@/assets/music/life-overload-ost.mp3'

const VOLUME_KEY = 'cardfire.musicVolume'
/** 0~1，模块级单例；写入 localStorage 以便下次启动沿用 */
export const musicVolume = ref(Number(localStorage.getItem(VOLUME_KEY) ?? 0.4))

type Track = 'menu' | 'run' | 'lifeOverload'
const tracks: Partial<Record<Track, HTMLAudioElement>> = {}
const retries: Partial<Record<Track, () => void>> = {}
const gains: Partial<Record<Track, number>> = {}
const fades: Partial<Record<Track, number>> = {}
const stopping = new Set<Track>()

function cancelFade(key: Track) {
  const frame = fades[key]
  if (frame !== undefined) cancelAnimationFrame(frame)
  delete fades[key]
}

function fade(key: Track, target: number, duration: number, done?: () => void) {
  const t = tracks[key]
  if (!t) return
  cancelFade(key)
  const from = gains[key] ?? 1
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const gain = from + (target - from) * progress
    gains[key] = gain
    t.volume = musicVolume.value * gain
    if (progress < 1) fades[key] = requestAnimationFrame(step)
    else {
      delete fades[key]
      done?.()
    }
  }
  fades[key] = requestAnimationFrame(step)
}

export function setMusicVolume(v: number) {
  musicVolume.value = Math.min(1, Math.max(0, v))
  localStorage.setItem(VOLUME_KEY, String(musicVolume.value))
  for (const key of Object.keys(tracks) as Track[]) {
    const t = tracks[key]
    if (t) t.volume = musicVolume.value * (gains[key] ?? 1)
  }
}

/** 循环播放；浏览器会拦截自动播放，被拦截时等第一次点击再放 */
function play(key: Track, src: string, fadeMs = 0) {
  const t = (tracks[key] ??= Object.assign(new Audio(src), { loop: true }))
  if (stopping.has(key)) stop(key)
  if (!t.paused || retries[key]) return
  cancelFade(key)
  gains[key] = fadeMs > 0 ? 0 : 1
  t.volume = musicVolume.value * gains[key]
  const attempt = () => {
    void t.play().then(() => {
      if (retries[key] !== attempt) return
      delete retries[key]
      window.removeEventListener('pointerdown', attempt)
      if (fadeMs > 0) fade(key, 1, fadeMs)
    }).catch(() => {
      if (retries[key] === attempt) window.addEventListener('pointerdown', attempt, { once: true })
    })
  }
  retries[key] = attempt
  attempt()
}

/** 停止并回到开头，下次再放会从头播放 */
function stop(key: Track) {
  stopping.delete(key)
  cancelFade(key)
  delete gains[key]
  const retry = retries[key]
  if (retry) window.removeEventListener('pointerdown', retry)
  delete retries[key]
  const t = tracks[key]
  if (!t) return
  t.pause()
  t.currentTime = 0
}

export const playMenuMusic = () => play('menu', menuOst)
export const stopMenuMusic = () => stop('menu')
/** 战斗 BGM 暂时不适配，先屏蔽；曲目与槽位保留，改成 true 即恢复 */
const RUN_MUSIC_ENABLED = false
export const playRunMusic = () => {
  if (RUN_MUSIC_ENABLED) play('run', runOst)
}
export const stopRunMusic = () => stop('run')
export const playLifeOverloadMusic = () => {
  stopRunMusic()
  stopMenuMusic()
  play('lifeOverload', lifeOverloadOst, 2000)
}
export const stopLifeOverloadMusic = () => {
  const key: Track = 'lifeOverload'
  if (stopping.has(key)) return
  const t = tracks[key]
  if (!t || t.paused || retries[key]) {
    stop(key)
    return
  }
  stopping.add(key)
  fade(key, 0, 1000, () => stop(key))
}
