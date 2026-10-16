# 状态系统与能力牌 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给玩家和敌人加一套通用状态（增益/减益），并支持"打出后不进任何牌堆、效果持续整场"的能力牌。

**Architecture:** 新增 `src/engine/statuses.ts` 作为状态注册表。钩子只返回"修正量/触发描述"的纯数据，不直接改战斗状态，因此 `statuses.ts` 不依赖 `effects.ts`（无循环依赖）。`effects.ts` 负责解释这些描述并发事件；`battle.ts` 在固定时机调用。能力牌没有独立机制，只是给玩家加永久状态。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、UnoCSS、vitest、pnpm。

**Spec:** `docs/superpowers/specs/2026-10-16-status-and-power-cards-design.md`

## Global Constraints

- **用户要求：只编写代码和测试，不运行、不验证**（"不需要你验证测试"）。下文所有"运行"类步骤一律省略；不要执行 `pnpm test` / `pnpm typecheck`。
- 现有行为不变：易伤 +50%、圆盾遗物、附魔成长。
- 同一个种子的战斗结果不变；状态钩子均为纯函数，不使用随机数。
- 结算顺序：先加算（力量），再乘算（虚弱、易伤），最后向下取整；遍历状态按注册表声明顺序。
- 荆棘反伤不再触发荆棘。
- `applyStatus` 本批不支持 `perX`；不做事件总线；不做能力牌独立展示区。
- 引擎状态保持纯对象（会被展开、克隆）；`Card`/`CardPool` 类只在 `src/data/cards.ts` 的定义阶段使用。
- 提交信息末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## 与 spec 的两处刻意偏差（实现者须知）

1. **敌人状态衰减时机**：spec 第 3 节写"意图、onTurnEnd、衰减"。但现有测试要求圆盾在敌人回合内加的 1 层易伤，必须撑过下一个玩家回合、在下一次敌人行动时才消失（"易伤仍在敌人行动时 -1"）。所以敌人在 **onTurnStart 之后、意图之前** 衰减。玩家仍在回合结束（onTurnEnd 之后）衰减。
2. **史莱姆不改**：给 `slime` 加意图会打乱 `battle.test.ts` 里的意图循环断言（下标回绕、80-8-12 等）。改为新增 `sporeSlime`，替换 `slimeGroup` 的第三只（目前没有任何测试引用 `slimeGroup`，只有 `useRun.ts` 使用）。

## Review Focus

- 荆棘遇上荆棘：玩家和敌人都有荆棘时互相攻击，只反伤一次，不无限递归。
- 完美格挡判断必须用"含力量/虚弱/易伤后的最终伤害"，不是意图面板上的原始数字。
- 中毒在回合开始致死：玩家被毒死时不抽牌、直接判负；敌人被毒死后跳过其意图。
- 全部敌人死亡后给 `allEnemies` 上状态不报错；上状态层数 ≤ 0 被忽略。
- 能力牌打出后既不在弃牌堆也不在消耗堆，且之后洗牌不会"丢牌"或重复。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/engine/statuses.ts` | 新建 | 注册表、`Mod`/`TurnTrigger` 类型、`calcAttack`/`calcBlock` |
| `src/engine/types.ts` | 改 | `statuses` 字段、新效果/意图/事件、`CardDef.kind/exhaust` |
| `src/engine/effects.ts` | 改 | 伤害修正、反伤、`addStatus`/`heal`/`loseHp`、触发器与衰减 |
| `src/engine/battle.ts` | 改 | 出牌去向、回合时机、新意图 |
| `src/engine/enchant.ts` | 改 | `bumpEffect` 支持新效果 |
| `src/data/cards.ts` | 改 | 构建器新方法、文案、示例卡牌 |
| `src/data/enemies.ts` | 改 | `sporeSlime` |
| `src/ui/StatusIcons.vue` | 新建 | 状态图标行 |
| `src/ui/EnemyView.vue`、`BattleView.vue`、`CardView.vue` | 改 | 显示状态、最终伤害、能力/消耗标记 |
| `src/engine/statuses.test.ts` | 新建 | 状态相关测试 |
| `src/engine/battle.test.ts` | 改 | `vulnerable` 迁移 |

---

### Task 1: 状态注册表与迁移 vulnerable

**Files:**
- Create: `src/engine/statuses.ts`
- Modify: `src/engine/types.ts`、`src/engine/effects.ts`、`src/engine/battle.ts`、`src/engine/battle.test.ts`
- Test: `src/engine/statuses.test.ts`

**Interfaces:**
- Produces:
  - `STATUSES: StatusDef[]`、`statusById: Record<string, StatusDef>`
  - `type Statuses = Record<string, number>`
  - `calcAttack(base: number, attacker: Statuses | undefined, defender: Statuses): number`
  - `calcBlock(base: number, owner: Statuses): number`
  - `applyDamage(s, target, amount, events, enemyIndex = 0, opts: { source?: { side: Side; enemyIndex?: number }; reflect?: boolean } = {})`
  - `addStatus(s, side, enemyIndex, id, stacks, events)`
  - `PlayerState.statuses` / `EnemyState.statuses`（删除 `EnemyState.vulnerable`）

- [ ] **Step 1: 新建 `src/engine/statuses.ts`**

```ts
export type Statuses = Record<string, number>
export type StatusKind = 'buff' | 'debuff'

/** 数值修正：先把所有 add 相加，再乘上所有 mul，最后取整（由 calc* 完成） */
export interface Mod {
  add?: number
  mul?: number
}

/** 回合开始/结束触发的结果描述，由 effects.ts 解释执行 */
export type TurnTrigger =
  | { type: 'loseHp'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'block'; amount: number }

export interface StatusDef {
  id: string
  name: string
  icon: string
  /** 悬浮说明，N 会被替换为层数 */
  text: string
  kind: StatusKind
  /** none：层数永久；tick：每个所有者回合 -1，减到 0 移除 */
  decay: 'none' | 'tick'
  modifyDamageDealt?: (stacks: number) => Mod
  modifyDamageTaken?: (stacks: number) => Mod
  modifyBlock?: (stacks: number) => Mod
  onTurnStart?: (stacks: number) => TurnTrigger
  onTurnEnd?: (stacks: number) => TurnTrigger
  /** 被攻击时对攻击者造成的反伤 */
  onDamaged?: (stacks: number) => { type: 'reflect'; amount: number }
}

