# 随机事件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把地图上的 `event` 节点从占位界面换成真正的随机事件：16 个事件、4 张新牌（2 诅咒 + 2 增益诅咒）、种子可复现。

**Architecture:** 事件是纯数据（`EventDef`，选项由"结果原语"组成），引擎 `engine/event.ts` 负责抽取与结算，通过 `RunContent.events` 注入，不依赖 `data/`。`run.ts` 新增 `event` / `eventPick` 两个界面状态；选牌类结果暂停结算序列，选完继续。战斗类结果复用现有战斗与奖励流程。

**Tech Stack:** TypeScript、Vue 3、vitest（`pnpm vitest run`）、UnoCSS。

**Spec:** `docs/superpowers/specs/2026-10-19-random-events-design.md`

## Global Constraints

- 随机流：`deriveSeed(seed, 'event:' + 节点id)`；选项内的概率判定用 `deriveSeed(seed, 'event:' + 节点id + ':' + 选项下标)`。
- 事件定义里的生命代价最多扣到 1 点；`cost.hp` 选项在 `hp <= cost.hp` 时置灰，原因文字 `生命不足`；金币不足原因文字 `金币不足`。
- 诅咒牌稀有度 `'curse'`，不进奖励池、不进初始牌组；增益诅咒牌稀有度 `'gold'`，不进奖励池（不调用 `.reward()`、`.starter()`）。
- 事件权重：战斗类、诅咒类 0.7，其余 1。同一局事件不重复，全出完后清空 `seenEvents`。
- 所有用户可见文字用中文，沿用现有场景风格（`theme-bg`、emoji 图标）。
- 提交信息结尾加一行：`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- 数值照 spec，不要自行调整。

## Review Focus

- 牌组里没有可升级 / 可删的牌时，对应选项置灰、事件不进入候选（不能卡死在选牌界面）。
- 药水栏已满时获得药水：多余的丢弃，不报错。
- 遗物池已被拿空时 `relic` 结果：改为获得 50 金（我的决定），不报错。
- 金币扣费不会出现负数；`hp` 结果下限 1。
- 诅咒牌抽到手里不能打出，也不能让回合卡死（可以直接结束回合）。
- 事件战斗胜利后奖励里追加的金币 / 遗物只出现一次，不影响之后的普通战斗。

## File Structure

| 文件 | 职责 |
|------|------|
| `src/engine/types.ts`（改） | `Rarity` 加 `'curse'`；`CardDef` 加 `unplayable`、`endTurnLoseHp`；`Effect` 加 `loseHp` |
| `src/engine/effects.ts`、`battle.ts`、`enchant.ts`（改） | 结算新效果、拒绝出牌、回合结束扣血，并补全各 `switch` |
| `src/data/cards/curses.ts`（新） | 4 张新牌，并入 `cards/index.ts` |
| `src/engine/event.ts`（新） | `Outcome` / `EventDef` 类型、候选抽取、结果结算 |
| `src/data/events.ts`（新） | 16 个事件定义 |
| `src/engine/run.ts`（改） | 新界面、新操作、事件战斗奖励 |
| `src/ui/EventView.vue`、`EventPickView.vue`（新） | 事件界面、删/升级选牌界面 |
| `src/ui/RunView.vue`、`HandView.vue`、`composables/useRun.ts`（改） | 接线 |

---

### Task 1: 新卡牌能力与 4 张牌

**Files:**
- Modify: `src/engine/types.ts`、`src/engine/effects.ts`、`src/engine/battle.ts`、`src/engine/enchant.ts`、`src/data/cards/card.ts`、`src/data/cards/index.ts`、`src/ui/HandView.vue`
- Create: `src/data/cards/curses.ts`
- Test: `src/testing/curseCards.test.ts`（参照 `skillCards.test.ts` 与 `cardHarness.ts` 的写法）

**Interfaces:**
- Produces: `Effect` 新增 `{ type: 'loseHp'; amount: number }`；`CardDef.unplayable?: boolean`；`CardDef.endTurnLoseHp?: number`；`Rarity` 含 `'curse'`；`Card` 构建器新增 `.curse()`（稀有度 curse，目标自身，kind skill）、`.unplayable()`、`.endTurnLoseHp(n)`、`.loseHp(n)`；`curseCards: Card[]`；卡牌 id：`wound`、`burn`、`bloodPact`、`frenzy`。

- [ ] **Step 1: 写失败测试** `curseCards.test.ts`，用户的 harness 构造战斗，断言：
  - 手牌有 `wound` 时 `playCard` 返回含 `invalidAction` 事件，状态不变。
  - 手牌有 `burn` 时 `endTurn` 后玩家 hp 比 80 少 2（用 `startingHp` 对照）。
  - `bloodPact`（0 费）打出后玩家 hp -4，敌人 hp -18；升级版 -24。
  - `frenzy` 打出后 hp -5、能量 +2、抽 2 张、进消耗牌堆；升级版抽 3 张。
  - `rewardCardIds` 与 `starterDeck` 都不含这 4 张牌。
- [ ] **Step 2: 运行确认失败**：`pnpm vitest run src/testing/curseCards.test.ts`，预期 FAIL（卡牌不存在）。
- [ ] **Step 3: 实现**
  - `types.ts` 加上述类型字段；`Effect` 新增后，`effects.ts` 的 `resolveEffect` 增加 `case 'loseHp'`（调用已有的 `loseHp(s,'player',0,amount,events)`）；`card.ts` 的 `effectText` 增加 `失去 N 点生命`；`enchant.ts` 的 `bumpEffect` / `upgradeEffect` / `effectNumber` 对 `loseHp` 原样返回（不成长、不升级）。
  - `battle.ts` `playCard`：在能量检查前，`card.unplayable` 返回 `invalid(state, '这张牌无法打出')`。`endTurn`：弃手牌之前，遍历手牌，对每张 `endTurnLoseHp` 的牌调用 `loseHp`。
  - `HandView.vue`：`playable` 增加 `&& !card.unplayable`。
  - `curses.ts`：伤口（`curse`，unplayable，文案 `无法打出`）、灼伤（`curse`，unplayable，`endTurnLoseHp(2)`，文案 `无法打出。回合结束时若在手牌中，失去 2 点生命`）、血之契约（gold，0 费，`loseHp(4)` 后 `damage(18)`，升级 `damage(24)`，图标 🩸）、狂乱（gold，0 费，自身，`loseHp(5)`、`gainEnergy(2)`、`draw(2)`、exhaust，升级 `draw(3)`，图标 🌀）。`index.ts` 在 `powerCards` 之后并入 `curseCards`。
- [ ] **Step 4: 运行确认通过**：同 Step 2 命令，再跑 `pnpm vitest run`（全部），预期 PASS。
- [ ] **Step 5: 提交** `feat: add curse and tradeoff cards`

---

### Task 2: 事件引擎（抽取 + 结果结算）

**Files:**
- Create: `src/engine/event.ts`
- Modify: `src/engine/run.ts`（仅类型：`RunState.event`、`seenEvents`、`RunContent.events`、`RunScreen` 加 `'event' | 'eventPick'`、`RunState.eventBattle`）
- Test: `src/engine/event.test.ts`

**Interfaces:**
- Produces（`event.ts`）：
```ts
export type Outcome =
  | { type: 'gold'; amount: number } | { type: 'hp'; amount: number }
  | { type: 'maxHp'; amount: number } | { type: 'relic' }
  | { type: 'potion'; count: number } | { type: 'addCard'; id: string }
  | { type: 'removeCard' } | { type: 'upgradeCard' }
  | { type: 'upgradeRandom'; count: number }
  | { type: 'battle'; kind: 'monster' | 'elite'; bonus?: { gold?: number; relic?: boolean } }
  | { type: 'chance'; p: number; win: Outcome[]; lose: Outcome[] }
