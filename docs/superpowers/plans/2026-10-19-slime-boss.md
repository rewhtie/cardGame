# 史莱姆老大 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 Boss「史莱姆老大」：固定循环（喷粘液、蓄力、重击），血量过半当场分裂成大尖刺和大酸液，大史莱姆再各自分裂成两只中史莱姆；Boss 节点出这只 Boss。

**Architecture:** 在上一轮的分裂机制上，把 `EnemyDef.splitInto` 从单个敌人改成列表；给 `Intent` 加"塞牌"、"空过"，并让攻击意图可附带塞牌；新增脆弱状态和粘液状态牌；`RunContent` 加 `boss`，Boss 节点用它开战。

**Tech Stack:** Vue 3 + TypeScript、Vitest（`npx vitest run`）。

**Spec:** [2026-10-19-slime-boss-design.md](../specs/2026-10-19-slime-boss-design.md)（背景见 [enemy-mechanics 设计](../specs/2026-10-19-enemy-mechanics-design.md) 和 [其计划](2026-10-19-enemy-mechanics.md)）

## Global Constraints

- 敌人的意图是固定循环，`intentIndex` 只在行动后 +1；不得加"分裂"意图，分裂是被动、血量一过半当场发生。
- 同时存活敌人上限 `MAX_ENEMIES = 4`。分裂要一次放进多只敌人时，用"分裂后存活数不超过 4"判断：`livingCount(s) - 1 + splitInto.length <= MAX_ENEMIES`。
- 新状态加在 `STATUSES` 末尾，不调换已有顺序。
- 粘液是可打出的状态牌：费用 1、打出后消耗、没有其他效果；晕眩（无法打出）保持不变。
- 脆弱：获得的格挡 ×0.75，每回合 -1（`decay: 'tick'`）。
- 不提交：工作区有大量不相关的未提交改动，提交由用户决定，所以计划里没有 commit 步骤。
- 类型检查 `npx vue-tsc --noEmit`：`tools/cardCodegen.ts` 有已有的语法错误，除此之外不得新增错误。

## Review Focus

1. 大史莱姆在场上还有别的存活敌人时，分裂后超过 4 只：不分裂，继续战斗。→ Task 1
2. 分裂后的两只各带分裂时的剩余生命（不是满血）。→ Task 1
3. 粘液牌在手里回合结束时：照常进弃牌堆，不是消耗；打出才消耗。→ Task 2
4. 空过（蓄力）回合：不对玩家造成任何影响，意图循环照常 +1。→ Task 3
5. 中史莱姆不会再分裂，打到 1 血也只是普通敌人。→ Task 4

---

## 文件结构

- `src/engine/types.ts`：`EnemyDef.splitInto` 改列表；`Intent` 新增 `addCards`、`idle`，`attack` 增加可选 `addCards`。
- `src/engine/effects.ts`：分裂改为按列表生成（`applyDamage` 内）。
- `src/engine/battle.ts`：新意图的结算。
- `src/engine/statuses.ts`：脆弱。
- `src/data/cards/curses.ts`：粘液。
- `src/data/enemies.ts`：五份敌人数据；`splitSlime` 的 `splitInto` 改列表。
- `src/engine/run.ts`：`RunContent.boss`，Boss 节点开战。
- `src/composables/useRun.ts`：传入 `boss`。
- `src/ui/EnemyView.vue`：新意图显示。
- `src/engine/enemies.test.ts`（已有，追加）、`src/engine/run.test.ts`（已有，追加）。

---

### Task 1: 分裂目标改为列表

**Files:**
- Modify: `src/engine/types.ts`（`EnemyDef.splitInto?: EnemyDef[]`）
- Modify: `src/engine/effects.ts`（`applyDamage` 中的分裂段）
- Modify: `src/data/enemies.ts`（`splitSlime.splitInto: [smallSlime, smallSlime]`）
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Produces: `EnemyDef.splitInto?: EnemyDef[]`（按顺序追加到敌人列表末尾，每只生命都等于分裂时的剩余生命）；`enemySplit` 事件的 `spawned` 为新敌人下标数组（含义不变）。

- [ ] **Step 1: 改写已有测试并追加。** 把"分裂与召唤"里的 `splitter` 改为 `splitInto: [child, child]`，已有三条分裂断言保持不变（过半分裂成两只 / 一击打死不分裂 / 满 4 只不分裂）。追加：
  - `不同种类一次分出`：`splitInto: [childA, childB]`（`id` 不同），分裂后 `enemies[1].def.id === 'a'`、`enemies[2].def.id === 'b'`，两只 `hp` 都等于分裂时的剩余生命（重点 2）。
  - `分裂后会超过 4 只则不分裂`：敌人为 `[splitter, dummy(), dummy()]`（存活 3 只，分裂会变成 4 只 → 允许），再一个用例是 `[splitter, dummy(), dummy(), dummy()]`（存活 4 只，分裂后 5 只 → 不分裂，原敌人 `hp` 为扣血后的值，`enemies.length === 4`）（重点 1）。