/** 声明顺序即结算顺序，不要随意调换 */
export const STATUSES: StatusDef[] = [
  {
    id: 'strength',
    name: '力量',
    icon: '💪',
    text: '造成的攻击伤害 +N',
    kind: 'buff',
    decay: 'none',
    modifyDamageDealt: (n) => ({ add: n }),
  },
  {
    id: 'dexterity',
    name: '敏捷',
    icon: '🦶',
    text: '获得的格挡 +N',
    kind: 'buff',
    decay: 'none',
    modifyBlock: (n) => ({ add: n }),
  },
  {
    id: 'weak',
    name: '虚弱',
    icon: '🐌',
    text: '造成的攻击伤害 ×0.75，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageDealt: () => ({ mul: 0.75 }),
  },
  {
    id: 'vulnerable',
    name: '易伤',
    icon: '💔',
    text: '受到的攻击伤害 ×1.5，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    modifyDamageTaken: () => ({ mul: 1.5 }),
  },
  {
    id: 'poison',
    name: '中毒',
    icon: '☠️',
    text: '回合开始时失去 N 点生命，每回合 -1',
    kind: 'debuff',
    decay: 'tick',
    onTurnStart: (n) => ({ type: 'loseHp', amount: n }),
  },
  {
    id: 'regen',
    name: '再生',
    icon: '🌿',
    text: '回合结束时恢复 N 点生命，每回合 -1',
    kind: 'buff',
    decay: 'tick',
    onTurnEnd: (n) => ({ type: 'heal', amount: n }),
  },
  {
    id: 'thorns',
    name: '荆棘',
    icon: '🌵',
    text: '被攻击时对攻击者造成 N 点伤害',
    kind: 'buff',
    decay: 'none',
    onDamaged: (n) => ({ type: 'reflect', amount: n }),
  },
  {
    id: 'metallicize',
    name: '钢铁之躯',
    icon: '🛡️',
    text: '回合结束时获得 N 点格挡',
    kind: 'buff',
    decay: 'none',
    onTurnEnd: (n) => ({ type: 'block', amount: n }),
  },
]

export const statusById: Record<string, StatusDef> = Object.fromEntries(
  STATUSES.map((d) => [d.id, d]),
)

export const statusDescription = (id: string, stacks: number) =>
  `${statusById[id]?.name ?? id} ${stacks}：${(statusById[id]?.text ?? '').replaceAll('N', String(stacks))}`

type ModHook = 'modifyDamageDealt' | 'modifyDamageTaken' | 'modifyBlock'

/** 按注册表顺序收集某个钩子的修正 */
function collect(owner: Statuses | undefined, hook: ModHook): Mod[] {
  if (!owner) return []
  const mods: Mod[] = []
  for (const def of STATUSES) {
    const stacks = owner[def.id] ?? 0
    const fn = def[hook]
    if (stacks > 0 && fn) mods.push(fn(stacks))
  }
  return mods
}

/** 先加算，再乘算，最后向下取整，不低于 0 */
function fold(base: number, mods: Mod[]): number {
  const add = mods.reduce((sum, m) => sum + (m.add ?? 0), 0)
  const mul = mods.reduce((prod, m) => prod * (m.mul ?? 1), 1)
  return Math.max(0, Math.floor((base + add) * mul))
}

/** 攻击伤害：攻击者的"造成伤害"修正 + 防御者的"受到伤害"修正 */
export function calcAttack(base: number, attacker: Statuses | undefined, defender: Statuses): number {
  return fold(base, [...collect(attacker, 'modifyDamageDealt'), ...collect(defender, 'modifyDamageTaken')])
}

export function calcBlock(base: number, owner: Statuses): number {
  return fold(base, collect(owner, 'modifyBlock'))
}
```

- [ ] **Step 2: 改 `types.ts`（本任务只迁移 `vulnerable`，其余类型在后续任务加）**

`PlayerState` 末尾加 `statuses: Record<string, number>`；`EnemyState` 删除 `vulnerable` 及其注释，改为 `statuses: Record<string, number>`。`GameEvent` 里把 `vulnerableApplied` 一行换成：

```ts
  | { type: 'statusApplied'; target: Side; status: string; stacks: number; enemyIndex?: number }
```

- [ ] **Step 3: 改 `effects.ts`**

`draft` 里复制状态表：

```ts
    player: { ...state.player, statuses: { ...state.player.statuses } },
    enemies: state.enemies.map((e) => ({ ...e, statuses: { ...e.statuses } })),
```

文件顶部加 `import { calcAttack, STATUSES } from './statuses'`（`STATUSES` 在 Task 3 使用，这里先只引 `calcAttack`）。替换 `applyDamage` 为：

```ts
export interface DamageOpts {
  /** 攻击来源；缺省表示无来源的伤害（作弊等），不吃"造成伤害"修正也不触发反伤 */
  source?: { side: Side; enemyIndex?: number }
  /** 反伤自身产生的伤害要传 false，避免荆棘互相无限反弹 */
  reflect?: boolean
}

const statusesOf = (s: BattleState, side: Side, enemyIndex = 0) =>
  side === 'player' ? s.player.statuses : s.enemies[enemyIndex]?.statuses

