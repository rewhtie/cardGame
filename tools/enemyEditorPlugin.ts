/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { validateEnemyData, type EnemyData } from '../src/data/enemySpec'
import { syncDocs } from './docSync'

const FILE = fileURLToPath(new URL('../src/data/enemies.json', import.meta.url))

function save(data: EnemyData) {
  if (!data || !Array.isArray(data.enemies) || !Array.isArray(data.encounters)) throw new Error('数据格式不对')
  const errors = validateEnemyData(data)
  if (errors.length) throw new Error(errors.join('；'))
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n')
}

/** 仅开发服务器：敌人编辑面板通过它把整份数据写回 src/data/enemies.json */
export function enemyEditorPlugin(): Plugin {
  return {
    name: 'enemy-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/enemies', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        // 自定义请求头会触发跨域预检，避免其他网页向本机开发服务器发起写文件请求
        if (req.headers['x-enemy-editor'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          try {
            save(JSON.parse(raw) as EnemyData)
            await syncDocs(server, 'enemies')
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
