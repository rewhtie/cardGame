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

/** 纸牌燃烧：点火的呼声、持续火焰和细碎爆裂，末尾随余烬淡出。 */
async function playBurnSfx(volume = 1) {
  if (sfxVolume.value <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const c = ctx
    const t0 = c.currentTime
    const out = c.createGain()
    out.gain.setValueAtTime(0.0001, t0)
    out.gain.linearRampToValueAtTime(sfxVolume.value * volume * 0.45, t0 + 0.06)
    out.gain.setValueAtTime(sfxVolume.value * volume * 0.45, t0 + 0.65)
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25)
    out.connect(c.destination)
    noiseBurst(c, out, t0, 0.28, 0.6, 'bandpass', 700, 1800)
    noiseBurst(c, out, t0 + 0.05, 1.15, 0.4, 'lowpass', 2400, 650)
    for (let i = 0; i < 18; i++) {
      const at = t0 + 0.04 + i * 0.055 + Math.random() * 0.025
      noiseBurst(c, out, at, 0.012 + Math.random() * 0.025, 0.12 + Math.random() * 0.22, 'highpass', 1800 + Math.random() * 3200)
    }
    setTimeout(() => out.disconnect(), 1500)
  } catch {
    // 音效失败不能影响游戏
  }
}

export async function playMentalOverloadSfx(signal: AbortSignal) {
  if (sfxVolume.value <= 0 || signal.aborted) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    if (signal.aborted) return
    const c = ctx
    const at = c.currentTime
    const out = c.createGain()
    out.gain.value = sfxVolume.value * 0.45
    out.connect(c.destination)
    const cleanup = () => {
      out.disconnect()
      clearTimeout(timer)
      signal.removeEventListener('abort', cleanup)
    }
    const timer = setTimeout(cleanup, 1700)
    signal.addEventListener('abort', cleanup, { once: true })

    for (let i = 0; i < 3; i++) {
      const cut = at + 0.18 + i * 0.14
      noiseBurst(c, out, cut, 0.12, 0.6 + i * 0.12, 'bandpass', 4200 + i * 600, 800)
      noiseBurst(c, out, cut + 0.025, 0.045, 0.35, 'highpass', 5000)
      const blade = c.createOscillator()
      const gain = c.createGain()
      blade.type = 'triangle'
      blade.frequency.setValueAtTime(1800 + i * 250, cut)
      blade.frequency.exponentialRampToValueAtTime(600, cut + 0.1)
      gain.gain.setValueAtTime(0.18, cut)
      gain.gain.exponentialRampToValueAtTime(0.0001, cut + 0.12)
      blade.connect(gain).connect(out)
      blade.start(cut)
      blade.stop(cut + 0.13)
    }
    noiseBurst(c, out, at + 0.58, 0.08, 0.35, 'highpass', 3800)
    const shatter = at + 0.84
    noiseBurst(c, out, shatter, 0.18, 0.8, 'highpass', 2600)
    noiseBurst(c, out, shatter + 0.03, 0.58, 0.45, 'bandpass', 6500, 2200)
    for (let i = 0; i < 20; i++) {
      const hit = shatter + 0.015 + i * 0.025
      const level = 1 - i / 22
      const hz = 2800 + Math.random() * 6000
      noiseBurst(c, out, hit, 0.018, 0.22 * level, 'highpass', hz)
      for (const ratio of [1, 1.47]) {
        const glass = c.createOscillator()
        const gain = c.createGain()
        glass.type = 'sine'
        glass.frequency.value = hz * ratio
        gain.gain.setValueAtTime(0.09 * level, hit)
        gain.gain.exponentialRampToValueAtTime(0.0001, hit + 0.12)
        glass.connect(gain).connect(out)
        glass.start(hit)
        glass.stop(hit + 0.13)
      }
    }
  } catch {
    // 音效失败不能影响游戏
  }
}

