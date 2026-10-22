import { SLOT_KEYS } from '../src/data/sfxSlots'
import type { SfxMap, SlotConfig } from '../src/composables/sfxResolve'

export interface ImportFile {
  name: string
  dataBase64: string
}
export interface SaveBody {
  map: SfxMap
  imports: ImportFile[]
}

const EXTS = ['.ogg', '.mp3', '.wav']

/** 只留字母、数字、-、_ 与小写扩展名；路径部分一律丢弃，扩展名不合法则抛错 */
export function safeFileName(raw: string): string {
  const base = raw.slice(Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  const ext = dot < 0 ? '' : base.slice(dot).toLowerCase()
  if (!EXTS.includes(ext)) throw new Error(`不支持的音频格式：${raw}（仅 ogg / mp3 / wav）`)
  let stem = base.slice(0, dot).replace(/[^A-Za-z0-9_-]/g, '') || 'sfx'
  // Windows 设备保留名（con、nul、com1……）不能当文件名
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) stem = `sfx-${stem}`
  return `${stem}${ext}`
}

/** 重名时在扩展名前加 -2、-3……，不覆盖已有文件 */
export function uniqueName(name: string, taken: Set<string>): string {
  // Windows / macOS 文件系统不区分大小写，按小写比较才不会覆盖已有文件
  const lower = new Set([...taken].map((t) => t.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = name.slice(0, dot)
  const ext = name.slice(dot)
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
}

/** 先全部校验，通过后才允许落盘 */
export function validateSave(body: SaveBody, existingFiles: string[]): void {
  const known = new Set([...existingFiles, ...body.imports.map((i) => i.name)])
  for (const [key, c] of Object.entries(body.map)) {
    if (!SLOT_KEYS.has(key)) throw new Error(`未知的槽位：${key}`)
    for (const f of c.files ?? []) {
      if (/[/\\]/.test(f) || f.includes('..') || !EXTS.some((e) => f.endsWith(e)))
        throw new Error(`非法的文件名：${f}`)
      if (!known.has(f)) throw new Error(`${key} 引用的文件不存在：${f}`)
    }
    if (c.volume !== undefined && !(c.volume >= 0 && c.volume <= 3))
      throw new Error(`${key} 的音量必须在 0~3 之间`)
    if (c.maxSeconds !== undefined && !(c.maxSeconds > 0))
      throw new Error(`${key} 的截取秒数必须大于 0`)
    if (c.synth !== undefined && c.synth !== 'split') throw new Error(`${key} 的合成音类型未知`)
  }
}

const q = (s: string) => `'${s}'`

function renderConfig(c: SlotConfig): string {
  const parts: string[] = []
  if (c.files) parts.push(`files: [${c.files.map(q).join(', ')}]`)
  if (c.volume !== undefined) parts.push(`volume: ${c.volume}`)
  if (c.maxSeconds !== undefined) parts.push(`maxSeconds: ${c.maxSeconds}`)
  if (c.silent) parts.push('silent: true')
  if (c.synth) parts.push(`synth: ${q(c.synth)}`)
  return `{ ${parts.join(', ')} }`
}

/** 生成 src/data/sfxMap.ts 的完整源码：键按字母序、格式固定，便于 diff */
export function renderSfxMap(map: SfxMap): string {
  const head = "import type { SfxMap } from '@/composables/sfxResolve'\n\n"
  const keys = Object.keys(map).sort()
  if (!keys.length) return `${head}export const sfxMap: SfxMap = {}\n`
  const body = keys.map((k) => `  ${q(k)}: ${renderConfig(map[k]!)},\n`).join('')
  return `${head}export const sfxMap: SfxMap = {\n${body}}\n`
}
