# 精英「汲取者」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出第一只精英「汲取者」：玩家每打出一张牌，本回合力量 -1、敏捷 -1（可为负），回合结束恢复；精英节点出它。

**Architecture:** 状态系统新增"可为负层数"的写入口 `shiftStatus` 与 `collect` 对非 0 层生效；敌人被动「汲取」是一个新的状态钩子 `afterPlayerCard`，在 `playCard` 结算完后触发，削减量记在玩家身上的 `drained` 状态里，玩家回合结束时把 `drained` 数值加回力量和敏捷。精英出怪配置仿照 `boss`（`RunContent.elite`）。

**Tech Stack:** Vue 3 + TypeScript，vitest（纯函数引擎）。

**Spec:** `docs/superpowers/specs/2026-10-20-drain-elite-design.md`

## Global Constraints

- 引擎纯函数，战斗由种子决定；不引入随机。
- 意图固定循环：攻击 8 → 格挡 12 → 攻击 14；80 生命；开战自带「汲取」1。
- 减益必须在回合结束恢复；力量/敏捷可为负，伤害与格挡结算最低 0（`fold` 已保证）。
- 界面不出现 "+-N"。
- 药水不触发；汲取者死亡（含被该牌杀死）不触发；事件战斗不受影响。
- 不提交 git。

## Review Focus

- 致命一击：杀死汲取者的那张牌不触发削弱（Task 2）。
- 0 费牌、能力牌也计数（Task 2）。
- 回合开始前已有力量/敏捷（如 +2），回合结束精确回到原值（Task 2）。
- 力量降到负数后：攻击面板伤害 0 不为负；`drained` 与力量互相抵消到 0 时状态被移除（Task 1、2）。
- 负数显示：悬浮说明与图标层数不出现 "+-"（Task 1）。
- 事件战斗、普通怪节点不出精英（Task 3）。

---

### Task 1: 状态系统支持负层数

**Files:**
- Modify: `src/engine/statuses.ts`（`collect`、`statusDescription`、`statusTip`）
- Modify: `src/engine/effects.ts`（新增 `shiftStatus`）
- Modify: `src/ui/StatusIcons.vue`（过滤 `> 0` 改为 `!== 0`）
- Test: `src/engine/statuses.test.ts`

**Interfaces:**
- Produces: `shiftStatus(s: BattleState, side: Side, enemyIndex: number, id: string, delta: number, events: GameEvent[]): void` —— delta 可为负；结果为 0 时 `delete` 并发 `statusRemoved`，否则发 `statusApplied`（stacks = delta）；未知 id 抛错。`addStatus` 保持不变（`stacks <= 0` 忽略）。
- Produces: `collect` 对 `stacks !== 0` 生效（仅 strength/dexterity 会出现负数）。
- Produces: 文案填充函数（内部）：`+N` 在 n<0 时写成 `-3` 而非 `+-3`。

- [ ] **Step 1: 写失败测试**（statuses.test.ts）
  - `calcAttack(6, { strength: -2 }, {})` = 4；`calcAttack(6, { strength: -9 }, {})` = 0。
  - `calcBlock(5, { dexterity: -5 })` = 0；`calcBlock(5, { dexterity: -2 })` = 3。
  - `statusDescription('strength', -3)` 不含 `+-`，且含 `-3`；`statusTip(statusById.strength, -3).total` 不含 `+-`。
  - `shiftStatus` 测试（可放 enemies.test.ts 用 `fight`）：+1 后 -1 → 状态被删除（`statuses.strength` 为 undefined）；-2 → 值为 -2。
- [ ] **Step 2: 运行** `npx vitest run src/engine/statuses.test.ts`，预期 FAIL
- [ ] **Step 3: 实现** 上述 Interfaces；`StatusIcons.vue` 过滤改 `!== 0`，层数徽章直接显示 `item.stacks`（负数自然带 `-`）。
- [ ] **Step 4: 运行**同命令，预期 PASS；`npx vue-tsc --noEmit` 无新增错误

### Task 2: 被动「汲取」与回合结束恢复

**Files:**
- Modify: `src/engine/statuses.ts`（`StatusDef` 加 `afterPlayerCard?: (stacks: number) => { strength: number; dexterity: number }`；新增状态 `drain`（汲取 🩸，buff 类放敌人身上，text：`玩家每打出一张牌，本回合力量 -N、敏捷 -N`，decay none）与 `drained`（枯竭 🥀，debuff，text：`回合结束时恢复 N 点力量和敏捷`，decay none），均追加在 `STATUSES` 末尾）
- Modify: `src/engine/battle.ts`（`playCard` 里 `fireRelics(s,'onCardPlayed',...)` 之后、`endBattleIfOver` 之前：遍历**存活**敌人的状态，调用 `afterPlayerCard`，对玩家 `shiftStatus` strength/dexterity 各 `-amount`，并 `shiftStatus(... 'drained', +amount)`；`endTurn` 里在 `tickStatuses(player)` 附近：若 `drained > 0`，把 strength、dexterity 各 `+drained` 经 `shiftStatus` 加回并移除 `drained`）
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `shiftStatus`。
- Produces: 状态 id `drain`、`drained`；`drained` 的层数 = 本回合已被削弱的总量（strength 与 dexterity 削弱量相同，故一个数即可）。