export async function playLifeOverloadSfx(signal: AbortSignal) {
  if (sfxVolume.value <= 0 || signal.aborted) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    if (signal.aborted) return
    const c = ctx
    const at = c.currentTime
    const burst = at + 0.6
    const out = c.createGain()
    out.gain.value = sfxVolume.value * 0.5
    out.connect(c.destination)
    const cleanup = () => {
      out.disconnect()
      clearTimeout(timer)
      signal.removeEventListener('abort', cleanup)
    }
    const timer = setTimeout(cleanup, 1700)
    signal.addEventListener('abort', cleanup, { once: true })

    const hum = c.createOscillator()
    const hg = c.createGain()
    hum.type = 'triangle'
    hum.frequency.setValueAtTime(65, at)
    hum.frequency.exponentialRampToValueAtTime(310, burst)
    hg.gain.setValueAtTime(0.0001, at)
    hg.gain.exponentialRampToValueAtTime(0.7, burst - 0.04)
    hg.gain.linearRampToValueAtTime(0, burst)
    hum.connect(hg).connect(out)
    hum.start(at)
    hum.stop(burst)
    noiseBurst(c, out, at, 0.6, 0.25, 'bandpass', 250, 2200)

    const impact = c.createOscillator()
    const ig = c.createGain()
    impact.frequency.setValueAtTime(160, burst)
    impact.frequency.exponentialRampToValueAtTime(38, burst + 0.3)
    ig.gain.setValueAtTime(0.9, burst)
    ig.gain.exponentialRampToValueAtTime(0.0001, burst + 0.4)
    impact.connect(ig).connect(out)
    impact.start(burst)
    impact.stop(burst + 0.4)
    noiseBurst(c, out, burst, 0.35, 0.85, 'bandpass', 3000, 350)
    noiseBurst(c, out, burst + 0.04, 0.86, 0.45, 'lowpass', 2200, 500)
    for (let i = 0; i < 16; i++) {
      noiseBurst(c, out, burst + 0.05 + i * 0.05, 0.025, 0.18 * (1 - i / 18), 'highpass', 2200 + Math.random() * 3000)
    }
  } catch {
    // 音效失败不能影响游戏
  }
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
 * 合成的长枪出场声，时间轴与 SpearFx 的 1 秒动画对齐：
 * 0s 破空（高频噪声由高扫到低，枪猛地刺出）→ 0.1s 落点闷响 + 金属颤音 → 全程旋转声（气流音色上扬，颤动频率从慢到极快，对应越转越快的翻面）。
 */
export async function playSpearSfx(volume = 1) {
  if (sfxVolume.value <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const c = ctx
    const t0 = c.currentTime
    const DUR = 1.0
    const out = c.createGain()
    out.gain.value = sfxVolume.value * volume * 0.6
    out.connect(c.destination)

    // 风嗖：窄带噪声做出“呜—嗖”的风声。带通中心先急升再回落（物体掠过的多普勒感），
    // 音量 0.09s 内冲到峰值后缓缓散去；再叠一层低通的“空气体积”，让声音不单薄
    const WHOOSH = 0.55
    const wlen = Math.floor(c.sampleRate * WHOOSH)
    const wbuf = c.createBuffer(1, wlen, c.sampleRate)
    const wd = wbuf.getChannelData(0)
    let last = 0
    for (let i = 0; i < wlen; i++) {
      // 一阶低通白噪声 ≈ 粉红噪声，比纯白噪声柔和，更像风
      last = last * 0.82 + (Math.random() * 2 - 1) * 0.18
      wd[i] = last * 3.2
    }
    const wsrc = c.createBufferSource()
    wsrc.buffer = wbuf
    const wbp = c.createBiquadFilter()
    wbp.type = 'bandpass'
    wbp.Q.value = 2.6
    wbp.frequency.setValueAtTime(380, t0)
    wbp.frequency.exponentialRampToValueAtTime(2300, t0 + 0.11)
    wbp.frequency.exponentialRampToValueAtTime(750, t0 + WHOOSH)
    const wg = c.createGain()
    wg.gain.setValueAtTime(0.0001, t0)
    wg.gain.exponentialRampToValueAtTime(1.3, t0 + 0.09)
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + WHOOSH)
    wsrc.connect(wbp).connect(wg).connect(out)
    wsrc.start(t0)

    const body = c.createBiquadFilter()
    body.type = 'lowpass'
    body.frequency.setValueAtTime(700, t0)
    body.frequency.exponentialRampToValueAtTime(180, t0 + 0.4)
    const bg = c.createGain()
    bg.gain.setValueAtTime(0.0001, t0)
    bg.gain.exponentialRampToValueAtTime(0.6, t0 + 0.07)
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42)
    const bsrc = c.createBufferSource()
    bsrc.buffer = wbuf
    bsrc.connect(body).connect(bg).connect(out)
    bsrc.start(t0)

    // 落点：低频闷响 + 金属颤音
    const thud = c.createOscillator()
    const tg = c.createGain()
    thud.type = 'sine'
    thud.frequency.setValueAtTime(150, t0 + 0.1)
    thud.frequency.exponentialRampToValueAtTime(45, t0 + 0.4)
    tg.gain.setValueAtTime(0.0001, t0)
    tg.gain.setValueAtTime(0.9, t0 + 0.1)
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
    thud.connect(tg).connect(out)
    thud.start(t0)
    thud.stop(t0 + 0.5)
    for (const hz of [1760, 2349]) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'triangle'
      o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, t0 + 0.1)
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.115)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8)
      o.connect(g).connect(out)
      o.start(t0 + 0.1)
      o.stop(t0 + 0.85)
    }

    // 旋转声：循环噪声过带通（音调上扬），再被一个越来越快的 LFO 调幅，听感是越转越急的呼呼声
    const len = Math.floor(c.sampleRate * DUR)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(250, t0)
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + DUR)
    const swirl = c.createGain()
    swirl.gain.setValueAtTime(0.0001, t0)
    swirl.gain.exponentialRampToValueAtTime(0.9, t0 + 0.55)
    swirl.gain.setValueAtTime(0.9, t0 + 0.75)
    swirl.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR)
    const am = c.createGain()
    am.gain.value = 0.5
    const lfo = c.createOscillator()
    const lfoDepth = c.createGain()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(3, t0)
    lfo.frequency.exponentialRampToValueAtTime(32, t0 + DUR)
    lfoDepth.gain.value = 0.5
    lfo.connect(lfoDepth).connect(am.gain)
    src.connect(bp).connect(am).connect(swirl).connect(out)
    src.start(t0)
    lfo.start(t0)
    lfo.stop(t0 + DUR + 0.05)
  } catch {
    // 音效失败不能影响游戏
  }
}