export function applyDamage(
  s: BattleState,
  target: Side,
  amount: number,
  events: GameEvent[],
  enemyIndex = 0,
  opts: DamageOpts = {},
) {
  const t = target === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const attacker = opts.source ? statusesOf(s, opts.source.side, opts.source.enemyIndex) : undefined
  amount = calcAttack(amount, attacker, t.statuses)
  const blocked = Math.min(t.block, amount)
  t.block -= blocked
  const hpLost = Math.min(t.hp, amount - blocked)
  t.hp -= hpLost
  events.push({
    type: 'damageDealt',
    target,
    amount: hpLost,
    blocked,
    ...(target === 'enemy' ? { enemyIndex } : {}),
  })
}
```

在 `applyBlock` 之后加 `addStatus`：

```ts
/** 给某一方加状态；stacks <= 0 忽略，未知状态 id 直接报错（定义阶段的笔误） */
export function addStatus(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  id: string,
  stacks: number,
  events: GameEvent[],
) {
  if (stacks <= 0) return
  if (!statusById[id]) throw new Error(`未知状态：${id}`)
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  owner.statuses[id] = (owner.statuses[id] ?? 0) + stacks
  events.push({
    type: 'statusApplied',
    target: side,
    status: id,
    stacks,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
}
```

import 改为 `import { calcAttack, statusById } from './statuses'`（去掉暂未使用的 `STATUSES`）。

- [ ] **Step 4: 改 `battle.ts`**

`createBattle`：玩家加 `statuses: {}`，敌人 `vulnerable: 0` 换成 `statuses: {}`。

`endTurn` 里删除 `if (enemy.vulnerable > 0) enemy.vulnerable -= 1`，改成临时的递减（Task 3 会用通用衰减替换它）：

```ts
    if ((enemy.statuses.vulnerable ?? 0) > 0) enemy.statuses.vulnerable! -= 1
```

> 若递减到 0，必须 `delete`，否则 `statuses` 里残留 0 值会让 toEqual 断言失败：写成
> ```ts
> const v = enemy.statuses.vulnerable ?? 0
> if (v > 1) enemy.statuses.vulnerable = v - 1
> else delete enemy.statuses.vulnerable
> ```

圆盾分支改为：

```ts
        if (s.relics.includes(ROUND_SHIELD)) addStatus(s, 'enemy', enemyIndex, 'vulnerable', 1, events)
```

`applyDamage(s, 'player', intent.damage, events)` 改为带来源，并让完美格挡用最终伤害：

```ts
      const dmg = calcAttack(intent.damage, enemy.statuses, s.player.statuses)
      const perfect = dmg > 0 && s.player.block >= dmg
      applyDamage(s, 'player', intent.damage, events, 0, { source: { side: 'enemy', enemyIndex } })
```

`import` 补 `addStatus`（来自 `./effects`）与 `calcAttack`（来自 `./statuses`）。

`effects.ts` 的 `resolveEffect` 里 `damage` 分支带上玩家来源：

```ts
    case 'damage':
      applyDamage(s, 'enemy', effect.perX ? effect.amount * x : effect.amount, events, enemyIndex, {
        source: { side: 'player' },
      })
      break
```

- [ ] **Step 5: 迁移 `battle.test.ts` 中的 `vulnerable`**

- 第 177 行：`s.enemies[0]!.vulnerable = 1` → `s.enemies[0]!.statuses = { vulnerable: 1 }`
- 第 188、192、200、206 行：`.vulnerable).toBe(1)` → `.statuses.vulnerable).toBe(1)`；`.toBe(0)` 的改为 `.statuses.vulnerable ?? 0).toBe(0)`（衰减到 0 会被移除）。

另全局搜索 `vulnerableApplied`、`vulnerable:`，确认没有遗漏（`run.test.ts` 的 `{hp:80,maxHp:80}` 是 run.player，不受影响）。

- [ ] **Step 6: 新建 `statuses.test.ts`（先写迁移相关用例，后续任务继续往里加）**

```ts
import { describe, expect, it } from 'vitest'
import { cards, starterDeck } from '@/data/cards'
import { slime } from '@/data/enemies'
import { createBattle, dispatch } from './battle'
import { calcAttack, calcBlock } from './statuses'
import type { BattleState } from './types'

function start(seed = 1): BattleState {
  return createBattle({ seed, deck: starterDeck, enemy: slime, cards }).state
}
function withHand(state: BattleState, hand: string[]): BattleState {
  return { ...state, hand }
}

describe('伤害结算顺序', () => {
  it('先加算后乘算最后取整：(6+2)×0.75×1.5 = 9', () => {
    expect(calcAttack(6, { strength: 2, weak: 1 }, { vulnerable: 1 })).toBe(9)
  })
  it('无状态时原样返回', () => {
    expect(calcAttack(6, {}, {})).toBe(6)
  })
  it('敏捷加到格挡上', () => {
    expect(calcBlock(5, { dexterity: 2 })).toBe(7)
  })
  it('伤害不会变成负数', () => {
    expect(calcAttack(1, { strength: -5 }, {})).toBe(0)
  })
})

describe('力量与虚弱作用于出牌', () => {
  it('力量 +2：打击造成 8 点', () => {
    const s = withHand(start(), ['strike'])
    s.player.statuses = { strength: 2 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 8)
  })
  it('虚弱：打击造成 floor(6×0.75)=4 点', () => {
    const s = withHand(start(), ['strike'])
    s.player.statuses = { weak: 1 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 4)
  })
})

describe('完美格挡按最终伤害判断', () => {
  it('敌人有力量时，8 点格挡不再算完美格挡', () => {
    const s = start()
    s.enemies[0]!.statuses = { strength: 2 }
    s.player.block = 8
    const { events } = dispatch(s, { type: 'endTurn' })
    expect(events.some((e) => e.type === 'perfectBlock')).toBe(false)
  })
})
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/statuses.ts src/engine/types.ts src/engine/effects.ts src/engine/battle.ts src/engine/battle.test.ts src/engine/statuses.test.ts
git commit -m "feat: 状态注册表，易伤迁入通用状态表"
```

---

### Task 2: 新效果、卡牌种类与出牌去向

**Files:**
- Modify: `src/engine/types.ts`、`src/engine/effects.ts`、`src/engine/battle.ts`、`src/engine/enchant.ts`
- Test: `src/engine/statuses.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `addStatus`、`calcBlock`
- Produces:
  - `Effect` 新增 `{ type: 'applyStatus'; status: string; stacks: number; to: 'self' | 'target' | 'allEnemies' }` 与 `{ type: 'heal'; amount: number }`
  - `CardDef.kind: 'attack' | 'skill' | 'power'`、`CardDef.exhaust?: boolean`
  - `heal(s, side, enemyIndex, amount, events)`
  - 事件 `healed`

- [ ] **Step 1: 改 `types.ts`**

`Effect` 追加：

```ts
  | { type: 'applyStatus'; status: string; stacks: number; to: 'self' | 'target' | 'allEnemies' }
  | { type: 'heal'; amount: number }
```

`CardDef` 在 `target` 之后加：

```ts
  /** 攻击/技能打出后进弃牌堆；能力牌打出后不进任何牌堆 */
  kind: 'attack' | 'skill' | 'power'
  /** 打出后进消耗牌堆（能力牌无效） */
  exhaust?: boolean
```

`GameEvent` 追加：

```ts
  | { type: 'statusRemoved'; target: Side; status: string; enemyIndex?: number }
  | { type: 'healed'; target: Side; amount: number; enemyIndex?: number }
  | { type: 'statusTriggered'; target: Side; status: string; enemyIndex?: number }
```

