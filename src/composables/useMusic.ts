import { ref } from 'vue'
import menuOst from '@/assets/music/menu-ost.mp3'

const VOLUME_KEY = 'cardfire.musicVolume'
/** 0~1，模块级单例；写入 localStorage 以便下次启动沿用 */
export const musicVolume = ref(Number(localStorage.getItem(VOLUME_KEY) ?? 0.4))

let menu: HTMLAudioElement | undefined

export function setMusicVolume(v: number) {
  musicVolume.value = Math.min(1, Math.max(0, v))
  localStorage.setItem(VOLUME_KEY, String(musicVolume.value))
  if (menu) menu.volume = musicVolume.value
}

/** 主菜单 BGM 循环播放；浏览器会拦截自动播放，被拦截时等第一次点击再放 */
export function playMenuMusic() {
  menu ??= Object.assign(new Audio(menuOst), { loop: true })
  menu.volume = musicVolume.value
  if (!menu.paused) return
  menu.play().catch(() => {
    const retry = () => void menu?.play().catch(() => {})
    window.addEventListener('pointerdown', retry, { once: true })
  })
}

/** 停止并回到开头，下次回到主菜单会从头播放 */
export function stopMenuMusic() {
  if (!menu) return
  menu.pause()
  menu.currentTime = 0
}
