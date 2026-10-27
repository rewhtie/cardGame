import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editorWritesPlugin, writeEditorFile } from './editorWrites'

let directory: string
let file: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'cardfire-editor-write-'))
  file = join(directory, 'cards.ts')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function update(environment: string, path = file) {
  const hook = editorWritesPlugin().hotUpdate as (this: { environment: { name: string } }, options: { file: string }) => unknown
  return hook.call({ environment: { name: environment } }, { file: path })
}

describe('编辑器文件写入热更新拦截', () => {
  it('编辑器写入已有文件不触发客户端热更新', () => {
    writeFileSync(file, 'export const value = 1')
    writeEditorFile(file, 'export const value = 2')
    expect(update('client')).toEqual([])
  })

  it('编辑器新增文件同样被拦截', () => {
    writeEditorFile(file, 'export const value = 1')
    expect(update('client')).toEqual([])
  })

  it('重复的文件监听事件仍被拦截', () => {
    writeEditorFile(file, 'export const value = 1')
    expect(update('client')).toEqual([])
    expect(update('client')).toEqual([])
  })

  it('之后人工修改源码不会被误吞', () => {
    writeEditorFile(file, 'export const value = 1')
    writeFileSync(file, 'export const value = 2')
    expect(update('client')).toBeUndefined()
  })

  it('服务端模块更新不会被客户端拦截规则吞掉', () => {
    writeEditorFile(file, 'export const value = 1')
    expect(update('ssr')).toBeUndefined()
    expect(update('client')).toEqual([])
  })

  it('Windows 文件路径大小写不影响匹配', () => {
    if (process.platform !== 'win32') return
    writeEditorFile(file, 'export const value = 1')
    expect(update('client', file.toUpperCase())).toEqual([])
  })
})
