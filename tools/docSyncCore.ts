import type { ActionSpec, EnemyData, EnemySpec, IntentSpec } from '../src/data/enemySpec'

/**
 * 编辑面板对应的数据文档渲染：纯函数，输入真实数据，输出 Markdown。
 * 文档放在 docs/generated/，每次面板保存 / 删除后整份重写，不手改。
 */
export const GENERATED_NOTE = '<!-- 自动生成：编辑面板保存 / 删除时会重写这份文件，请勿手改 -->'

const cell = (s: unknown) =>
  String(s ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>')
const table = (head: string[], rows: unknown[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')

export interface DocCard {
  id: string
  name: string
  cost: number | 'X'
  kind: 'attack' | 'skill' | 'power'
  rarity: string
  text: string
  /** 升级后的卡面文字；没有升级版时为空 */
  upgradedText?: string
}

const KIND: Record<string, string> = { attack: '攻击', skill: '技能', power: '能力' }
const RARITY: Record<string, string> = { white: '白', blue: '蓝', gold: '金', curse: '诅咒', status: '状态' }

export interface CardGroup {
  title: string
  ids: string[]
}

export function renderCardsDoc(cards: Record<string, DocCard>, groups: CardGroup[]): string {
  const listed = new Set(groups.flatMap((g) => g.ids))
  // 不在任何分组里的牌（诅咒、状态牌等）统一收到最后，保证清单和数据完全一致
  const rest = Object.keys(cards).filter((id) => !listed.has(id))
  const all = rest.length ? [...groups, { title: '其他（诅咒 / 状态）', ids: rest }] : groups
  const out = [GENERATED_NOTE, '', '# 卡牌清单', '', `共 ${Object.keys(cards).length} 张。数据来自 \`src/data/cards\`，描述为自动生成的卡面文字。`]
  for (const g of all) {
    const rows = g.ids
      .map((id) => cards[id])
      .filter((c): c is DocCard => !!c)
      .map((c) => [c.id, c.name, c.cost, KIND[c.kind] ?? c.kind, RARITY[c.rarity] ?? c.rarity, c.text, c.upgradedText ?? ''])
    if (rows.length === 0) continue
    out.push('', `## ${g.title}（${rows.length}）`, '', table(['id', '名称', '费用', '类型', '稀有度', '描述', '升级后'], rows))
  }
  return out.join('\n') + '\n'
}

const ENEMY_ROLE: Record<string, string> = { monster: '普通', elite: '精英', boss: 'Boss', other: '其他' }

function actionText(a: ActionSpec): string {
  switch (a.type) {
    case 'attack':
      return `攻击 ${a.damage}${a.hits && a.hits > 1 ? `×${a.hits}` : ''}${a.grow ? `（每次 +${a.grow}）` : ''}${a.addCards ? `，塞 ${a.addCards.count} 张 ${a.addCards.cardId}` : ''}`
    case 'defend':
      return `防御 ${a.block}`
    case 'debuff':
      return `给你 ${a.stacks} 层 ${a.status}`
    case 'buff':
      return `自身 ${a.stacks} 层 ${a.status}`
    case 'addCards':
      return `塞 ${a.count} 张 ${a.cardId}`
    case 'idle':
      return '蓄力'
    case 'summon':
      return `召唤 ${a.enemy}`
    case 'steal':
      return `偷 ${a.amount} 金币`
    case 'flee':
      return '逃跑'
  }
}

const intentText = (i: IntentSpec) =>
  [actionText(i), ...(i.also ?? []).map(actionText)].join('；')

export function renderEnemiesDoc(data: EnemyData): string {
  const byId = new Map<string, EnemySpec>(data.enemies.map((e) => [e.id, e]))
  const name = (id: string) => byId.get(id)?.name ?? id
  const out = [GENERATED_NOTE, '', '# 敌人与遭遇', '', `共 ${data.enemies.length} 个敌人、${data.encounters.length} 个固定遭遇。数据来自 \`src/data/enemies.json\`。`, '', '## 敌人', '']
  out.push(
    table(
      ['id', '名称', '定位', '威胁', '生命', '初始状态', '意图循环', '分裂出'],
      data.enemies.map((e) => [
        e.id,
        e.name,
        ENEMY_ROLE[e.role] ?? e.role,
        e.threat ?? '',
        e.maxHp,
        Object.entries(e.startStatuses ?? {})
          .map(([k, v]) => `${k}×${v}`)
          .join('、'),
        e.intents.map((i, n) => `${n + 1}. ${intentText(i)}`).join('<br>') + (e.loopFrom ? `<br>（走完回到第 ${e.loopFrom + 1} 个）` : ''),
        (e.splitInto ?? []).map(name).join('、'),
      ]),
    ),
  )
  out.push('', '## 固定遭遇', '')
  out.push(
    data.encounters.length
      ? table(
          ['id', '名称', '敌人', '楼层'],
          data.encounters.map((e) => [e.id, e.name, e.enemies.map(name).join(' + '), `${e.minFloor}–${e.maxFloor}`]),
        )
      : '（无）',
  )
  return out.join('\n') + '\n'
}

export interface DocStatus {
  id: string
  name: string
  icon: string
  kind: string
  decay: string
  text: string
}

const STATUS_KIND: Record<string, string> = { buff: '增益', debuff: '减益', neutral: '中性' }
const DECAY: Record<string, string> = {
  none: '常驻',
  tick: '每回合 -1',
  turnEnd: '回合结束清空',
  playerTurnStart: '玩家回合开始清空',
  halve: '每回合减半',
  condition: '满足条件时消耗',
}

export function renderStatusesDoc(list: DocStatus[]): string {
  const out = [GENERATED_NOTE, '', '# 状态清单', '', `共 ${list.length} 个状态。数据来自 \`src/engine/statuses.ts\`，说明文字与持续规则已合并状态面板的覆盖。`, '']
  out.push(table(['id', '名称', '类型', '持续', '说明'], list.map((s) => [s.id, `${s.icon} ${s.name}`, STATUS_KIND[s.kind] ?? s.kind, DECAY[s.decay] ?? s.decay, s.text])))
  return out.join('\n') + '\n'
}

export interface DocSlot {
  key: string
  label: string
  group: string
}

export function renderSfxDoc(map: Record<string, { files?: string[] }>, slots: DocSlot[]): string {
  const groups = [...new Set(slots.map((s) => s.group))]
  const out = [GENERATED_NOTE, '', '# 音效槽位', '', `共 ${slots.length} 个槽位。槽位清单来自 \`src/data/sfxSlots.ts\`，配置来自 \`src/data/sfxMap.ts\`。`]
  for (const g of groups) {
    const rows = slots
      .filter((s) => s.group === g)
      .map((s) => [s.key, s.label, (map[s.key]?.files ?? []).join('、') || '（未配置）'])
    out.push('', `## ${g}`, '', table(['槽位', '说明', '音效文件'], rows))
  }
  return out.join('\n') + '\n'
}
