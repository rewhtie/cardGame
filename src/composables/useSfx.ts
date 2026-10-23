import { ref } from 'vue'
import { sfxMap } from '@/data/sfxMap'
import { pickFile, shouldPlay, type SfxMap } from './sfxResolve'

/** 文件名 -> url；槽位配置里写明确的文件名，同槽位多个文件时每次随机取一个 */
const files = import.meta.glob('../assets/sfx/*.{ogg,mp3,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const urls: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) urls[path.slice(path.lastIndexOf('/') + 1)] = url

/** 音效库：src/assets/sfx/ 下所有可用的音频文件名 */
export const sfxLibrary: string[] = Object.keys(urls).sort()
export const sfxUrl = (name: string): string | undefined => urls[name]

/** 编辑面板用：登记一个尚未保存的导入文件（blob url），让草稿也能试听；保存或放弃后撤销 */
export function registerSfxPreview(name: string, url: string) {
  urls[name] = url
}
export function unregisterSfxPreview(name: string) {
  if (!sfxLibrary.includes(name)) delete urls[name]
}

/** 编辑面板的草稿覆盖：非空时优先于已保存的配置，用来试听未保存的改动 */
let draft: SfxMap | null = null
export function setSfxDraft(map: SfxMap | null) {
  draft = map
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
  Object.values(urls).forEach(load)
}

const lastPlayed = new Map<string, number>()

/** 合成：一小段带衰减的噪声（裂纹的“咔”、碎片的“哗啦”）；filter 为 highpass / bandpass 的中心频率 */
function noiseBurst(c: AudioContext, out: AudioNode, at: number, dur: number, gain: number, type: BiquadFilterType, freq: number, freqEnd = freq) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  const f = c.createBiquadFilter()
  const g = c.createGain()
  src.buffer = buf
  f.type = type
  f.frequency.setValueAtTime(freq, at)
  if (freqEnd !== freq) f.frequency.exponentialRampToValueAtTime(freqEnd, at + dur)
  g.gain.setValueAtTime(gain, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(f).connect(g).connect(out)
  src.start(at)
}

/** 合成的训练声（成长未满）：短促的蓄力嗡鸣，两声裂纹“咔”，收尾一记低沉的闷响，不爆发 */
async function playTrainSfx(volume = 1) {
  if (sfxVolume.value <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const c = ctx
    const t0 = c.currentTime
    const out = c.createGain()
    out.gain.value = sfxVolume.value * volume * 0.5
    out.connect(c.destination)
    const hum = c.createGain()
    hum.gain.setValueAtTime(0.0001, t0)
    hum.gain.exponentialRampToValueAtTime(0.3, t0 + 0.9)
    hum.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3)
    hum.connect(out)
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(130, t0)
    o.frequency.exponentialRampToValueAtTime(260, t0 + 1.0)
    o.connect(hum)
    o.start(t0)
    o.stop(t0 + 1.35)
    ;[0.35, 0.7].forEach((t, i) => noiseBurst(c, out, t0 + t, 0.07, 0.5 + i * 0.2, 'highpass', 3800 + i * 600))
    const thud = c.createOscillator()
    const tg = c.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(120, t0 + 1.0)
    thud.frequency.exponentialRampToValueAtTime(50, t0 + 1.3)
    tg.gain.setValueAtTime(0.7, t0 + 1.0)
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35)
    thud.connect(tg).connect(out)
    thud.start(t0 + 1.0)
    thud.stop(t0 + 1.4)
  } catch {
    // 音效失败不能影响游戏
  }
}

/**
 * 合成的卡牌成长声，时间轴与 RelicReveal 的成长动画对齐：
 * 0~1.5s 蓄力（低频嗡鸣渐升渐强 + 六声越来越响的裂纹“咔”），1.5s 爆发（低频冲击 + 碎片哗啦 + 一串上行的晶体和弦）。
 */