export interface EventOption {
  label: string
  cost?: { gold?: number; hp?: number }
  requires?(run: RunState): string | null   // 不可选的原因
  outcomes: Outcome[]
}
export interface EventDef {
  id: string; title: string; icon: string; text: string; weight?: number
  requires?(run: RunState): boolean
  options: EventOption[]
}
export interface EventState {
  id: string
  result: string[]            // 已发生的结果文字，逐行展示
  pending: Outcome[]          // 选牌暂停后尚未结算的结果
  pick: 'remove' | 'upgrade' | null
  optionIndex: number | null  // 已选的选项；null 表示还没选
}
export function pickEvent(run: RunState, nodeId: string): EventDef   // 抽取，含 seenEvents 规则
export function optionDisabled(run: RunState, opt: EventOption): string | null
export function resolveOutcomes(run: RunState, outcomes: Outcome[], rng: Rng): RunState
```
  `RunState` 新增：`event: EventState | null`、`seenEvents: string[]`、`eventBattle?: { kind: 'monster' | 'elite'; bonus?: { gold?: number; relic?: boolean } } | null`；`RunContent.events?: EventDef[]`。`createRun` 初始化 `event: null, seenEvents: []`。

- [ ] **Step 1: 写失败测试** `event.test.ts`（用小的假 `EventDef` 数组，不依赖 `data/`）：
  - `pickEvent`：同 run、同 nodeId 两次结果相同；不同 nodeId 在 20 个节点上至少出现 2 种事件；已在 `seenEvents` 的不会再抽；全部见过时仍返回事件；`requires` 返回 false 的事件永不抽到。
  - `optionDisabled`：金币 30 / `cost.gold 50` → `'金币不足'`；hp 10 / `cost.hp 10` → `'生命不足'`；`requires` 的原因原样返回；够用返回 `null`。
  - `resolveOutcomes`：`gold -999` 后金币为 0；`hp -999` 后 hp 为 1；`hp +999` 不超过最大生命；`maxHp +5` 同步增加当前生命；`potion count 2` 在只剩 1 个栏位时只加 1 瓶、不抛错；`addCard` 把牌加入 `content.deck`；`relic` 在遗物池拿空时改为 +50 金；`upgradeRandom 2` 升级牌组中 2 张不同的未升级牌；`chance p:1` 恒走 win，`p:0` 恒走 lose。
  - 遇到 `removeCard` / `upgradeCard`：返回的 state `screen === 'eventPick'`，`event.pick` 正确，`event.pending` 是其后的剩余结果。遇到 `battle`：`eventBattle` 被设置，`screen` 不变（由 Task 4 创建战斗）。
- [ ] **Step 2: 运行确认失败**：`pnpm vitest run src/engine/event.test.ts`，预期 FAIL（模块不存在）。
- [ ] **Step 3: 实现 `event.ts`**
  - `pickEvent`：候选 = `content.events` 去掉 `seenEvents`、再去掉 `requires?.(run) === false`；候选为空时先忽略 `seenEvents` 重算；按 `weight ?? 1` 加权抽取，随机流 `createRng(deriveSeed(run.seed, 'event:' + nodeId))`。
  - `resolveOutcomes`：顺序结算，每步把一行文字 push 进 `event.result`（如 `获得 50 金币`、`失去 8 点生命`、`获得遗物：{name}` —— 遗物名由 `run.content` 提供不了，这里只写 `获得一件遗物`）；`relic` 复用 `run.ts` 里已导出的 `grantRelic`（候选 = `content.relicIds` 去掉已拥有）；`potion` 候选来自 `content.potionIds`，用传入的 `rng`；`upgradeRandom` 用 `upgradedId`。遇到 `removeCard` / `upgradeCard`：保存 `pending = 后续结果`，设置 `screen:'eventPick'`、`event.pick`，立即返回。遇到 `battle`：设置 `eventBattle`，丢弃后续结果，返回。
  - 为避免 `event.ts` 与 `run.ts` 循环依赖：`grantRelic` 通过 `resolveOutcomes` 的参数注入，或把需要的函数从 `run.ts` 导入（`import type` 之外的导入需确认无循环；若有循环，把 `grantRelic` 作为 `resolveOutcomes` 的第四个参数传入）。
- [ ] **Step 4: 运行确认通过**：Step 2 的命令，预期 PASS。
- [ ] **Step 5: 提交** `feat: event engine with outcome resolution`

---

### Task 3: 16 个事件数据

**Files:**
- Create: `src/data/events.ts`
- Test: `src/data/events.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `EventDef` / `Outcome`；Task 1 的卡牌 id。
- Produces: `export const events: EventDef[]`（16 个，顺序按 spec 的八个类别）。

