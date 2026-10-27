/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { writeEditorFile as writeFileSync } from './editorWrites'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import type { EnemyData } from '../src/data/enemySpec'
import {
  renderCardsDoc,
  renderEnemiesDoc,
  renderSfxDoc,
  renderStatusesDoc,
  type CardGroup,
  type DocCard,
  type DocSlot,
  type DocStatus,
} from './docSyncCore'

export type DocKind = 'cards' | 'enemies' | 'sfx' | 'statuses'

const DIR = fileURLToPath(new URL('../docs/generated/', import.meta.url))
const ENEMIES_JSON = fileURLToPath(new URL('../src/data/enemies.json', import.meta.url))
const FILES: Record<DocKind, string> = {
  cards: 'cards.md',
  enemies: 'enemies.md',
  sfx: 'sfx.md',
  statuses: 'statuses.md',
}

/** 数据模块要拿最新的：先清掉模块缓存，再让 Vite 按当前磁盘内容重新加载 */
async function load<T>(server: ViteDevServer, path: string): Promise<T> {
  server.environments.ssr!.moduleGraph.invalidateAll()
  return (await server.ssrLoadModule(path)) as T
}

async function renderCards(server: ViteDevServer): Promise<string> {
  const idx = await load<{
    cards: Record<string, DocCard & { upgraded?: unknown }>
    classAllIds: Record<string, string[]>
    colorlessAllIds: string[]
    exclusiveAllIds: string[]
  }>(server, '/src/data/cards/index.ts')
  const { characters } = await load<{ characters: { id: string; name: string }[] }>(
    server,
    '/src/data/characters.ts',
  )
  const { resolveCards, upgradedId } = await load<{
    resolveCards: (c: Record<string, unknown>, ids: string[]) => Record<string, DocCard>
    upgradedId: (id: string) => string
  }>(server, '/src/engine/enchant.ts')
  const ids = Object.keys(idx.cards)
  const upIds = ids.filter((id) => idx.cards[id]!.upgraded).map(upgradedId)
  const up = resolveCards(idx.cards, upIds)
  const docCards: Record<string, DocCard> = Object.fromEntries(
    ids.map((id) => {
      const c = idx.cards[id]!
      const u = up[upgradedId(id)]
      return [
        id,
        {
          id,
          name: c.name,
          cost: c.cost,
          kind: c.kind,
          rarity: c.rarity,
          text: c.text,
          upgradedText: u && u.text !== c.text ? u.text : '',
        },
      ]
    }),
  )
  const nameOf = (dir: string) => characters.find((c) => c.id === dir)?.name ?? dir
  const groups: CardGroup[] = [
    ...Object.entries(idx.classAllIds).map(([dir, list]) => ({ title: nameOf(dir), ids: list })),
    { title: '无色', ids: idx.colorlessAllIds },
    { title: '专属牌', ids: idx.exclusiveAllIds },
  ]
  return renderCardsDoc(docCards, groups)
}

async function renderSfx(server: ViteDevServer): Promise<string> {
  const { sfxMap } = await load<{ sfxMap: Record<string, { files?: string[] }> }>(
    server,
    '/src/data/sfxMap.ts',
  )
  const { SFX_SLOTS } = await load<{ SFX_SLOTS: DocSlot[] }>(server, '/src/data/sfxSlots.ts')
  return renderSfxDoc(sfxMap, SFX_SLOTS)
}

async function renderStatuses(server: ViteDevServer): Promise<string> {
  const { STATUSES } = await load<{ STATUSES: DocStatus[] }>(server, '/src/engine/statuses.ts')
  return renderStatusesDoc(STATUSES)
}

const renderers: Record<DocKind, (server: ViteDevServer) => Promise<string>> = {
  statuses: renderStatuses,
  cards: renderCards,
  enemies: async () =>
    renderEnemiesDoc(JSON.parse(readFileSync(ENEMIES_JSON, 'utf8')) as EnemyData),
  sfx: renderSfx,
}

/**
 * 重写 docs/generated 下对应的数据文档。内容没变就不写，避免无谓改动。
 * 文档生成失败只告警，不影响面板自己的保存结果。
 */
export async function syncDocs(server: ViteDevServer, ...kinds: DocKind[]) {
  for (const kind of kinds) {
    try {
      const text = await renderers[kind](server)
      const file = DIR + FILES[kind]
      if (existsSync(file) && readFileSync(file, 'utf8') === text) continue
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
    } catch (err) {
      server.config.logger.warn(`[doc-sync] ${FILES[kind]} 更新失败：${(err as Error).message}`)
    }
  }
}

/** 开发服务器启动时把所有数据文档对齐一次，之后由各编辑面板在保存 / 删除后各自更新 */
export function docSyncPlugin(): Plugin {
  return {
    name: 'doc-sync',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once(
        'listening',
        () => void syncDocs(server, 'cards', 'enemies', 'sfx', 'statuses'),
      )
    },
  }
}