- [ ] **Step 2: 改 `effects.ts`**

在 `addStatus` 后加：

```ts
export function heal(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  amount: number,
  events: GameEvent[],
) {
  const t = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const max = side === 'player' ? s.player.maxHp : s.enemies[enemyIndex]!.def.maxHp
  const gained = Math.max(0, Math.min(max - t.hp, amount))
  t.hp += gained
  events.push({
    type: 'healed',
    target: side,
    amount: gained,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
}
```

`resolveEffect` 的 `block` 分支改为含敏捷，并追加两个分支：

```ts
    case 'block':
      applyBlock(
        s,
        'player',
        calcBlock(effect.perX ? effect.amount * x : effect.amount, s.player.statuses),
        events,
      )
      break
    case 'applyStatus':
      if (effect.to === 'self') addStatus(s, 'player', 0, effect.status, effect.stacks, events)
      else if (effect.to === 'target')
        addStatus(s, 'enemy', enemyIndex, effect.status, effect.stacks, events)
      else
        s.enemies.forEach((e, i) => {
          if (isAlive(e)) addStatus(s, 'enemy', i, effect.status, effect.stacks, events)
        })
      break
    case 'heal':
      heal(s, 'player', 0, effect.amount, events)
      break
```

`import { calcAttack, calcBlock, statusById } from './statuses'`。

- [ ] **Step 3: 改 `enchant.ts` 的 `bumpEffect`**

```ts
    case 'applyStatus':
      return { ...e, stacks: e.stacks + 1 }
    case 'heal':
      return { ...e, amount: e.amount + 1 }
```

（`heal` 与 `damage`/`block`/`gainEnergy` 同样是 `amount + 1`，也可直接并入前面的 case 列表；`applyStatus` 单独写。）

- [ ] **Step 4: 改 `battle.ts` 的 `playCard` 出牌去向**

把 `s.discardPile.push(cardId)` 替换为：

```ts
  if (card.kind === 'power') {
    // 能力牌：不进任何牌堆，效果由状态承担
  } else if (card.exhaust) s.exhaustPile.push(cardId)
  else s.discardPile.push(cardId)
```

- [ ] **Step 5: 在 `statuses.test.ts` 追加测试**

```ts
import type { CardDef } from './types'

/** 测试用的临时卡牌表：在真实卡池之上追加几张 */
const testCards: Record<string, CardDef> = {
  ...cards,
  tPower: {
    id: 'tPower',
    rarity: 'gold',
    name: '测试能力',
    cost: 1,
    target: 'self',
    kind: 'power',
    effects: [{ type: 'applyStatus', status: 'strength', stacks: 2, to: 'self' }],
    text: '获得 2 层力量',
  },
  tExhaust: {
    id: 'tExhaust',
    rarity: 'white',
    name: '测试消耗',
    cost: 0,
    target: 'self',
    kind: 'skill',
    exhaust: true,
    effects: [{ type: 'heal', amount: 5 }],
    text: '恢复 5 点生命，消耗',
  },
  tHex: {
    id: 'tHex',
    rarity: 'white',
    name: '测试诅咒',
    cost: 1,
    target: 'enemy',
    kind: 'attack',
    effects: [{ type: 'applyStatus', status: 'vulnerable', stacks: 2, to: 'target' }],
    text: '给予 2 层易伤',
  },
  tAll: {
    id: 'tAll',
    rarity: 'white',
    name: '测试群体',
    cost: 0,
    target: 'self',
    kind: 'skill',
    effects: [{ type: 'applyStatus', status: 'weak', stacks: 1, to: 'allEnemies' }],
    text: '给予所有敌人 1 层虚弱',
  },
}

function startWith(deck: string[], seed = 1): BattleState {
  return createBattle({ seed, deck, enemy: slime, cards: testCards }).state
}

describe('能力牌与消耗牌的去向', () => {
  it('能力牌：不进弃牌堆、不进消耗堆，并给玩家上状态', () => {
    const s = withHand(startWith(starterDeck), ['tPower'])
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.hand).toEqual([])
    expect(state.discardPile).not.toContain('tPower')
    expect(state.exhaustPile).not.toContain('tPower')
    expect(state.player.statuses.strength).toBe(2)
  })

  it('消耗牌进消耗牌堆，治疗不超过上限', () => {
    const s = withHand(startWith(starterDeck), ['tExhaust'])
    s.player.hp = 78
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.exhaustPile).toEqual(['tExhaust'])
    expect(state.discardPile).toEqual([])
    expect(state.player.hp).toBe(80)
    expect(events).toContainEqual({ type: 'healed', target: 'player', amount: 2 })
  })

  it('攻击牌给目标上状态，并发 statusApplied', () => {
    const s = withHand(startWith(starterDeck), ['tHex'])
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.enemies[0]!.statuses.vulnerable).toBe(2)
    expect(events).toContainEqual({
      type: 'statusApplied',
      target: 'enemy',
      status: 'vulnerable',
      stacks: 2,
      enemyIndex: 0,
    })
  })

  it('allEnemies 只作用于存活的敌人，全部死亡时不报错', () => {
    const s = withHand(startWith(starterDeck), ['tAll'])
    s.enemies[0]!.hp = 0
    expect(() => dispatch(s, { type: 'playCard', handIndex: 0 })).not.toThrow()
  })

  it('层数 <= 0 的上状态被忽略', () => {
    const s = withHand(startWith(starterDeck), ['tPower'])
    s.cards = {
      ...s.cards,
      tPower: { ...s.cards.tPower!, effects: [{ type: 'applyStatus', status: 'strength', stacks: 0, to: 'self' }] },
    }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.statuses.strength).toBeUndefined()
  })

  it('能力牌打出后洗牌不会重复或丢牌', () => {
    const s = withHand(startWith(['tPower', 'strike', 'strike']), ['tPower'])
    s.drawPile = ['strike', 'strike']
    s.discardPile = []
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    const all = [...state.hand, ...state.drawPile, ...state.discardPile, ...state.exhaustPile]
    expect(all).not.toContain('tPower')
    expect(all.filter((c) => c === 'strike')).toHaveLength(2)
  })
})

describe('敏捷', () => {
  it('敏捷 +2：防御获得 7 点格挡', () => {
    const s = withHand(startWith(starterDeck), ['defend'])
    s.player.statuses = { dexterity: 2 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.block).toBe(7)
  })
})
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/effects.ts src/engine/battle.ts src/engine/enchant.ts src/engine/statuses.test.ts
git commit -m "feat: applyStatus/heal 效果，卡牌种类与能力牌流转"
```

