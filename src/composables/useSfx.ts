import { ref } from 'vue'

/** 音效名 -> 变体 url；文件命名为 `<name>-<n>.ogg`，同名多个会随机轮换，避免重复听感 */
const files = import.meta.glob('../assets/sfx/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>

export type SfxName = 'coin' | 'heal' | 'hurt' | 'hit' | 'block'

const variants: Record<string, string[]> = {}
for (const [path, url] of Object.entries(files)) {
  const name = /([a-z]+)-\d+\.ogg$/.exec(path)?.[1]
  if (name) (variants[name] ??= []).push(url)
}

const VOLUME_KEY = 'cardfire.sfxVolume'
/** 0~1，模块级单例；写入 localStorage 以便下次启动沿用 */
export const sfxVolume = ref(Number(localStorage.getItem(VOLUME_KEY) ?? 0.6))

export function setSfxVolume(v: number) {
  sfxVolume.value = Math.min(1, Math.max(0, v))
  localStorage.setItem(VOLUME_KEY, String(sfxVolume.value))
}

const buffers = new Map<string, Promise<AudioBuffer | null>>()
let ctx: AudioContext | null = null

function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => (ctx as AudioContext).decodeAudioData(data))
      .catch(() => null)
    buffers.set(url, p)
  }
  return p
}

/** 预解码全部音效，避免第一次播放时的卡顿；需在首次用户交互后（或播放时惰性）调用 */
export function preloadSfx() {
  ctx ??= new AudioContext()
  Object.values(variants).flat().forEach(load)
}

const lastPlayed = new Map<string, number>()

/** 播放一个音效。同名音效 40ms 内只响一次，防止多段伤害叠成爆音 */
export async function playSfx(name: SfxName, volume = 1) {
  const list = variants[name]
  if (!list?.length || sfxVolume.value <= 0) return
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -Infinity) < 40) return
  lastPlayed.set(name, now)
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const buffer = await load(list[Math.floor(Math.random() * list.length)])
    if (!buffer) return
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    src.buffer = buffer
    src.playbackRate.value = 0.95 + Math.random() * 0.1 // 轻微变调，听感更自然
    gain.gain.value = sfxVolume.value * volume
    src.connect(gain).connect(ctx.destination)
    src.start()
  } catch {
    // 音效失败不能影响游戏
  }
}