- [ ] **Step 1: 写失败测试**：
  - 恰好 16 个事件，id 唯一，每个事件 ≥ 2 个选项。
  - 所有 `addCard` 的 id 都存在于 `cards`（从 `@/data/cards` 导入）。
  - 每个事件至少有一个"永远可选"的选项（`outcomes` 无 `cost`、无 `requires`），保证不会卡死。
  - 战斗类两个事件（`ambush`、`monsterLair`）权重 0.7；诅咒类两个（`demonPact`、`whisperingStatue`）权重 0.7。
  - `removeCard` / `upgradeCard` 出现的选项必须带 `requires`（牌组里有可删 / 可升级的牌）。
- [ ] **Step 2: 运行确认失败**：`pnpm vitest run src/data/events.test.ts`。
- [ ] **Step 3: 实现**：照 spec 的"事件清单"逐个写入，id 用驼峰英文：`forgetfulSpring`、`wanderingTailor`、`oldSmith`、`knifeGrinder`、`mysticAltar`、`rustyChest`、`demonPact`、`whisperingStatue`、`roadsideGambler`、`fallenMerchant`、`ambush`、`monsterLair`、`bloodAltar`、`frenzyRune`、`potionVendor`、`poisonSwamp`。文案、数值、选项逐字照 spec；`battle` 的额外奖励写在 `bonus`（`ambush` 为 `{ gold: 40 }`，`monsterLair` 为 `{ relic: true }`）；`fallenMerchant` 搜刮选项用 `chance p:0.4` 且 win 为 `battle monster`、lose 为空，并在其前先 `gold +120`；`demonPact` 的拒绝选项 `hp +10`。可选性检查（金币 / 生命 / 可升级牌）放进各选项的 `cost` 与 `requires`。
- [ ] **Step 4: 运行确认通过**：Step 2 的命令。
- [ ] **Step 5: 提交** `feat: add 16 random events`