- [ ] **Step 2: 运行确认失败** `npx vitest run src/engine/enemies.test.ts`，预期 FAIL（类型与旧分裂逻辑不匹配）。
- [ ] **Step 3: 实现。** `splitInto` 改成 `EnemyDef[]`；分裂条件里的上限判断改为 `livingCount(s) - 1 + splitInto.length <= MAX_ENEMIES`，按顺序对每个目标调用 `spawnEnemy(s, def, events, rest)`；`splitInto` 为空数组视为不分裂；`enemies.ts` 的 `splitSlime` 改为 `splitInto: [smallSlime, smallSlime]`。
- [ ] **Step 4: 运行确认通过** 本文件，再跑 `npx vitest run` 全量。

---

### Task 2: 粘液牌与脆弱

**Files:**
- Modify: `src/data/cards/curses.ts`（`slimed`）
- Modify: `src/engine/statuses.ts`（`frail`）
- Test: `src/engine/enemies.test.ts`、`src/engine/statuses.test.ts`

**Interfaces:**
- Produces: 卡牌 id `'slimed'`（状态牌，费用 1，可打出，打出后消耗，无效果）；状态 id `'frail'`。

- [ ] **Step 1: 写失败的测试。**
  - `statuses.test.ts`：`calcBlock(10, { frail: 1 })` 为 8（10×0.75 向下取整）；与敏捷叠加：`calcBlock(10, { frail: 1, dexterity: 2 })` 为 9（先加算后乘算：`floor(12×0.75)`）。
  - `enemies.test.ts` 的 `describe('粘液')`：用 `cards` 表（已含 curseCards），手牌换成 `['slimed']` 后 `playCard`：能量减 1、`exhaustPile` 含 `'slimed'`、`discardPile` 不含；不打出直接 `endTurn`：`discardPile` 含 `'slimed'`、`exhaustPile` 不含（重点 3）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `curses.ts` 加 `Card.status('slimed', '粘液').icon('🟢').cost(1).targetSelf().exhaust().text('消耗')`（按 `Card` 构建器要求补上其必需的 `kind`，没有效果）；`statuses.ts` 末尾加 `frail`（名称「脆弱」、图标 `🫧`、`debuff`、`decay: 'tick'`、文案「获得的格挡 ×0.75，每回合 -1」、`modifyBlock: () => ({ mul: 0.75 })`）。
- [ ] **Step 4: 运行确认通过。**

---

### Task 3: 新意图（塞牌、空过、攻击带塞牌）

**Files:**
- Modify: `src/engine/types.ts`（`Intent`）
- Modify: `src/engine/battle.ts`（`endTurn` 的意图 `switch`）
- Modify: `src/ui/EnemyView.vue`
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Produces: `Intent` 新增 `{ type: 'addCards'; cardId: string; count: number }`、`{ type: 'idle' }`；`attack` 意图增加可选字段 `addCards?: { cardId: string; count: number }`（攻击结算后往玩家弃牌堆塞，不管伤害是否被格挡完，只要攻击打出就塞）；塞牌时发 `{ type: 'cardAdded', cardId, count }` 事件。

- [ ] **Step 1: 写失败的测试** `describe('塞牌与蓄力')`：
  - `addCards` 意图 `{ cardId: 'slimed', count: 3 }`：`endTurn` 后 `discardPile` 里 `'slimed'` 恰好 3 张（注意玩家手牌已进弃牌堆，只数 `slimed`），事件含 `cardAdded`。
  - `attack` 带 `addCards`（`damage 10`、`slimed ×2`）：玩家 `block` 50（全挡住）时 `discardPile` 仍含 2 张 `'slimed'`，玩家生命不变。
  - `idle`（重点 4）：循环 `[idle, attack 5]`，第一次 `endTurn` 后玩家生命不变、`intentIndex === 1`、`discardPile` 里没有 `'slimed'`；第二次 `endTurn` 扣 5 生命。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `endTurn` 的 `switch` 里 `addCards` 分支推进牌并发 `cardAdded`；`attack` 分支在结算后同样处理可选的 `addCards`；`idle` 分支什么都不做（`enemyActed` 事件照发，供界面显示）。抽一个内部小函数 `addCardsToDiscard(s, cardId, count, events)`，蜂巢（`effects.ts` 的 `onHit`）里的同样逻辑若方便也改用它，但不强求。`EnemyView.vue` 意图区新增：`addCards` 显示 `🟢 +{count}`、`idle` 显示 `💤 蓄力`；`attack` 带 `addCards` 时在伤害数字后追加 `🟢{count}`；文字颜色沿用紫色（`addCards`、`idle`）。
- [ ] **Step 4: 运行确认通过，** 再 `npx vue-tsc --noEmit` 确认只剩已有错误。

---

### Task 4: 五份敌人数据