async function playEvolveSfx(volume = 1) {
  if (sfxVolume.value <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const c = ctx
    const t0 = c.currentTime
    const BURST = 1.5
    const out = c.createGain()
    out.gain.value = sfxVolume.value * volume * 0.55
    out.connect(c.destination)

    // 蓄力嗡鸣：双锯齿略失谐，音高与音量一路上扬，爆发前一瞬收掉
    const hum = c.createGain()
    hum.gain.setValueAtTime(0.0001, t0)
    hum.gain.exponentialRampToValueAtTime(0.5, t0 + BURST - 0.05)
    hum.gain.linearRampToValueAtTime(0, t0 + BURST)
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(300, t0)
    lp.frequency.exponentialRampToValueAtTime(2400, t0 + BURST)
    lp.connect(hum).connect(out)
    for (const detune of [-8, 8]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(110, t0)
      o.frequency.exponentialRampToValueAtTime(440, t0 + BURST)
      o.connect(lp)
      o.start(t0)
      o.stop(t0 + BURST + 0.02)
    }

    // 裂纹：与动画里六条裂纹生长的起点同步，越来越响
    ;[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].forEach((t, i) => {
      noiseBurst(c, out, t0 + t, 0.06, 0.35 + i * 0.1, 'highpass', 3500 + i * 500)
    })

    // 爆发：低频冲击
    const thud = c.createOscillator()
    const tg = c.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(180, t0 + BURST)
    thud.frequency.exponentialRampToValueAtTime(40, t0 + BURST + 0.4)
    tg.gain.setValueAtTime(1, t0 + BURST)
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + BURST + 0.45)
    thud.connect(tg).connect(out)
    thud.start(t0 + BURST)
    thud.stop(t0 + BURST + 0.5)
    // 爆发：冲击波的“呼”与碎片的哗啦
    noiseBurst(c, out, t0 + BURST, 0.6, 0.9, 'bandpass', 5000, 400)
    for (let i = 0; i < 8; i++) noiseBurst(c, out, t0 + BURST + 0.04 + i * 0.05 + Math.random() * 0.03, 0.05, 0.5, 'highpass', 5000 + Math.random() * 3000)
    // 爆发：晶体和弦，自低向高依次点亮
    ;[659.25, 830.61, 987.77, 1318.5, 1661.2].forEach((hz, i) => {
      const at = t0 + BURST + 0.05 + i * 0.07
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'triangle'
      o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1)
      o.connect(g).connect(out)
      o.start(at)
      o.stop(at + 1.15)
    })
  } catch {
    // 音效失败不能影响游戏
  }
}

/** 合成的黏液分裂声：一串音高上扬的"咕啾"气泡 + 湿润的噪声拖尾，不依赖素材文件 */
async function playSplitSfx(volume = 1) {
  if (sfxVolume.value <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const t0 = ctx.currentTime
    const level = sfxVolume.value * volume * 0.5
    const out = ctx.createGain()
    out.gain.value = level
    out.connect(ctx.destination)

    const bubbles = 6
    for (let i = 0; i < bubbles; i++) {
      const start = t0 + i * 0.07 + Math.random() * 0.03
      const dur = 0.09 + Math.random() * 0.07
      const base = 90 + Math.random() * 90
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(base, start)
      osc.frequency.exponentialRampToValueAtTime(base * (2.4 + Math.random()), start + dur)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(1 - i * 0.1, start + dur * 0.25)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(g).connect(out)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    }

    const len = Math.floor(ctx.sampleRate * 0.5)
    const noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const ng = ctx.createGain()
    src.buffer = noise
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, t0)
    filter.frequency.exponentialRampToValueAtTime(180, t0 + 0.5)
    ng.gain.setValueAtTime(0.35, t0)
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
    src.connect(filter).connect(ng).connect(out)
    src.start(t0)
  } catch {
    // 音效失败不能影响游戏
  }
}

/**
 * 按槽位键播放。未配置 / 静音的槽位静默不播；同一槽位 40ms 内只响一次，防止多段伤害叠成爆音。
 * opts 覆盖槽位配置（遗物展示的敲击音量渐变用）；maxSeconds 只播放开头这么多秒（末尾淡出）。
 */
export async function playSfx(slot: string, opts?: { volume?: number; maxSeconds?: number }) {
  const config = (draft ?? sfxMap)[slot]
  if (!config || config.silent || sfxVolume.value <= 0) return
  const now = performance.now()
  if (!shouldPlay(lastPlayed.get(slot), now)) return
  const file = pickFile(config, Math.random)
  const url = file ? urls[file] : undefined
  if (!url && !config.synth) return
  lastPlayed.set(slot, now)
  const volume = (config.volume ?? 1) * (opts?.volume ?? 1)
  if (!url) return void (await (config.synth === 'evolve' ? playEvolveSfx(volume) : config.synth === 'train' ? playTrainSfx(volume) : playSplitSfx(volume)))
  const maxSeconds = opts?.maxSeconds ?? config.maxSeconds
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const buffer = await load(url)
    if (!buffer) return
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    src.buffer = buffer
    const rate = 0.95 + Math.random() * 0.1 // 轻微变调，听感更自然
    src.playbackRate.value = rate
    const level = sfxVolume.value * volume
    gain.gain.value = level
    src.connect(gain).connect(ctx.destination)
    if (maxSeconds !== undefined && maxSeconds < buffer.duration) {
      // 截取开头一段：最后 80ms 线性淡出，避免硬切产生爆音
      const real = maxSeconds / rate
      const end = ctx.currentTime + real
      gain.gain.setValueAtTime(level, end - 0.08)
      gain.gain.linearRampToValueAtTime(0, end)
      src.start(0, 0, maxSeconds)
    } else {
      src.start()
    }
  } catch {
    // 音效失败不能影响游戏
  }
}