---

### Task 4: 一局流程接入

**Files:**
- Modify: `src/engine/run.ts`
- Test: `src/engine/run.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 的 `pickEvent`、`optionDisabled`、`resolveOutcomes`、`EventState`。
- Produces: `RunAction` 新增 `{ type: 'chooseEventOption'; index: number }`、`{ type: 'eventPickCard'; deckIndex: number }`；`chooseNode` 遇 `event` 节点进入 `event` 界面；`leave` 在事件结算完成后回到地图。

- [ ] **Step 1: 写失败测试**（追加到 `run.test.ts`，用 Task 2 测试里的假事件注入 `content.events`）：
  - 进入 event 节点 → `screen === 'event'`，`event.id` 在 `seenEvents` 里。
  - `chooseEventOption` 选不可选项（金币不足）→ `invalidAction`，状态不变。
  - 选一个纯金币选项 → 金币变化，`event.optionIndex` 已设置，`event.result` 非空；此时再次 `chooseEventOption` → `invalidAction`；`leave` → `screen === 'map'` 且 `event === null`。
  - 选 `removeCard` 选项 → `screen === 'eventPick'`；`eventPickCard` 删除对应牌并继续结算 `pending`，之后回到 `screen === 'event'`（可 `leave`）。`upgradeCard` 同理，且升级已升级的牌 → `invalidAction`。
  - 选 `battle` 选项 → `screen === 'battle'`；战斗胜利 `continue` 后，奖励里有额外 `gold`（`bonus.gold`）；`bonus.relic` 时有一个 `relic` 奖励；`finishRewards` 后 `eventBattle === null`，回到地图。精英类事件战斗按 `elite` 的奖励表生成。
- [ ] **Step 2: 运行确认失败**：`pnpm vitest run src/engine/run.test.ts`。
- [ ] **Step 3: 实现**
  - `chooseNode` 的 `case 'event'`：`pickEvent` → `screen:'event'`，`event: { id, result: [], pending: [], pick: null, optionIndex: null }`，`seenEvents` 追加该 id；若 `content.events` 为空则回落到原占位界面。
  - `chooseEventOption(run, index)`：校验在 `event` 界面且 `optionIndex === null`、选项存在、`optionDisabled` 为 `null`；扣 `cost`；结果为空数组时 `result = ['你转身离开了。']`；调用 `resolveOutcomes`；若结算后 `eventBattle` 已设置，则创建战斗（复用 `chooseNode` 里创建战斗的代码，抽成内部函数 `startBattle(run, nodeId)`），`screen:'battle'`。
  - `eventPickCard(run, deckIndex)`：校验 `screen === 'eventPick'`；`remove` 删牌（牌组为空时拒绝）、`upgrade` 用 `upgradedId`（已升级则 `invalidAction`），结果文字写入 `result`；然后 `screen:'event'`，对 `pending` 调 `resolveOutcomes` 继续。
  - `generateRewards`：`run.eventBattle` 存在时，`kind` 取 `eventBattle.kind`，并追加 `bonus.gold` 的金币奖励和 `bonus.relic` 的遗物奖励；`finishRewards` 将 `eventBattle` 与 `event` 置 `null`。
  - `leave`：允许在 `screen === 'event'` 且 `event.optionIndex !== null` 时回到地图，并把 `event` 置 `null`。
- [ ] **Step 4: 运行确认通过**：Step 2 的命令，再跑 `pnpm vitest run` 全量。
- [ ] **Step 5: 提交** `feat: wire random events into run flow`

---

### Task 5: 界面与注入

**Files:**
- Create: `src/ui/EventView.vue`、`src/ui/EventPickView.vue`
- Modify: `src/ui/RunView.vue`、`src/composables/useRun.ts`

**Interfaces:**
- Consumes: `RunState.event`、`optionDisabled`、`RunAction` 的两个新操作、`events`（`@/data/events`）。

- [ ] **Step 1: 实现 `EventView.vue`**：props `{ run: RunState; def: EventDef }`，emits `choose: [index: number]`、`leave: []`。布局：左侧大图标 + 标题 + 描述（选完后描述区换成 `event.result` 逐行）；右侧竖排选项按钮，`optionDisabled` 非空时置灰并在下方小字显示原因；选完后选项区换成"继续"按钮。样式参照 `RestView.vue` 的 `.option` 卡片与暗色背景。
- [ ] **Step 2: 实现 `EventPickView.vue`**：props `{ deck: string[]; cards; mode: 'remove' | 'upgrade' }`，emits `pick: [deckIndex: number]`。`upgrade` 模式复用 `ForgeView` 的列表渲染（`UpgradableCard`，只列未升级牌）；`remove` 模式用 `EnchantView` 的 `CardView` 列表（列全部牌），标题 `选择一张牌删除`。
- [ ] **Step 3: 接线**：`RunView.vue` 在 `placeholder` 分支之前加 `event` 与 `eventPick` 两个分支，`def` 由 `events.find(e => e.id === run.event?.id)` 得到；事件结算文字中涉及的升级动画沿用现有 `cardsUpgraded` 事件，不新增。`useRun.ts` 的 `createRun` 传入 `events`。`PLACEHOLDERS` 中的 `event` 项保留作为 `content.events` 为空时的回落。
- [ ] **Step 4: 类型与静态检查**：`pnpm vue-tsc --noEmit`（若项目无此命令则 `pnpm tsc --noEmit -p .`）与 `pnpm eslint src`，预期无错误。
- [ ] **Step 5: 提交** `feat: event and pick screens`

---

## Self-Review

- **Spec 覆盖**：抽取规则（Task 2）、原语表（Task 2）、2 诅咒 + 2 增益牌（Task 1）、16 事件（Task 3）、流程与界面（Task 4–5）、`seenEvents` 重置与权重（Task 2、3）。
- **类型一致**：`Outcome` / `EventDef` / `EventState` / `eventBattle` 只在 Task 2 定义，Task 3–5 引用；操作名 `chooseEventOption`、`eventPickCard` 在 Task 4 定义、Task 5 使用。
- **用户说不需要验证测试**：计划里的测试步骤是 TDD 的一部分，由执行者自行决定是否运行；若用户希望跳过，可在执行时只做实现步骤。
