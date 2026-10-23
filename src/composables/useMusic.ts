import { ref } from 'vue'
import menuOst from '@/assets/music/menu-ost.mp3'
import runOst from '@/assets/music/battle-ost.mp3'

const VOLUME_KEY = 'cardfire.musicVolume'
/** 0~1，模块级单例；写入 localStorage 以便下次启动沿用 */
export const musicVolume = ref(Number(localStorage.getItem(VOLUME_KEY) ?? 0.4))

type Track = 'menu' | 'run'
const tracks: Partial<Record<Track, HTMLAudioElement>> = {}

export function setMusicVolume(v: number) {
  musicVolume.value = Math.min(1, Math.max(0, v))
  localStorage.setItem(VOLUME_KEY, String(musicVolume.value))
  for (const t of Object.values(tracks)) t.volume = musicVolume.value
}

/** 循环播放；浏览器会拦截自动播放，被拦截时等第一次点击再放 */
function play(key: Track, src: string) {
  const t = (tracks[key] ??= Object.assign(new Audio(src), { loop: true }))
  t.volume = musicVolume.value
  if (!t.paused) return
  t.play().catch(() => {
    const retry = () => void t.play().catch(() => {})
    window.addEventListener('pointerdown', retry, { once: true })
  })
}

/** 停止并回到开头，下次再放会从头播放 */
function stop(key: Track) {
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