- [ ] **Step 1: 写失败测试**（沿用 `fight`/`dummy`，敌人 `startStatuses: { drain: 1 }`，maxHp 100）
  - `汲取：打出一张牌后力量 -1、敏捷 -1`；第一张牌伤害仍为 6（先结算后削弱）。
  - `汲取：连打 3 张后力量 -3、敏捷 -3；第 4 张的伤害面板 = max(0, 6-3)`。
  - `汲取：0 费牌也触发`（strike cost 0）。
  - `汲取：致命一击不触发`（敌人 hp 6，一张 strike 杀死后玩家无 strength/dexterity/drained）。
  - `汲取：药水不触发`（若 usePotion 可在测试中使用；否则跳过此条并说明）。
  - `汲取：回合结束精确恢复`：玩家初始 `statuses.strength = 2`，打 2 张牌后结束回合，`res.state`（新回合）`player.statuses.strength === 2`、`dexterity` undefined、`drained` undefined。
  - `汲取：力量为负时伤害面板为 0 不为负`：strength 初始 0，削到 -9 后 `calcAttack(6, statuses, {})` = 0。
  - `汲取：力量被削回 0 时状态移除`：初始 strength 1，打一张牌后 `statuses.strength` 为 undefined。
  - `汲取：多只汲取者叠加`：两只敌人各自 drain 1，打一张牌后力量 -2。
- [ ] **Step 2: 运行** `npx vitest run src/engine/enemies.test.ts`，预期 FAIL
- [ ] **Step 3: 实现** 上述修改；`drain.afterPlayerCard = (n) => ({ strength: n, dexterity: n })`。
- [ ] **Step 4: 运行**测试预期 PASS；`npx vitest run` 全绿

### Task 3: 精英数据与精英节点出怪

**Files:**
- Modify: `src/data/enemies.ts`（新增 `drainer`：id `drainer`，name `汲取者`，icon `🧛`，maxHp 80，`startStatuses: { drain: 1 }`，intents：`{type:'attack',damage:8}`、`{type:'defend',block:12}`、`{type:'attack',damage:14}`）
- Modify: `src/engine/run.ts`（`RunContent.elite?: EnemyDef`；`createRun` 复制；`battleEnemies` 里 `type === 'elite' && content.elite && !run.eventBattle` → `[elite]`，放在 boss 判断旁）
- Modify: `src/composables/useRun.ts`（`content()` 增加 `elite: drainer`，并从 enemies 导入）
- Modify: `src/ui/EnemyView.vue`：无需改动（只确认攻击意图经 `calcAttack` 正常显示）
- Test: `src/engine/run.test.ts`、`src/engine/enemies.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `drain` 状态。
- Produces: `drainer: EnemyDef`；`RunConfig/RunContent.elite?: EnemyDef`。

- [ ] **Step 1: 写失败测试**
  - enemies.test.ts：`drainer 数据`：maxHp 80、`startStatuses.drain === 1`、intents 依次为 attack 8 / defend 12 / attack 14。
  - run.test.ts：`精英节点出汲取者`（仿现有 Boss 节点测试，配置 `elite`，进入 elite 节点后 `battle.enemies` 为 1 只 `drainer`）；`事件战斗不受精英配置影响`（`eventBattle` 存在时走事件敌人）；未配置 `elite` 时精英节点回落到原行为。
- [ ] **Step 2: 运行** `npx vitest run src/engine/run.test.ts src/engine/enemies.test.ts`，预期 FAIL
- [ ] **Step 3: 实现** 上述修改。
- [ ] **Step 4: 运行** `npx vitest run` 与 `npx vue-tsc --noEmit`，预期测试全绿、tsc 无新增错误

---

## Self-Review

- 覆盖：被动（T2）、负层数（T1）、回合结束恢复（T2）、精英节点（T3）、固定意图与数值（T3）、UI 负数显示（T1）。
- 类型一致：`shiftStatus` 在 T1 定义，T2 使用；`drain`/`drained` id 在 T2 定义，T3 使用。
- 实现者可自行决定：图标/文案/动画细节；`afterPlayerCard` 返回结构如有更合适的可调整，但需保持 Interfaces 对外名称。
