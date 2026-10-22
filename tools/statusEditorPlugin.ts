/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { syncDocs } from './docSync'

const FILE = fileURLToPath(new URL('../src/data/statusText.json', import.meta.url))
const RULES_FILE = fileURLToPath(new URL('../src/data/statusRules.json', import.meta.url))
const DECAYS = ['none', 'tick', 'turnEnd', 'playerTurnStart', 'halve', 'condition']
const TIMINGS = ['playerStart', 'playerEnd', 'enemyStart', 'enemyEnd']

function saveRules(data: Record<string, { decay?: string; decayAt?: string; triggerAt?: string }>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('数据格式不对')
  for (const [k, r] of Object.entries(data)) {
    if (r.decay !== undefined && !DECAYS.includes(r.decay)) throw new Error(`${k} 的持续方式不合法`)
    for (const t of [r.decayAt, r.triggerAt]) if (t !== undefined && !TIMINGS.includes(t)) throw new Error(`${k} 的时点不合法`)
  }
  writeFileSync(RULES_FILE, JSON.stringify(data, null, 2) + '\n')
}

function save(data: Record<string, string>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('数据格式不对')
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${k} 的说明不能为空`)
  }
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n')
}

/** 仅开发服务器：状态面板通过它把说明文字覆盖写回 src/data/statusText.json */
export function statusEditorPlugin(): Plugin {
  return {
    name: 'status-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/status-text', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // 自定义请求头会触发跨域预检，避免其他网页向本机开发服务器发起写文件请求
        if (req.headers['x-status-editor'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            save(JSON.parse(raw) as Record<string, string>)
            await syncDocs(server, 'statuses')
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }))
          }
        })
      })
      server.middlewares.use('/__dev/status-rules', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // 自定义请求头会触发跨域预检，避免其他网页向本机开发服务器发起写文件请求
        if (req.headers['x-status-editor'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            saveRules(JSON.parse(raw))
            await syncDocs(server, 'statuses')
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