> 注意：`CardDef.kind` 变为必填后，`src/data/cards.ts` 的 `build()` 在 Task 4 之前不满足类型。若按任务顺序依次执行，Task 2 与 Task 4 的 `build()` 修改应在同一次提交周期内完成；执行者可先在 Task 2 里把 `build()` 临时加上 `kind: this._target === 'enemy' ? 'attack' : 'skill'`，Task 4 再替换为最终实现。

---

### Task 3: 回合触发器、衰减、反伤与新意图

**Files:**
- Modify: `src/engine/types.ts`、`src/engine/effects.ts`、`src/engine/battle.ts`
- Test: `src/engine/statuses.test.ts`

**Interfaces:**
- Consumes: Task 1/2 的 `addStatus`、`heal`、`applyBlock`、`STATUSES`
- Produces:
  - `Intent` 新增 `{ type: 'debuff'; status: string; stacks: number }` 与 `{ type: 'buff'; status: string; stacks: number }`
  - `runTurnTriggers(s, side, enemyIndex, hook: 'onTurnStart' | 'onTurnEnd', events)`
  - `tickStatuses(s, side, enemyIndex, events)`
  - `loseHp(s, side, enemyIndex, amount, events)`

- [ ] **Step 1: 改 `types.ts`：`Intent`**

```ts
export type Intent =
  | { type: 'attack'; damage: number }
  | { type: 'defend'; block: number }
  /** 给玩家上状态 */
  | { type: 'debuff'; status: string; stacks: number }
  /** 给自己上状态 */
  | { type: 'buff'; status: string; stacks: number }
```

- [ ] **Step 2: 改 `effects.ts`：反伤、失血、触发器、衰减**

`import { calcAttack, calcBlock, STATUSES, statusById } from './statuses'`。

在 `applyDamage` 末尾（`events.push(damageDealt)` 之后）加反伤：

```ts
  // 反伤：只有带来源的攻击才触发；反伤自身用 reflect:false 防止荆棘互相无限反弹
  const src = opts.source
  if (src && opts.reflect !== false && !(src.side === target && (src.enemyIndex ?? 0) === enemyIndex)) {
    for (const def of STATUSES) {
      const stacks = t.statuses[def.id] ?? 0
      if (stacks <= 0 || !def.onDamaged) continue
      const { amount: back } = def.onDamaged(stacks)
      events.push({
        type: 'statusTriggered',
        target,
        status: def.id,
        ...(target === 'enemy' ? { enemyIndex } : {}),
      })
      applyDamage(s, src.side, back, events, src.enemyIndex ?? 0, { reflect: false })
    }
  }
```

> 反伤调用没有 `source`，所以不吃力量/虚弱修正，只吃受击方的易伤；这与 spec"反伤不再触发荆棘"一致。

在文件末尾加：

```ts
/** 直接失去生命（中毒等）：无视格挡，不吃任何修正，不触发反伤 */
export function loseHp(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  amount: number,
  events: GameEvent[],
) {
  const t = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!t) return
  const lost = Math.min(t.hp, amount)
  t.hp -= lost
  events.push({
    type: 'damageDealt',
    target: side,
    amount: lost,
    blocked: 0,
    ...(side === 'enemy' ? { enemyIndex } : {}),
  })
}

/** 触发所有者身上带 hook 的状态（按注册表顺序） */
export function runTurnTriggers(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  hook: 'onTurnStart' | 'onTurnEnd',
  events: GameEvent[],
) {
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    const fn = def[hook]
    if (stacks <= 0 || !fn) continue
    const trigger = fn(stacks)
    events.push({
      type: 'statusTriggered',
      target: side,
      status: def.id,
      ...(side === 'enemy' ? { enemyIndex } : {}),
    })
    if (trigger.type === 'loseHp') loseHp(s, side, enemyIndex, trigger.amount, events)
    else if (trigger.type === 'heal') heal(s, side, enemyIndex, trigger.amount, events)
    else applyBlock(s, side, trigger.amount, events, enemyIndex)
  }
}

/** 所有者回合的衰减：tick 状态 -1，减到 0 移除 */
export function tickStatuses(
  s: BattleState,
  side: Side,
  enemyIndex: number,
  events: GameEvent[],
) {
  const owner = side === 'player' ? s.player : s.enemies[enemyIndex]
  if (!owner) return
  for (const def of STATUSES) {
    const stacks = owner.statuses[def.id] ?? 0
    if (stacks <= 0 || def.decay !== 'tick') continue
    if (stacks > 1) owner.statuses[def.id] = stacks - 1
    else {
      delete owner.statuses[def.id]
      events.push({
        type: 'statusRemoved',
        target: side,
        status: def.id,
        ...(side === 'enemy' ? { enemyIndex } : {}),
      })
    }
  }
}
```

> `statusById` 在 `addStatus` 使用，`STATUSES` 在此处使用，二者都要保留在 import 里。

- [ ] **Step 3: 改 `battle.ts`：回合时机**

import 补 `runTurnTriggers`、`tickStatuses`、`addStatus`、`calcAttack`。

`startPlayerTurn` 改为（中毒致死则不抽牌）：

```ts
function startPlayerTurn(s: BattleState, events: GameEvent[]) {
  s.turn += 1
  s.phase = 'player'
  s.player.block = 0
  s.player.energy = s.player.maxEnergy
  events.push({ type: 'turnStarted', turn: s.turn })
  runTurnTriggers(s, 'player', 0, 'onTurnStart', events)
  if (s.player.hp <= 0) return
  drawCards(s, s.handSize, events)
}
```

`endTurn`：弃牌之后、`s.phase = 'enemy'` 之前加玩家回合结束触发与衰减：

```ts
  runTurnTriggers(s, 'player', 0, 'onTurnEnd', events)
  tickStatuses(s, 'player', 0, events)
```

敌人循环整体替换为：

