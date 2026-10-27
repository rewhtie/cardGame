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
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')

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
const RARITY: Record<string, string> = {
  white: '白',
  blue: '蓝',
  gold: '金',
  curse: '诅咒',
  status: '状态',
}

export interface CardGroup {
  title: string
  ids: string[]
}

export function renderCardsDoc(cards: Record<string, DocCard>, groups: CardGroup[]): string {
  const listed = new Set(groups.flatMap((g) => g.ids))
  // 不在任何分组里的牌（诅咒、状态牌等）统一收到最后，保证清单和数据完全一致
  const rest = Object.keys(cards).filter((id) => !listed.has(id))
  const all = rest.length ? [...groups, { title: '其他（诅咒 / 状态）', ids: rest }] : groups
  const out = [
    GENERATED_NOTE,
    '',
    '# 卡牌清单',
    '',
    `共 ${Object.keys(cards).length} 张。数据来自 \`src/data/cards\`，描述为自动生成的卡面文字。`,
  ]
  for (const g of all) {
    const rows = g.ids
      .map((id) => cards[id])
      .filter((c): c is DocCard => !!c)
      .map((c) => [
        c.id,
        c.name,
        c.cost,
        KIND[c.kind] ?? c.kind,
        RARITY[c.rarity] ?? c.rarity,
        c.text,
        c.upgradedText ?? '',
      ])
    if (rows.length === 0) continue
    out.push(
      '',
      `## ${g.title}（${rows.length}）`,
      '',
      table(['id', '名称', '费用', '类型', '稀有度', '描述', '升级后'], rows),
    )
  }
  return out.join('\n') + '\n'
}

const ENEMY_ROLE: Record<string, string> = {
  monster: '普通',
  elite: '精英',
  boss: 'Boss',
  other: '其他',
}

