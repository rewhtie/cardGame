import { describe, expect, it } from 'vitest'
import { renderSfxMap, safeFileName, uniqueName, validateSave, type SaveBody } from './sfxEditorCore'

describe('safeFileName', () => {
  it('去掉路径与非法字符，保留小写扩展名', () => {
    const n = safeFileName('../hack!.OGG')
    expect(n).toMatch(/^[A-Za-z0-9_-]+\.ogg$/)
    expect(n).not.toContain('/')
    expect(n).not.toContain('..')
  })
  it('扩展名不合法抛错', () => {
    expect(() => safeFileName('a.exe')).toThrow()
  })
})

describe('uniqueName', () => {
  it('重名自动加序号', () => {
    const taken = new Set(['coin.ogg'])
    expect(uniqueName('coin.ogg', taken)).toBe('coin-2.ogg')
    taken.add('coin-2.ogg')
    expect(uniqueName('coin.ogg', taken)).toBe('coin-3.ogg')
    expect(uniqueName('new.ogg', taken)).toBe('new.ogg')
  })
})

describe('validateSave', () => {
  const body = (map: SaveBody['map'], imports: SaveBody['imports'] = []): SaveBody => ({ map, imports })
  const disk = ['coin-1.ogg']
  it('合法保存通过', () => {
    expect(() => validateSave(body({ 'run.gold.gain': { files: ['coin-1.ogg'], volume: 1.5 } }), disk)).not.toThrow()
  })
  it('未知槽位键抛错', () => {
    expect(() => validateSave(body({ 'nope.x': { files: [] } }), disk)).toThrow()
  })
  it('文件名含路径抛错', () => {
    for (const f of ['../x.ogg', 'a/b.ogg', 'a\\b.ogg'])
      expect(() => validateSave(body({ 'run.gold.gain': { files: [f] } }), disk)).toThrow()
  })
  it('引用不存在的文件抛错，引用导入的新文件通过', () => {
    expect(() => validateSave(body({ 'run.gold.gain': { files: ['new.ogg'] } }), disk)).toThrow()
    expect(() =>
      validateSave(body({ 'run.gold.gain': { files: ['new.ogg'] } }, [{ name: 'new.ogg', dataBase64: 'AA==' }]), disk),
    ).not.toThrow()
  })
  it('volume / maxSeconds 越界抛错', () => {
    expect(() => validateSave(body({ 'run.gold.gain': { volume: 9 } }), disk)).toThrow()
    expect(() => validateSave(body({ 'run.gold.gain': { volume: -1 } }), disk)).toThrow()
    expect(() => validateSave(body({ 'run.gold.gain': { maxSeconds: 0 } }), disk)).toThrow()
  })
})

describe('renderSfxMap', () => {
  const parse = (src: string) => {
    const m = /export const sfxMap: SfxMap = (\{[\s\S]*\})\n$/.exec(src)
    return new Function(`return ${m![1]}`)()
  }
  it('空表合法', () => {
    expect(renderSfxMap({})).toContain('export const sfxMap: SfxMap = {}')
  })
  it('键按字母序', () => {
    const src = renderSfxMap({ 'run.gold.gain': { silent: true }, 'battle.heal.player': { silent: true } })
    expect(src.indexOf('battle.heal.player')).toBeLessThan(src.indexOf('run.gold.gain'))
  })
  it('输出可解析回原值', () => {
    const map = {
      'battle.enemy.split': { synth: 'split' as const, volume: 0.8 },
      'run.gold.gain': { silent: true },
      'run.forge.upgrade': { files: ['forge-1.ogg'], maxSeconds: 0.5 },
    }
    expect(parse(renderSfxMap(map))).toEqual(map)
  })
})

describe('Windows 文件系统兼容', () => {
  it('uniqueName 不区分大小写，避免覆盖已有文件', () => {
    expect(uniqueName('Hit-1.ogg', new Set(['hit-1.ogg']))).toBe('Hit-1-2.ogg')
  })
  it('safeFileName 不产生设备保留名', () => {
    expect(safeFileName('con.ogg')).not.toMatch(/^con\./i)
    expect(safeFileName('NUL.wav')).not.toMatch(/^nul\./i)
  })
})