```ts
  s.phase = 'enemy'
  s.enemies.forEach((enemy, enemyIndex) => {
    if (!isAlive(enemy) || s.player.hp <= 0) return
    enemy.block = 0
    runTurnTriggers(s, 'enemy', enemyIndex, 'onTurnStart', events)
    if (!isAlive(enemy)) return
    // 敌人在意图之前衰减：圆盾在意图里加的易伤才能撑过下一个玩家回合
    tickStatuses(s, 'enemy', enemyIndex, events)
    const intent = enemy.def.intents[enemy.intentIndex]
    if (!intent) return
    events.push({ type: 'enemyActed', intent, enemyIndex })
    if (intent.type === 'attack') {
      const dmg = calcAttack(intent.damage, enemy.statuses, s.player.statuses)
      const perfect = dmg > 0 && s.player.block >= dmg
      applyDamage(s, 'player', intent.damage, events, 0, { source: { side: 'enemy', enemyIndex } })
      if (perfect) {
        events.push({ type: 'perfectBlock' })
        if (s.relics.includes(ROUND_SHIELD))
          addStatus(s, 'enemy', enemyIndex, 'vulnerable', 1, events)
      }
    } else if (intent.type === 'defend') applyBlock(s, 'enemy', intent.block, events, enemyIndex)
    else if (intent.type === 'debuff')
      addStatus(s, 'player', 0, intent.status, intent.stacks, events)
    else addStatus(s, 'enemy', enemyIndex, intent.status, intent.stacks, events)
    runTurnTriggers(s, 'enemy', enemyIndex, 'onTurnEnd', events)
    enemy.intentIndex = (enemy.intentIndex + 1) % enemy.def.intents.length
  })

  if (!endBattleIfOver(s, events)) {
    startPlayerTurn(s, events)
    endBattleIfOver(s, events)
  }
```

> 若敌人在意图里被反伤打死，`onTurnEnd` 对死亡敌人仍会执行 `heal`（`heal` 会给 0 血敌人加血，使其"复活"）。所以 `runTurnTriggers(..., 'onTurnEnd')` 之前加判断：`if (isAlive(enemy))`。即最终写成：
> ```ts
>     if (isAlive(enemy)) runTurnTriggers(s, 'enemy', enemyIndex, 'onTurnEnd', events)
> ```
> 同理 `endTurn` 中玩家的 `onTurnEnd` 无需判断（玩家回合内死亡会在 `endBattleIfOver` 被拦住，不会进入 `endTurn`）。

- [ ] **Step 4: 在 `statuses.test.ts` 追加测试**

```ts
describe('回合触发与衰减', () => {
  it('中毒：玩家回合开始失去 N 点生命并衰减', () => {
    const s = start()
    s.player.statuses = { poison: 3 }
    const next = dispatch(s, { type: 'endTurn' }).state
    // 敌人回合 8 点伤害 + 下回合开始中毒（玩家回合结束已衰减为 2）
    expect(next.player.hp).toBe(80 - 8 - 2)
    expect(next.player.statuses.poison).toBe(2)
  })

  it('中毒致死：不抽牌，直接判负', () => {
    const s = start()
    s.player.statuses = { poison: 5 }
    s.player.hp = 9
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.phase).toBe('lost')
    expect(events).toContainEqual({ type: 'battleEnded', result: 'lost' })
  })

  it('敌人中毒致死：跳过其意图，战斗胜利', () => {
    const s = start()
    s.enemies[0]!.hp = 3
    s.enemies[0]!.statuses = { poison: 5 }
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.phase).toBe('won')
    expect(events.some((e) => e.type === 'enemyActed')).toBe(false)
  })

  it('再生：回合结束恢复，tick 到 0 后移除', () => {
    const s = start()
    s.player.hp = 50
    s.player.statuses = { regen: 1 }
    const { state, events } = dispatch(s, { type: 'endTurn' })
    expect(state.player.statuses.regen).toBeUndefined()
    expect(events).toContainEqual({ type: 'statusRemoved', target: 'player', status: 'regen' })
    expect(state.player.hp).toBe(50 + 1 - 8)
  })

  it('钢铁之躯：回合结束获得格挡，挡住敌人攻击', () => {
    const s = start()
    s.player.statuses = { metallicize: 8 }
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.player.hp).toBe(80)
  })

  it('永久状态（力量）不衰减', () => {
    const s = start()
    s.player.statuses = { strength: 3 }
    const next = dispatch(s, { type: 'endTurn' }).state
    expect(next.player.statuses.strength).toBe(3)
  })

  it('同一回合内按注册表顺序结算，与插入顺序无关', () => {
    const a = start()
    a.player.statuses = { regen: 2, metallicize: 3 }
    const b = start()
    b.player.statuses = { metallicize: 3, regen: 2 }
    const ra = dispatch(a, { type: 'endTurn' })
    const rb = dispatch(b, { type: 'endTurn' })
    expect(ra.events).toEqual(rb.events)
  })
})

describe('荆棘', () => {
  it('玩家攻击带荆棘的敌人：玩家受到反伤', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.statuses = { thorns: 3 }
    const { state } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.hp).toBe(77)
  })

  it('敌人攻击带荆棘的玩家：敌人受到反伤', () => {
    const s = start()
    s.player.statuses = { thorns: 4 }
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 4)
  })

  it('双方都有荆棘：只反伤一次，不无限递归', () => {
    const s = withHand(start(), ['strike'])
    s.enemies[0]!.statuses = { thorns: 3 }
    s.player.statuses = { thorns: 3 }
    const { state, events } = dispatch(s, { type: 'playCard', handIndex: 0 })
    expect(state.player.hp).toBe(77)
    expect(events.filter((e) => e.type === 'statusTriggered')).toHaveLength(1)
  })

  it('被完全格挡的攻击也会触发荆棘', () => {
    const s = start()
    s.player.statuses = { thorns: 2 }
    s.player.block = 99
    const { state } = dispatch(s, { type: 'endTurn' })
    expect(state.enemies[0]!.hp).toBe(slime.maxHp - 2)
  })
})

describe('敌人意图', () => {
  const debuffer = {
    ...slime,
    intents: [
      { type: 'debuff', status: 'weak', stacks: 2 },
      { type: 'buff', status: 'strength', stacks: 3 },
    ] as typeof slime.intents,
  }

  it('debuff 意图给玩家上状态，buff 意图给自己上状态', () => {
    const s = createBattle({ seed: 1, deck: starterDeck, enemy: debuffer, cards }).state
    const a = dispatch(s, { type: 'endTurn' }).state
    // 虚弱在玩家回合结束时才衰减，所以这里还剩 2 层
    expect(a.player.statuses.weak).toBe(2)
    const b = dispatch(a, { type: 'endTurn' }).state
    expect(b.enemies[0]!.statuses.strength).toBe(3)
  })

  it('同种子、同操作序列结果完全一致', () => {
    const run = () => {
      let s = withHand(start(7), ['strike'])
      s.player.statuses = { poison: 2, strength: 1 }
      s = dispatch(s, { type: 'playCard', handIndex: 0 }).state
      return dispatch(s, { type: 'endTurn' }).state
    }
    expect(run()).toEqual(run())
  })
})
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/effects.ts src/engine/battle.ts src/engine/statuses.test.ts
git commit -m "feat: 回合触发、状态衰减、荆棘反伤与 debuff/buff 意图"
```