function actionText(a: ActionSpec): string {
  switch (a.type) {
    case 'attack':
      return `攻击 ${a.damage}${a.hits && a.hits > 1 ? `×${a.hits}` : ''}${a.grow ? `（每次 +${a.grow}）` : ''}${a.addCards ? `，塞 ${a.addCards.count} 张 ${a.addCards.cardId}` : ''}${a.selfStun ? `，攻击后自身晕眩 ${a.selfStun} 回合` : ''}`
    case 'defend':
      return `${a.target === 'allAllies' ? '自身与存活队友各' : ''}防御 ${a.block}`
    case 'heal':
      return `${a.target === 'allAllies' ? '自身与存活队友各' : '自身'}恢复 ${a.amount} 生命`
    case 'shareLife':
      return '与生命差最大的存活队友均分生命，双方获得转移量的格挡（非治疗／伤害）'
    case 'sacrificeExplosion':
      return '支付全部当前生命至 0，下一回合优先爆炸；基础伤害等于支付量，不受自身力量影响'
    case 'explode':
      return `爆炸基础伤害 ${a.damage}，然后真正死亡`
    case 'revive':
      return '复活最早死亡的符合条件同族，不推进普通意图循环'
    case 'debuff':
      return `给你 ${a.stacks} 层 ${a.status}`
    case 'buff':
      return `自身 ${a.stacks} 层 ${a.status}`
    case 'addCards':
      return `${a.to === 'draw' ? '往抽牌堆随机位置' : '往弃牌堆'}塞 ${a.count} 张 ${a.cardId}`
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

const intentText = (i: IntentSpec) => [actionText(i), ...(i.also ?? []).map(actionText)].join('；')

const statusesText = (statuses: Record<string, number> = {}) =>
  Object.entries(statuses)
    .map(([k, v]) => `${k}×${v}`)
    .join('、')
const planText = (plan: Pick<EnemySpec, 'intents' | 'loopFrom' | 'evenTurnActions'>) =>
  plan.intents.map((i, n) => `${n + 1}. ${intentText(i)}`).join('<br>') +
  (plan.loopFrom ? `<br>（走完回到第 ${plan.loopFrom + 1} 个）` : '') +
  (plan.evenTurnActions?.length
    ? `<br>偶数行动追加：${plan.evenTurnActions.map(actionText).join('；')}`
    : '')

export function renderEnemiesDoc(data: EnemyData): string {
  const byId = new Map<string, EnemySpec>(data.enemies.map((e) => [e.id, e]))
  const name = (id: string) => byId.get(id)?.name ?? id
  const out = [
    GENERATED_NOTE,
    '',
    '# 敌人与遭遇',
    '',
    `共 ${data.enemies.length} 个敌人、${data.encounters.length} 个固定遭遇。数据来自 \`src/data/enemies.json\`。`,
    '',
    '## 敌人',
    '',
  ]
  out.push(
    table(
      ['id', '名称', '定位', '威胁', '生命', '初始状态', '意图循环', '分裂出'],
      data.enemies.map((e) => [
        e.id,
        e.name,
        (ENEMY_ROLE[e.role] ?? e.role) + (e.nativeStage ? `（第 ${e.nativeStage} 大层原生数值）` : ''),
        e.threat ?? '',
        e.maxHp,
        statusesText(e.startStatuses) +
          (e.family ? `<br>族群：${e.family}；死亡／进入待爆炸时重置力量和意图` : '') +
          (e.deathHealFamily ? '<br>死亡时其他存活同族恢复至满血；不复活尸体或待爆炸单位' : '') +
          (e.delayedExplosion ? '<br>生命归零进入待爆炸：下一回合强制爆炸后真正死亡；直接击杀时基础伤害为 0；期间免疫所有作用、不算尸体、不提前结算胜利' : '') +
          (e.revival ? `<br>同族尸体存在时可逆地优先复活：恢复 ${e.revival.hpRatio * 100}% 生命，每场最多成功 ${e.revival.limit} 次；排除复活者及待爆炸单位，复活后下回合才行动` : '') +
          (e.playerTurnStatuses
            ? `<br>每个玩家回合开始补到：${statusesText(e.playerTurnStatuses)}`
            : ''),
        (e.actionPriority ? `行动优先级 ${e.actionPriority}<br>` : '') + planText(e) +
          (e.stunPhase ? `<br>首次跳过眩晕行动后永久切换：移除 ${e.stunPhase.removeStatuses?.join('、') || '无'}，获得 ${statusesText(e.stunPhase.startStatuses) || '无'}；重置意图<br>${planText(e.stunPhase)}` : '') +
          (e.hpPhase
            ? `<br>生命 ≤ ${e.maxHp * e.hpPhase.threshold} 时${e.hpPhase.name ?? '切换阶段'}：移除 ${e.hpPhase.removeStatuses.join('、')}，获得 ${statusesText(e.hpPhase.startStatuses)}；重置意图，停止补充旧阶段状态<br>${planText(e.hpPhase)}`
            : ''),
        [...(e.splitInto ?? []), ...(e.splitOnDeath ?? [])].map(name).join('、'),
      ]),
    ),
  )
  out.push('', '## 固定遭遇', '')
  out.push(
    data.encounters.length
      ? table(
          ['id', '名称', '定位', '敌人', '楼层'],
          data.encounters.map((e) => [
            e.id,
            e.name,
            ENEMY_ROLE[e.role ?? 'monster'],
            e.enemies.map(name).join(' + '),
            `${e.minFloor}–${e.maxFloor}${e.stage ? `（仅第 ${e.stage} 大层，整组出场）` : ''}`,
          ]),
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
  playerTurnStart: '回合开始清空',
  halve: '每回合减半',
  condition: '满足条件时消耗',
}

export function renderStatusesDoc(list: DocStatus[]): string {
  const out = [
    GENERATED_NOTE,
    '',
    '# 状态清单',
    '',
    `共 ${list.length} 个状态。数据来自 \`src/engine/statuses.ts\`，说明文字与持续规则已合并状态面板的覆盖。`,
    '',
  ]
  out.push(
    table(
      ['id', '名称', '类型', '持续', '说明'],
      list.map((s) => [
        s.id,
        `${s.icon} ${s.name}`,
        STATUS_KIND[s.kind] ?? s.kind,
        DECAY[s.decay] ?? s.decay,
        s.text,
      ]),
    ),
  )
  return out.join('\n') + '\n'
}

export interface DocSlot {
  key: string
  label: string
  group: string
}

export function renderSfxDoc(map: Record<string, { files?: string[] }>, slots: DocSlot[]): string {
  const groups = [...new Set(slots.map((s) => s.group))]
  const out = [
    GENERATED_NOTE,
    '',
    '# 音效槽位',
    '',
    `共 ${slots.length} 个槽位。槽位清单来自 \`src/data/sfxSlots.ts\`，配置来自 \`src/data/sfxMap.ts\`。`,
  ]
  for (const g of groups) {
    const rows = slots
      .filter((s) => s.group === g)
      .map((s) => [s.key, s.label, (map[s.key]?.files ?? []).join('、') || '（未配置）'])
    out.push('', `## ${g}`, '', table(['槽位', '说明', '音效文件'], rows))
  }
  return out.join('\n') + '\n'
}