**Files:**
- Modify: `src/data/enemies.ts`
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `splitInto: EnemyDef[]`；Task 2 的 `'slimed'`、`'frail'`；Task 3 的 `addCards`、`idle`、`attack.addCards`。
- Produces: 导出 `mediumSpikeSlime`、`mediumAcidSlime`、`largeSpikeSlime`、`largeAcidSlime`、`slimeBoss`（均为 `EnemyDef`）。

- [ ] **Step 1: 写失败的测试** `describe('史莱姆老大数据')`（用真实数据，`cards` 表已含 `slimed`、`stun`；`fight` 的卡牌表需再加上 `slimed`，已含）：
  - 本体：`slimeBoss.maxHp === 140`，意图依次为 `addCards slimed ×3`、`idle`、`attack 35`；`startStatuses.split === 1`。
  - 整条分裂链：`fight([slimeBoss])` 后 `cheatDamage 70` → 本体消失，`enemies.length === 3`，`def.id` 依次为 `slimeBoss`（死）、大尖刺、大酸液，且后两只 `hp` 都是 70。
  - 再对场上存活敌人 `cheatDamage 40`：大尖刺 30 ≤ 32 → 分裂成两只中尖刺（`hp` 各 30）；大酸液 30 ≤ 34 → 分裂成两只中酸液；此时存活正好 4 只，`enemies.length === 7`（3 + 2 + 2，死者保留）（重点 1 的上限在此边界成立）。
  - 中史莱姆不再分裂（重点 5）：对任一中尖刺 `cheatDamage 25`，`hp === 5`，`enemies.length` 不变，`splitInto` 为 `undefined`。
  - 各小弟的意图序列按设计文档逐条断言（大尖刺：攻击 16 带 `slimed ×2` → `debuff frail 2`；大酸液：攻击 11 带 `slimed ×2` → `attack 16` → `debuff weak 2`；中尖刺：攻击 8 带 `slimed ×1` → `debuff frail 1`；中酸液：攻击 7 带 `slimed ×1` → `attack 10` → `debuff weak 1`）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现数据。** 图标：本体 `🟢`（沿用默认即可，不写 `icon`）；大史莱姆 `maxHp` 尖刺 64、酸液 68，`startStatuses: { split: 1 }`，`splitInto` 为各自对应的两只中史莱姆；中史莱姆 `maxHp` 尖刺 32、酸液 34（原版数值，实际生命来自分裂时的剩余生命）；本体 `splitInto: [largeSpikeSlime, largeAcidSlime]`。名称：史莱姆老大、大尖刺史莱姆、大酸液史莱姆、中尖刺史莱姆、中酸液史莱姆。
- [ ] **Step 4: 运行确认通过，** 全量 `npx vitest run`。

---

### Task 5: Boss 节点出史莱姆老大

**Files:**
- Modify: `src/engine/run.ts`（`RunContent.boss?: EnemyDef`、`createRun` 复制、`battleEnemies`）
- Modify: `src/composables/useRun.ts`（`content()` 加 `boss: slimeBoss`）
- Test: `src/engine/run.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `slimeBoss`。
- Produces: `RunContent.boss?: EnemyDef`；`battleEnemies(run, nodeId)` 在节点类型为 `boss` 且 `content.boss` 存在时返回 `[content.boss]`（事件触发的战斗不受影响）。

- [ ] **Step 1: 写失败的测试**（`run.test.ts`，沿用已有构造 run 的方式，给 content 加 `boss`）：进入 Boss 节点（用上帝模式 `chooseNode` 的 `god: true` 进入地图最后一层的 Boss）→ `battle.enemies.length === 1` 且 `def.id` 是 boss 的 id；不设 `boss` 时行为与原来一致（已有测试保持通过）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `battleEnemies` 里在怪物池判断之前加 Boss 判断；`createRun` 的 content 补 `boss: config.boss`；`useRun.ts` 的 `content()` 接上。
- [ ] **Step 4: 运行确认通过，** 全量 `npx vitest run`，再 `npx vue-tsc --noEmit`。
- [ ] **Step 5: 手动看一遍**（仅此步需要）：`npm run dev`，上帝模式进 Boss 节点，确认蓄力 / 塞粘液意图显示、粘液能打出并消耗、分裂时敌人排布不溢出（最多 4 只存活，死者保留会占位，若 7 个格子排不下，调整 `BattleView.vue` 的敌人行间距或让死者缩小）。

---

## 自检结果

- **Spec 覆盖：** 本体循环与分裂（T4、T1）、大 / 中史莱姆（T4）、粘液（T2）、脆弱（T2）、新意图（T3）、分裂目标列表（T1）、Boss 节点出怪（T5）。设计文档"引擎需要新增的能力"四项都有任务。
- **需要留意的一点：** 死亡的敌人保留在列表里，所以整条分裂链走完后 `enemies` 有 7 项，界面可能排不下，已写进 Task 5 的手动检查。
- **类型一致性：** `splitInto`、`addCards`、`idle`、`slimed`、`frail`、`boss` 在各任务里同名。
