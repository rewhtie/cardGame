/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { CardSpec } from '../src/data/cards/cardSpec'
import { cardToCode } from './cardCodegen'

const DIRS = ['warrior', 'doctor']
const RARITIES = ['white', 'blue', 'gold']
const CARDS_DIR = fileURLToPath(new URL('../src/data/cards', import.meta.url))

interface SaveBody {
  dir: string
  /** 卡牌当前所在的稀有度文件 */
  fromRarity: string
  spec: CardSpec
}

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
  if (!DIRS.includes(dir)) throw new Error('未知职业目录')
  if (!RARITIES.includes(fromRarity) || !RARITIES.includes(spec.rarity)) throw new Error('未知稀有度')
  if (!/^\w+$/.test(spec.id)) throw new Error('非法的卡牌 id')
  if (!spec.name.trim()) throw new Error('名称不能为空')
  if (spec.cost !== 'X' && !Number.isInteger(spec.cost)) throw new Error('费用必须是整数或 X')
}

function save(body: SaveBody) {
  validate(body)
  const { dir, fromRarity, spec } = body
  const code = cardToCode(spec).split('\n')

  const src = readLines(fileOf(dir, fromRarity))
  const block = findBlock(src.lines, spec.id)
  if (!block) throw new Error(`在 ${dir}/${fromRarity}.ts 中找不到 ${spec.id}`)

  if (spec.rarity === fromRarity) {
    src.lines.splice(block[0], block[1] - block[0], ...code)
    writeFileSync(fileOf(dir, fromRarity), src.lines.join(src.eol))
    return
  }
  // 换稀有度：从原文件删除，追加到目标文件末尾
  const dest = readLines(fileOf(dir, spec.rarity))
  const close = dest.lines.lastIndexOf(']')
  if (close < 0) throw new Error('目标文件格式异常')
  src.lines.splice(block[0], block[1] - block[0])
  dest.lines.splice(close, 0, ...code)
  writeFileSync(fileOf(dir, fromRarity), src.lines.join(src.eol))
  writeFileSync(fileOf(dir, spec.rarity), dest.lines.join(dest.eol))
}

/** 仅开发服务器：卡牌编辑面板通过它把改动写回 src/data/cards 下的源码 */
export function cardEditorPlugin(): Plugin {
  return {
    name: 'card-editor',
    apply: 'serve',
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
        req.on('end', () => {
          try {
            save(JSON.parse(raw) as SaveBody)
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
