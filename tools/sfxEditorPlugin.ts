/// <reference types="node" />
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { renderSfxMap, safeFileName, uniqueName, validateSave, type SaveBody } from './sfxEditorCore'
import { syncDocs } from './docSync'

const SFX_DIR = fileURLToPath(new URL('../src/assets/sfx', import.meta.url))
const MAP_FILE = fileURLToPath(new URL('../src/data/sfxMap.ts', import.meta.url))
const MAX_BODY = 40 * 1024 * 1024

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

/** 本机有 ffmpeg 就压成单声道 48 kbps ogg；失败则返回 false，调用方原样保存 */
function compress(input: string, output: string): boolean {
  const r = spawnSync('ffmpeg', ['-y', '-i', input, '-ac', '1', '-c:a', 'libvorbis', '-b:a', '48k', output], {
    stdio: 'ignore',
  })
  return r.status === 0 && existsSync(output)
}

function save(body: SaveBody): Record<string, string> {
  mkdirSync(SFX_DIR, { recursive: true })
  const existing = readdirSync(SFX_DIR)
  // 先全部校验再落盘：导入文件名清洗后分配最终名字，槽位里引用的原名同步改写
  const taken = new Set(existing)
  const renamed: Record<string, string> = {}
  const plan = body.imports.map((imp) => {
    const safe = safeFileName(imp.name)
    return { imp, safe }
  })
  validateSave(body, existing)
  const ffmpeg = plan.length > 0 && hasFfmpeg()
  const writes: { imp: (typeof plan)[number]['imp']; final: string; compress: boolean }[] = []
  for (const { imp, safe } of plan) {
    const wantCompress = ffmpeg && !safe.endsWith('.ogg')
    const target = wantCompress ? safe.replace(/\.[^.]+$/, '.ogg') : safe
    const final = uniqueName(target, taken)
    taken.add(final)
    renamed[imp.name] = final
    writes.push({ imp, final, compress: wantCompress })
  }
  const map = Object.fromEntries(
    Object.entries(body.map).map(([k, c]) => [
      k,
      c.files ? { ...c, files: c.files.map((f) => renamed[f] ?? f) } : c,
    ]),
  )
  for (const w of writes) {
    const data = Buffer.from(w.imp.dataBase64, 'base64')
    const out = join(SFX_DIR, w.final)
    if (!w.compress) {
      writeFileSync(out, data)
      continue
    }
    const tmp = join(SFX_DIR, `.import-${Date.now()}-${w.final}`)
    // 临时文件保留原扩展名，ffmpeg 靠它识别格式
    const tmpIn = `${tmp}${safeFileName(w.imp.name).slice(safeFileName(w.imp.name).lastIndexOf('.'))}`
    writeFileSync(tmpIn, data)
    try {
      if (!compress(tmpIn, out)) writeFileSync(out, data)
    } finally {
      rmSync(tmpIn, { force: true })
    }
  }
  writeFileSync(MAP_FILE, renderSfxMap(map))
  return renamed
}

/** 仅开发服务器：音效编辑面板通过它导入音效文件并把槽位配置写回 src/data/sfxMap.ts */
export function sfxEditorPlugin(): Plugin {
  return {
    name: 'sfx-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/sfx', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // 自定义请求头会触发跨域预检，避免其他网页向本机开发服务器发起写文件请求
        if (req.headers['x-sfx-editor'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        let tooBig = false
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY) tooBig = true
          else chunks.push(chunk)
        })
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            if (tooBig) throw new Error('导入的文件太大')
            const renamed = save(JSON.parse(Buffer.concat(chunks).toString('utf8')) as SaveBody)
            await syncDocs(server, 'sfx')
            res.end(JSON.stringify({ ok: true, renamed }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
      })
    },
  }
}