---

### Task 4: Card 构建器、文案与示例卡牌、敌人

**Files:**
- Modify: `src/data/cards.ts`、`src/data/enemies.ts`
- Test: `src/engine/statuses.test.ts`

**Interfaces:**
- Consumes: `statusById`、`CardDef.kind/exhaust`、`Effect.applyStatus/heal`
- Produces: `Card.power()`、`Card.exhaust()`、`Card.applyStatus(status, stacks, to)`、`Card.heal(amount)`；`sporeSlime: EnemyDef`

- [ ] **Step 1: 改 `cards.ts` 的文案模板**

顶部 import 加 `import { statusById } from '@/engine/statuses'`，`effectText` 追加：

```ts
    case 'applyStatus': {
      const name = statusById[e.status]?.name ?? e.status
      if (e.to === 'self') return `获得 ${e.stacks} 层${name}`
      if (e.to === 'target') return `给予 ${e.stacks} 层${name}`
      return `给予所有敌人 ${e.stacks} 层${name}`
    }
    case 'heal':
      return `恢复 ${e.amount} 点生命`
```

> 附魔的 `growCard` 会把卡面文字里所有数字 +1，所以每个效果必须恰好含一个数字（上面两条都满足），文案里不要出现别的数字。

- [ ] **Step 2: 改 `Card` 类**

字段加 `private _power = false`、`private _exhaust = false`。方法：

```ts
  /** 能力牌：打出后不进任何牌堆，必须是自身目标 */
  power() {
    this._power = true
    this._target = 'self'
    return this
  }
  /** 打出后进消耗牌堆 */
  exhaust() {
    this._exhaust = true
    return this
  }
  applyStatus(status: string, stacks: number, to: 'self' | 'target' | 'allEnemies' = 'self') {
    return this.effect({ type: 'applyStatus', status, stacks, to })
  }
  heal(amount: number) {
    return this.effect({ type: 'heal', amount })
  }
```

`build()` 改为：

```ts
  build(): CardDef {
    const kind = this._power ? 'power' : this._target === 'enemy' ? 'attack' : 'skill'
    const effectsText = this._effects.map(effectText).join('，')
    return {
      id: this.id,
      ...(this._icon && { icon: this._icon }),
      rarity: this.rarity,
      name: this.name,
      cost: this._cost,
      target: this._target,
      kind,
      ...(this._exhaust && !this._power && { exhaust: true }),
      effects: this._effects,
      text: this._text ?? (this._exhaust && !this._power ? `${effectsText}，消耗` : effectsText),
    }
  }
```

`power()` 之后若又调用 `targetEnemy()` 会破坏约束；构建器内加一行校验：`build()` 开头 `if (this._power && this._target !== 'self') throw new Error(\`能力牌必须是自身目标：${this.id}\`)`。

- [ ] **Step 3: 在卡池追加示例卡牌**

放在 `pool` 数组末尾（保持已有卡牌顺序不变，种子结果才稳定）：

```ts
  Card.blue('bash', '痛击').icon('🔨').cost(2).damage(8).applyStatus('vulnerable', 2, 'target').reward(),
  Card.white('intimidate', '恐吓')
    .icon('😈')
    .cost(0)
    .targetSelf()
    .applyStatus('weak', 1, 'allEnemies')
    .exhaust()
    .reward(),
  Card.white('bandage', '绷带').icon('🩹').cost(1).targetSelf().heal(6).exhaust().reward(),
  Card.blue('venom', '毒针').icon('🪡').cost(1).applyStatus('poison', 4, 'target').reward(),
  Card.gold('inflame', '燃烧').icon('🔥').cost(1).power().applyStatus('strength', 2).reward(),
  Card.gold('footwork', '灵巧步法').icon('🦶').cost(1).power().applyStatus('dexterity', 2).reward(),
  Card.gold('ironBody', '钢铁之躯').icon('🦾').cost(1).power().applyStatus('metallicize', 3).reward(),
  Card.gold('thornArmor', '荆棘护甲').icon('🌵').cost(1).power().applyStatus('thorns', 3).reward(),
```

> `venom` 没有 `damage` 效果但 `target` 是 enemy：`Card` 默认 `_target = 'enemy'`，所以它是需要选目标的攻击型卡牌（kind 为 attack）。这是预期行为。

- [ ] **Step 4: 改 `enemies.ts`：新增 `sporeSlime`**

```ts
export const sporeSlime: EnemyDef = {
  id: 'spore-slime',
  name: '孢子史莱姆',
  maxHp: 40,
  intents: [
    { type: 'debuff', status: 'weak', stacks: 1 },
    { type: 'attack', damage: 8 },
    { type: 'defend', block: 6 },
  ],
}
```

`slimeGroup` 第三项改为 `{ ...sporeSlime, id: 'slime-3' }`（`slime-1`、`slime-2` 不变）。

- [ ] **Step 5: 在 `statuses.test.ts` 追加卡池测试**

```ts
describe('Card 构建器', () => {
  it('能力牌：kind 为 power，自身目标，文案自动生成', () => {
    const c = cards.inflame!
    expect(c.kind).toBe('power')
    expect(c.target).toBe('self')
    expect(c.text).toBe('获得 2 层力量')
  })
  it('消耗牌文案带"消耗"，且不是能力牌', () => {
    expect(cards.bandage).toMatchObject({ kind: 'skill', exhaust: true, text: '恢复 6 点生命，消耗' })
  })
  it('痛击：攻击牌 + 给予易伤', () => {
    expect(cards.bash).toMatchObject({ kind: 'attack', text: '造成 8 点伤害，给予 2 层易伤' })
  })
  it('附魔后状态层数与文案同步 +1', () => {
    const s = createBattle({
      seed: 1,
      deck: ['inflame*', 'defend', 'defend', 'defend', 'defend'],
      enemy: slime,
      cards,
    }).state
    const id = s.hand.find((c) => c.startsWith('inflame*'))!
    const hand = [id]
    const { state } = dispatch({ ...s, hand }, { type: 'playCard', handIndex: 0 })
    expect(state.player.statuses.strength).toBe(2)
    expect(state.cards[id]!.text).toBe('获得 3 层力量')
  })
})
```

