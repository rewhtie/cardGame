/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const writes = new Map<string, string>()
const keyOf = (file: string) => {
  const path = resolve(file)
  return process.platform === 'win32' ? path.toLowerCase() : path
}
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

export function markEditorWrite(file: string) {
  writes.set(keyOf(file), hash(readFileSync(file)))
}

export function writeEditorFile(file: string, data: string | Buffer) {
  writeFileSync(file, data)
  markEditorWrite(file)
}

export function editorWritesPlugin(): Plugin {
  return {
    name: 'editor-writes',
    apply: 'serve',
    enforce: 'pre',
    hotUpdate({ file }) {
      if (this.environment.name !== 'client') return
      const key = keyOf(file)
      const expected = writes.get(key)
      if (!expected) return
      try {
        if (hash(readFileSync(file)) === expected) return []
      } catch {
        // 删除的文件仍交给 Vite 处理。
      }
      writes.delete(key)
    },
  }
}
