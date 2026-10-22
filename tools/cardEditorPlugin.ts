/// <reference types="node" />
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { CardSpec } from '../src/data/cards/cardSpec'
import { cardToCode } from './cardCodegen'
import { syncDocs } from './docSync'

const DIRS = ['warrior', 'doctor', 'swordSaint', 'ancientTree', 'colorless']
const RARITIES = ['white', 'blue', 'gold']
const CARDS_DIR = fileURLToPath(new URL('../src/data/cards', import.meta.url))

interface DeleteBody {
  dir: string
  /** 卡牌当前所在的稀有度文件 */
  rarity: string
  id: string
}

interface SaveBody {
  /** 目标职业目录 */
  dir: string
  /** 卡牌当前所在的职业目录；缺省视为没换职业 */
  fromDir?: string
  /** 卡牌当前所在的稀有度文件 */
  fromRarity: string
  spec: CardSpec
}

/** 编辑器自己刚写入的文件：这些变更不触发整页刷新，否则每次保存都会回到主菜单 */
const ownWrites = new Map<string, number>()
function writeOwn(file: string, text: string) {
  ownWrites.set(resolve(file), Date.now())
  writeFileSync(file, text)
}
const isOwnWrite = (file: string) => Date.now() - (ownWrites.get(resolve(file)) ?? 0) < 3000

const fileOf = (dir: string, rarity: string) => resolve(CARDS_DIR, dir, `${rarity}.ts`)

/** 卡牌块：从 `  Card.xxx('id'` 起，到下一张牌 / 注释 / 数组结尾之前 */
function findBlock(lines: string[], id: string): [number, number] | null {
  const start = lines.findIndex((l) => l.startsWith('  Card.') && l.includes(`('${id}'`))
  if (start < 0) return null
  let end = lines.findIndex((l, i) => i > start && /^(  Card\.|  \/\/|\])/.test(l))
  if (end < 0) end = lines.length
  while (end > start + 1 && lines[end - 1]!.trim() === '') end--
  return [start, end]
}

function readLines(file: string) {
  const text = readFileSync(file, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return { lines: text.split(/\r?\n/), eol }
}

function validate(body: SaveBody) {
  const { dir, fromRarity, spec } = body
  if (!DIRS.includes(dir) || !DIRS.includes(body.fromDir ?? dir)) throw new Error('未知职业目录')
  if (!RARITIES.includes(fromRarity) || !RARITIES.includes(spec.rarity)) throw new Error('未知稀有度')
  if (!/^\w+$/.test(spec.id)) throw new Error('非法的卡牌 id')
  if (!spec.name.trim()) throw new Error('名称不能为空')
  if (spec.cost !== 'X' && !Number.isInteger(spec.cost)) throw new Error('费用必须是整数或 X')
}

function save(body: SaveBody) {
  validate(body)
  const { dir, fromRarity, spec } = body
  const fromDir = body.fromDir ?? dir
  const code = cardToCode(spec).split('\n')

  const src = readLines(fileOf(fromDir, fromRarity))
  const block = findBlock(src.lines, spec.id)
  if (!block) throw new Error(`在 ${fromDir}/${fromRarity}.ts 中找不到 ${spec.id}`)

  if (spec.rarity === fromRarity && dir === fromDir) {
    src.lines.splice(block[0], block[1] - block[0], ...code)
    writeOwn(fileOf(fromDir, fromRarity), src.lines.join(src.eol))
    return
  }
  // 换稀有度或换职业：从原文件删除，追加到目标文件末尾
  const dest = readLines(fileOf(dir, spec.rarity))
  const close = dest.lines.lastIndexOf(']')
  if (close < 0) throw new Error('目标文件格式异常')
  src.lines.splice(block[0], block[1] - block[0])
  dest.lines.splice(close, 0, ...code)
  writeOwn(fileOf(fromDir, fromRarity), src.lines.join(src.eol))
  writeOwn(fileOf(dir, spec.rarity), dest.lines.join(dest.eol))
}

/** 源码里除这张牌自己的代码块以外，还有哪些文件引用了它的 id（进化目标、初始牌组、遗物等） */
function referencedIn(id: string, ownFile: string, block: [number, number]): string[] {
  const dataDir = resolve(CARDS_DIR, '..')
  const files: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(p)
    }
  }
  walk(dataDir)
  // id 已校验为 \w+，可直接拼进正则；匹配被引号 / 反引号包住的整个 id
  const needle = new RegExp('[\'"`]' + id + '[\'"`]')
  const hits: string[] = []
  for (const f of files) {
    const lines = readLines(f).lines.filter((_, i) => !(f === ownFile && i >= block[0] && i < block[1]))
    if (lines.some((l) => needle.test(l))) hits.push(f.slice(dataDir.length + 1).replaceAll('\\', '/'))
  }
  return hits
}

function remove(body: DeleteBody) {
  const { dir, rarity, id } = body
  if (!DIRS.includes(dir) || !RARITIES.includes(rarity)) throw new Error('未知职业目录或稀有度')
  if (!/^\w+$/.test(id)) throw new Error('非法的卡牌 id')
  const file = fileOf(dir, rarity)
  const src = readLines(file)
  const block = findBlock(src.lines, id)
  if (!block) throw new Error(`在 ${dir}/${rarity}.ts 中找不到 ${id}`)
  const refs = referencedIn(id, file, block)
  if (refs.length) throw new Error(`${id} 还被这些文件引用，请先改掉引用：${refs.join('、')}`)
  src.lines.splice(block[0], block[1] - block[0])
  writeOwn(file, src.lines.join(src.eol))
}

/** 仅开发服务器：卡牌编辑面板通过它把改动写回 src/data/cards 下的源码 */
export function cardEditorPlugin(): Plugin {
  return {
    name: 'card-editor',
    apply: 'serve',
    // 保存写回源码后，卡牌数据模块没有可接住热更新的边界，Vite 会整页刷新；
    // 编辑器自己的写入直接吞掉，编辑器里的状态已是最新，要在游戏里看效果时手动刷新页面
    handleHotUpdate({ file }) {
      if (isOwnWrite(file)) return []
    },
    configureServer(server) {
      server.middlewares.use('/__dev/cards', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // 自定义请求头会触发跨域预检，避免其他网页向本机开发服务器发起写文件请求
        if (req.headers['x-card-editor'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw) as (SaveBody | DeleteBody) & { delete?: boolean }
            if (body.delete) remove(body as DeleteBody)
            else save(body as SaveBody)
            // 保存 / 改名 / 换职业 / 删除之后，卡牌清单文档一并更新
            await syncDocs(server, 'cards')
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
      })
    },
  }
}