/**
 * 剑阵合成音（不依赖素材）：整段一条旋转的呼啸底噪（调制频率越转越快）；
 * 每把剑一声破空（噪声扫频上扬）+ 一声插地（闷响 + 金属颤音）。音高、长短、声像逐把随机。
 * at 为相对现在的秒数（剑开始下落的时刻），pan -1..1 为左右声像，land 为落地耗时。
 */
export async function playSwordArraySfx(swords: { at: number; pan: number; land: number }[]) {
  if (sfxVolume.value <= 0 || !swords.length) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const c = ctx
    const t0 = c.currentTime + 0.02
    const out = c.createGain()
    out.gain.value = sfxVolume.value * 0.6
    out.connect(c.destination)
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)

    // 旋转：锯齿波经带通，音量被一个越来越快的 LFO 切碎，听上去是剑在空中旋转
    const end = Math.max(...swords.map((s) => s.at + s.land)) + 0.1
    const whirl = c.createGain()
    whirl.gain.setValueAtTime(0.0001, t0)
    whirl.gain.exponentialRampToValueAtTime(0.18, t0 + end * 0.6)
    whirl.gain.exponentialRampToValueAtTime(0.0001, t0 + end)
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(500, t0)
    bp.frequency.exponentialRampToValueAtTime(1800, t0 + end)
    bp.Q.value = 3
    const saw = c.createOscillator()
    saw.type = 'sawtooth'
    saw.frequency.setValueAtTime(180, t0)
    saw.frequency.exponentialRampToValueAtTime(420, t0 + end)
    const chop = c.createGain()
    chop.gain.value = 0.5
    const lfo = c.createOscillator()
    const lfoDepth = c.createGain()
    lfo.frequency.setValueAtTime(7, t0)
    lfo.frequency.exponentialRampToValueAtTime(34, t0 + end)
    lfoDepth.gain.value = 0.5
    lfo.connect(lfoDepth).connect(chop.gain)
    saw.connect(bp).connect(chop).connect(whirl).connect(out)
    for (const o of [saw, lfo]) {
      o.start(t0)
      o.stop(t0 + end + 0.05)
    }

    for (const s of swords) {
      const pan = c.createStereoPanner()
      pan.pan.value = s.pan
      pan.connect(out)
      const t = t0 + s.at
      // 破空：高通噪声 + 带通扫频，随下坠音调上扬、响度渐强，落地前一瞬收掉
      const dur = s.land
      const len = Math.max(1, Math.floor(c.sampleRate * dur))
      const buf = c.createBuffer(1, len, c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      const src = c.createBufferSource()
      const f = c.createBiquadFilter()
      const g = c.createGain()
      src.buffer = buf
      f.type = 'bandpass'
      f.Q.value = 1.4
      f.frequency.setValueAtTime(rnd(700, 1100), t)
      f.frequency.exponentialRampToValueAtTime(rnd(3200, 5200), t + dur)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(rnd(0.5, 0.8), t + dur * 0.9)
      g.gain.linearRampToValueAtTime(0, t + dur)
      src.connect(f).connect(g).connect(pan)
      src.start(t)
      // 插地：闷响 + 一记短促的金属颤音；音高逐把随机
      const hit = t + dur
      const pitch = rnd(0.85, 1.2)
      const thud = c.createOscillator()
      const tg = c.createGain()
      thud.type = 'sine'
      thud.frequency.setValueAtTime(170 * pitch, hit)
      thud.frequency.exponentialRampToValueAtTime(45, hit + 0.18)
      tg.gain.setValueAtTime(rnd(0.7, 1), hit)
      tg.gain.exponentialRampToValueAtTime(0.0001, hit + 0.22)
      thud.connect(tg).connect(pan)
      thud.start(hit)
      thud.stop(hit + 0.25)
      noiseBurst(c, pan, hit, 0.09, 0.6, 'bandpass', 2800 * pitch, 700)
      const ring = c.createOscillator()
      const rg = c.createGain()
      ring.type = 'triangle'
      ring.frequency.value = 1900 * pitch
      rg.gain.setValueAtTime(0.0001, hit)
      rg.gain.exponentialRampToValueAtTime(0.14, hit + 0.01)
      rg.gain.exponentialRampToValueAtTime(0.0001, hit + 0.35)
      ring.connect(rg).connect(pan)
      ring.start(hit)
      ring.stop(hit + 0.4)
    }
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
  if (!url) {
    const synths = { evolve: playEvolveSfx, train: playTrainSfx, split: playSplitSfx, burn: playBurnSfx }
    if (config.synth) await synths[config.synth](volume)
    return
  }
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