- [ ] **Step 6: Commit**

```bash
git add src/data/cards.ts src/data/enemies.ts src/engine/statuses.test.ts
git commit -m "feat: 卡池支持能力牌/消耗/状态/治疗，新增示例卡牌与孢子史莱姆"
```

---

### Task 5: 界面

**Files:**
- Create: `src/ui/StatusIcons.vue`
- Modify: `src/ui/EnemyView.vue`、`src/ui/BattleView.vue`、`src/ui/CardView.vue`

**Interfaces:**
- Consumes: `STATUSES`、`statusDescription`、`calcAttack`、`Intent` 新类型
- Produces: `<StatusIcons :statuses="..." />`

- [ ] **Step 1: 新建 `StatusIcons.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { STATUSES, statusDescription } from '@/engine/statuses'

const props = defineProps<{ statuses: Record<string, number> }>()

/** 按注册表顺序显示，层数为 0 的不显示 */
const items = computed(() =>
  STATUSES.filter((d) => (props.statuses[d.id] ?? 0) > 0).map((d) => ({
    def: d,
    stacks: props.statuses[d.id]!,
  })),
)
</script>

<template>
  <div v-if="items.length" class="flex flex-wrap justify-center gap-1">
    <div
      v-for="item in items"
      :key="item.def.id"
      class="relative w-7 h-7 flex items-center justify-center rounded border-2 bg-slate-800 text-sm cursor-help"
      :class="item.def.kind === 'buff' ? 'border-emerald-400' : 'border-red-400'"
      :title="statusDescription(item.def.id, item.stacks)"
    >
      {{ item.def.icon }}
      <span
        class="absolute -right-1 -bottom-1 min-w-4 px-0.5 rounded bg-black/80 text-[10px] leading-4 text-center text-white"
      >
        {{ item.stacks }}
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 改 `EnemyView.vue`**

脚本部分改为：

```ts
import { calcAttack, statusById } from '@/engine/statuses'
import type { EnemyState, Intent } from '@/engine/types'
import StatusIcons from './StatusIcons.vue'

defineProps<{
  enemy: EnemyState
  intent: Intent | null
  /** 玩家当前状态：用于把攻击意图换算成最终伤害 */
  playerStatuses: Record<string, number>
  hovered?: boolean
}>()
```

意图区域替换为：

```vue
    <div
      v-if="intent && enemy.hp > 0"
      class="text-lg font-bold"
      :class="{
        'text-red-400': intent.type === 'attack',
        'text-sky-300': intent.type === 'defend',
        'text-purple-300': intent.type === 'debuff' || intent.type === 'buff',
      }"
    >
      <template v-if="intent.type === 'attack'">
        ⚔ {{ calcAttack(intent.damage, enemy.statuses, playerStatuses) }}
      </template>
      <template v-else-if="intent.type === 'defend'">🛡 {{ intent.block }}</template>
      <template v-else>
        {{ intent.type === 'debuff' ? '🔻' : '🔺' }} {{ statusById[intent.status]?.icon }}
        {{ intent.stacks }}
      </template>
    </div>
```

血量行里删除 `enemy.vulnerable` 那个 `<span>`，并在该 `<div class="text-sm">` 之后加：

```vue
    <StatusIcons :statuses="enemy.statuses" />
```

- [ ] **Step 3: 改 `BattleView.vue`**

`<EnemyView>` 增加 `:player-statuses="state.player.statuses"`；`import StatusIcons from './StatusIcons.vue'`；玩家信息区在 `🛡` 那一行之后加：

```vue
        <StatusIcons :statuses="state.player.statuses" />
```

（玩家区 `w-48`，图标会换行，不影响布局。）

- [ ] **Step 4: 改 `CardView.vue`**

`TYPES` 加：

```ts
  power: {
    label: '能力',
    art: 'radial-gradient(circle at 50% 40%, #7e22ce, #2e1065 80%)',
    icon: '✨',
  },
```

`type` 计算属性改为 `TYPES[props.card.kind]`；类型行改为：

```vue
        <div class="type">
          — {{ type.label }}<template v-if="card.exhaust"> · 消耗</template> —
        </div>
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/StatusIcons.vue src/ui/EnemyView.vue src/ui/BattleView.vue src/ui/CardView.vue
git commit -m "feat: 状态图标、最终伤害意图、能力/消耗牌标记"
```

---

## Self-Review

**Spec 覆盖：**
- 第 1 节状态模型/注册表/第一批状态/结算顺序 → Task 1；`vulnerable` 迁移与圆盾 → Task 1；测试迁移 → Task 1 Step 5。
- 第 2 节效果、`kind`/`exhaust`、牌去向、附魔 `bumpEffect` → Task 2。
- 第 3 节触发时机 → Task 3（含两处刻意偏差，见开头）。
- 第 4 节意图 → Task 3（类型与执行）、Task 4（`sporeSlime`）、Task 5（最终伤害显示）。
- 第 5 节事件 → `statusApplied`(T1)、`healed`/`statusRemoved`/`statusTriggered`(T2 类型、T3 发出)。
- 第 6 节构建器与文案 → Task 4。
- 第 7 节界面 → Task 5。
- 第 8 节测试 → 各任务的 `statuses.test.ts` 追加块。

**占位扫描：** 无 TBD/TODO；所有代码步骤均给出实际代码。

**类型一致性：** `addStatus(s, side, enemyIndex, id, stacks, events)`、`heal(s, side, enemyIndex, amount, events)`、`loseHp`/`runTurnTriggers`/`tickStatuses` 的参数顺序在各任务中一致；`calcAttack(base, attacker, defender)` 在 `effects.ts`、`battle.ts`、`EnemyView.vue` 中调用一致；`statusDescription(id, stacks)` 在 `StatusIcons.vue` 使用一致。

**已知风险：** Task 2 引入必填 `CardDef.kind` 后，`cards.ts` 的 `build()` 需同步修改才能通过类型检查（已在 Task 2 末尾注明处理方式）。按用户要求，计划中不包含运行测试/类型检查的步骤。
