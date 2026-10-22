# 剑圣职业 + 卡牌进化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可选职业「剑圣」（剑意 / 剑流机制）和通用的卡牌进化机制（打满次数后卡面自己变成另一张牌）。

**Architecture:** 进化计数写进牌组里的卡牌 id 后缀（`strike~7`），战斗中以牌实例 id 记次，战斗胜利后由 `run.ts` 结算进化。剑意 / 剑流的出牌规则集中在新文件 `engine/swordSaint.ts`，由 `battle.ts` 在出牌处调用；剑意获得由初始遗物「剑心」通过现有 `onCardPlayed` 钩子完成。

**Tech Stack:** TypeScript、Vue 3、Vitest（仓库已有）。

**Spec:** `docs/superpowers/specs/2026-10-20-sword-saint-design.md`

**用户指示：** 用户说"不需要验证测试"。下面每个任务都写出测试，但**不设"运行测试"步骤**；是否运行由执行者按用户当时的要求决定。

## Global Constraints

- 剑意：每回合第 3 张攻击牌结算后获得 1 层，每回合最多一次；每层攻击伤害 +10%（多层相加）；任何技能牌（含 0 费、X 牌）都使下一张技能牌费用变 0 并消耗 1 层；X 牌被免费时 X = 0（只剩附魔的 `xBonus`），不花能量，仍消耗 1 层；不随回合衰减；战斗结束清除。
- 剑击：1 费，伤害 10（升级 14）；打出后下一张剑击费用变 0（剑流，最多 1 层）；被剑流免费打出的剑击不再产生剑流。
- 进化：每张牌各自计数，默认 10 次；战斗胜利后结算；保留升级（`+`）和附魔（`*`）标记；条件只由卡牌自己的 `evolve` 声明决定，遗物 / 状态 / 附魔不能修改。
- 卡牌 id 后缀的规范顺序：`基础id` + 可选 `+` + 可选 `*` + 可选 `~N`；战斗实例 id 是在其后再加 `#下标`。
- 战斗内回合攻击计数不放进 `relicState`（它跨战斗保留）。
- 附魔牌成长（`growCard`）会把卡面文字里所有数字 +1，所以进化 / 剑击 / 剑流相关的卡面文字里**不要出现与效果无关的数字**（写"零"不写"0"）。
- 磨刀石不在本计划内（属于锻造体系，待用户决定）。

## Review Focus

- 同牌组里有多张同 id 的可进化牌：各自计数，互不串（必须是不同实例 id）。
- 删牌、商店删牌、火堆锻造、附魔遗物作用于带 `~N` 的牌后，进度不丢、后缀顺序不乱。
- 剑意伤害加成的浮点误差：10 × 1.1 必须得 11，不能得 10。
- 手牌里 X 牌 + 有剑意：打出后能量不变、X = 0、剑意 −1。
- 战败 / 逃跑 / 战斗未结束时，进化计数不得写回错误的牌。

---

### Task 1: 进化的数据层（id 后缀 + `evolve` 字段）

**Files:**
- Modify: `src/engine/enchant.ts`、`src/engine/types.ts`、`src/data/cards/card.ts`、`src/data/cards/cardSpec.ts`
- Test: `src/engine/evolve.test.ts`（新建）

**Interfaces:**
- Produces（`enchant.ts`）：
  - `PROGRESS_SUFFIX = '~'`
  - `progressOf(id: string): number`（无后缀返回 0）
  - `withProgress(id: string, n: number): string`（n ≤ 0 去掉后缀；后缀始终在最后，`#` 实例号之前）
  - `evolvedId(id: string, into: string): string`（保留 `+` / `*`，丢掉进度：`strike0+*~9` + `swordStrike` → `swordStrike+*`）
  - `toInstanceIds(deck: readonly string[], cards?: Readonly<Record<string, CardDef>>): string[]`：除附魔牌外，**定义里带 `evolve` 的牌也编实例号**（`strike0#3`）
  - `evolveDeck(cards, deck: readonly string[], counts: Readonly<Record<string, number>>): { deck: string[]; evolved: { from: string; to: string }[] }`：`counts` 以战斗实例 id（`${牌组里的id}#${下标}`）为键，值是该局累计后的总次数（含牌组原有进度）；达标则换成 `evolvedId`，未达标则写回 `withProgress`
- Produces（`types.ts`）：`CardDef.evolve?: { plays: number; into: string }`；`BattleState.evolveCounts?: Record<string, number>`；`GameEvent` 新增 `{ type: 'cardsEvolved'; cards: { from: string; to: string }[] }`
- Produces（`card.ts`）：构建器方法 `evolve(plays: number, into: string): this`，`spec()` / `fromSpec()` 往返保留；`CardSpec` 加可选 `evolve`
- 已有函数要调整：`upgradedId`、`enchantedId`、`rawId`、`isUpgraded`、`isEnchanted`、`resolveCards` 都必须容忍 `~N` 后缀；`resolveCards` 对带 `~` 或 `#` 的 id 也要补出定义（基于 `rawId` 的原卡）；`upgradedId` / `enchantedId` 插入标记时要放在 `~N` 之前

- [ ] **Step 1: 写测试 `src/engine/evolve.test.ts`**，断言（用 `strike0` 这类带 `evolve: {plays: 10, into: 'swordStrike'}` 的测试卡）：
  - `progressOf('a~7') === 7`、`progressOf('a') === 0`；`withProgress('a+*', 3) === 'a+*~3'`；`withProgress('a~3', 0) === 'a'`
  - `rawId('a+*~7#3') === 'a'`；`isUpgraded('a+~7') === true`；`isEnchanted('a*~7') === true`
  - `upgradedId('a~7') === 'a+~7'`，`upgradedId('a*~7') === 'a+*~7'`；`enchantedId('a+~7') === 'a+*~7'`
  - `evolvedId('a+*~9', 'b') === 'b+*'`
  - `toInstanceIds(['strike0','strike0','defend'], cards)` 给前两张不同的 `#` 号，`defend` 不编号
  - `evolveDeck`：次数 10 → 换成目标且进 `evolved`；次数 7 → `strike0~7`；次数 0 → 保持原 id
- [ ] **Step 2: 实现以上签名**，`rawId` / `stripInstance` 先去掉 `#...` 再去掉 `~N` 再处理 `*` / `+`。
- [ ] **Step 3: `CardDef.evolve`、`BattleState.evolveCounts`、`cardsEvolved` 事件、`Card.evolve()`、`CardSpec.evolve`**。
- [ ] **Step 4: 提交**：`git add src/engine src/data/cards && git commit -m "feat: card evolve data layer and id progress suffix"`

### Task 2: 状态与效果（剑意 / 剑流 / 万剑归宗 / 按层数追加伤害）

**Files:**
- Modify: `src/engine/statuses.ts`、`src/engine/types.ts`（`Effect`）、`src/engine/effects.ts`、`src/data/cards/card.ts`（`effectText`、构建器 `damagePerStack`）
- Test: `src/engine/swordStatuses.test.ts`（新建）

**Interfaces:**
- Produces（`statuses.ts`，加入 `STATUSES`，放在 `strength` 之后）：
  - `swordIntent`：icon 🗡️，kind `buff`，decay `none`，text `攻击伤害 +10%×N，每层使下一张技能牌费用变为零`；`modifyDamageDealt: (n) => ({ mul: 1 + n / 10 })`
  - `swordFlow`：icon 🌊，kind `buff`，decay `none`，text `下一张剑击费用变为零`
  - `swordMaster`：icon ⚔️，kind `buff`，decay `none`，text `每个回合开始，获得 N 层剑意`；`onTurnStart: (n) => ({ type: 'gainStatus', status: 'swordIntent', stacks: n })`
- Produces（`TurnTrigger`）：新增变体 `{ type: 'gainStatus'; status: string; stacks: number }`，`runTurnTriggers` 里用 `addStatus` 处理
- Produces（`Effect`）：`damage` 增加可选字段 `perStack?: { status: string; per: number }`；结算时伤害基数 = `amount + 层数 × per`，**结算完后**把该状态清零；`effectText` 对应文案"造成 12 点伤害，消耗全部剑意，每层额外 +8"（具体措辞自定）；构建器方法 `damagePerStack(amount: number, status: string, per: number): this`

- [ ] **Step 1: 写测试**：
  - 伤害：对 `calcAttack(base, {swordIntent: n}, {})` 遍历 base 1..60、n 1..5，断言等于 `Math.floor(base * (10 + n) / 10)`（浮点误差在此暴露）
  - `runTurnTriggers` 对 `{swordMaster: 2}` 回合开始后玩家 `swordIntent === 2`
  - `damagePerStack(12, 'swordIntent', 8)`：玩家有 2 层剑意打出 → 基数 28，再乘剑意加成（+20%）= 33（向下取整），打完后 `swordIntent` 被清掉
- [ ] **Step 2: 实现**。若浮点误差使测试失败，在 `fold` 里给乘算结果加一个很小的容差再取整（只在此处改）。
- [ ] **Step 3: 提交**：`git commit -m "feat: sword intent/flow statuses and per-stack damage effect"`

### Task 3: 战斗规则（出牌的费用 / 消耗 / 计数）与遗物「剑心」

**Files:**
- Create: `src/engine/swordSaint.ts`
- Modify: `src/engine/battle.ts`（`createBattle`、`playCard`）、`src/engine/relics.ts`（`RELIC_RULES.swordHeart`）、`src/data/items.ts`（遗物条目）、`src/engine/types.ts`（`BattleState.turnAttacks?: number`）
- Test: `src/engine/swordSaint.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `toInstanceIds(deck, cards)`、`evolveCounts`、`progressOf`；Task 2 的状态 id
- Produces（`swordSaint.ts`）：
  - `SWORD_STRIKE_ID = 'swordStrike'`
  - `playCost(s: BattleState, card: CardDef): { free: boolean; viaIntent: boolean; viaFlow: boolean }`：`card.kind === 'skill'` 且 `swordIntent > 0` → 免费并 `viaIntent`；否则 `rawId(card.id) === SWORD_STRIKE_ID`（升级版亦然）且 `swordFlow > 0` → 免费并 `viaFlow`。技能优先；一张牌只走一种
  - `displayCost(s: BattleState, card: CardDef): number | 'X'`（界面显示用：免费时返回 0）
  - `afterPlay(s: BattleState, card: CardDef, paid: { viaFlow: boolean }, events: GameEvent[]): void`：若打出的是剑击且 `!viaFlow`，给玩家 `swordFlow` = 1；
- 遗物 `swordHeart`（初始，`items.ts` 文案"每回合打出第三张攻击牌时，获得一层剑意"）：`onTurnStart` 把 `s.turnAttacks` 置 0；`onCardPlayed` 里 `card.kind === 'attack'` 则 `turnAttacks += 1`，等于 3 时 `addStatus(s, 'player', 0, 'swordIntent', 1, events)`
- `playCard` 的调整：能量检查和扣能量用 `playCost`；免费时不扣能量，X 牌免费时 `x = card.xBonus ?? 0`；`viaIntent` 时在结算效果**前**把 `swordIntent` −1，`viaFlow` 时把 `swordFlow` 清零；结算效果后调用 `afterPlay`；打出带 `evolve` 的牌时 `s.evolveCounts[cardId] = (s.evolveCounts[cardId] ?? progressOf(cardId)) + 1`（无论该牌之后进弃牌堆还是消耗堆）
- `createBattle`：`toInstanceIds(config.deck, config.cards)`，`evolveCounts` 初始化为 `{}`

- [ ] **Step 1: 写测试**（用 `createBattle` 加测试卡定义；牌组 ≤5 张使其全在起手；`maxEnergy` 视需要传入；用 `dispatch(state, {type:'playCard', handIndex})`）：
  - 三张 0 费攻击牌打完 → `player.statuses.swordIntent === 1`；同一回合继续打第 4、5、6 张攻击牌不再获得剑意（只有第 3 张触发）；下一回合计数重置，再打 3 张又得 1 层
  - 持有剑意时打 1 费技能：能量不变、`swordIntent` −1；打 0 费技能：`swordIntent` −1；打 `cost: 'X'` 技能：能量不变、结果 X = 0、`swordIntent` −1；没有剑意时技能照常付费
  - 攻击牌不吃剑意免费，也不消耗剑意
  - 打出 `swordStrike`（无剑流）→ `swordFlow === 1`；再打一张 → 免费且 `swordFlow === 0`，不再产生剑流；再打第三张 → 付费并重新得到剑流
  - 无遗物 `swordHeart` 时连打三张攻击不获得剑意
  - 同牌组两张 `strike0`：只打其中一张，只有它的 `evolveCounts` +1
- [ ] **Step 2: 实现** `swordSaint.ts` 与 `battle.ts` / `relics.ts` / `items.ts` 的上述调整。`displayCost` 供 Task 5 的界面使用。
- [ ] **Step 3: 提交**：`git commit -m "feat: sword intent play rules and sword heart relic"`

### Task 4: 战斗后的进化结算与提示

**Files:**
- Modify: `src/engine/run.ts`（约 398–424 行的胜利收尾，含逃跑分支）、`src/ui/RelicReveal.vue`（第 116 行附近 `cardsUpgraded` 的处理，仿照它展示 `cardsEvolved`）、`src/composables/useSfxEvents.ts`、`src/testing/autoRun.ts`、`src/ui/CodexView.vue` 等所有对 `GameEvent` 做穷尽 switch 的位置
- Test: `src/engine/evolveRun.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `evolveDeck`；`BattleState.evolveCounts`
- Produces: 战斗以 `won`（含 `escaped`）收尾时，`run.content.deck = evolveDeck(run.content.cards, run.content.deck, battle.evolveCounts).deck`，并在返回的事件里追加 `cardsEvolved`（有进化时）；`lost` 分支不动

- [ ] **Step 1: 写测试**：跑一场只含 10 张可进化测试卡的小战斗（或直接构造 `RunState` + `battle.phase = 'won'` 后调用收尾），断言：打满次数的那张在牌组里变成目标牌且保留 `+` / `*`；没打满的写回 `~N`；没打过的牌不变；事件里有 `cardsEvolved`；打输时牌组不变。另测商店删牌 / 火堆锻造一张带 `~N` 的牌后进度保留（沿用现有 `shopRemove` / `forgeCard`）。
- [ ] **Step 2: 实现收尾逻辑**；`cardsEvolved` 在界面上沿用卡牌升级展示的同一套表现（改文案为"进化"）；音效映射给一个现有音效即可。
- [ ] **Step 3: 全库 `grep` `cardsUpgraded`**，对每个穷尽处理该事件的位置补上 `cardsEvolved`，确保类型检查无遗漏。
- [ ] **Step 4: 提交**：`git commit -m "feat: resolve card evolution after battle"`

### Task 5: 剑圣职业、卡牌与界面接入

**Files:**
- Create: `src/data/cards/swordSaint/white.ts`、`blue.ts`、`gold.ts`
- Modify: `src/data/cards/index.ts`（`classCards` 加 `swordSaint` 键）、`src/data/characters.ts`（加角色）、`src/ui/BattleView.vue`、`src/ui/HandView.vue`（可打出判断与费用显示改用 `displayCost`）、`src/ui/` 中显示卡牌进度处（卡面右下角显示 `n/10`，`n = progressOf(牌组 id)`，战斗里为 `evolveCounts` 的值）
- Test: `src/data/swordSaintCards.test.ts`（新建）

**Interfaces:**
- Consumes: Tasks 1–3 的构建器方法与 `displayCost`
- Produces: 角色 `{ id: 'swordSaint', name: '剑圣', icon: '🗡️', desc: '一回合连出数张攻击牌，积蓄剑意。', deck: [4 × 'swordStrike0', 4 × 'defend'], allCards: ['defend', ...classAllIds.swordSaint], rewardCards: classRewardIds.swordSaint, relics: ['swordHeart'] }`（`defend` 复用战士的牌，与鸦嘴医生同做法）
- 卡牌（id → 名字 / 费用 / 类型 / 效果；`.reward()` 的进奖励池，数值见 spec；升级版用 `.upgrade()` 手写，数值 +3 伤害 / +3 格挡即可，剑击升级固定为伤害 14）：
  - 白：`swordStrike0` 打击 1 费 伤害 6，`.starter(4)`，`.evolve(10, 'swordStrike')`，升级 9；`swordStrike` 剑击 1 费 伤害 10，**不进奖励**，卡面文字 `造成 10 点伤害，下一张剑击费用变为零`，升级版同文字伤害 14；`glint` 掠影 0 费攻击 伤害 4；`stance` 架势 1 费技能 格挡 6 抽 1；`parry` 见切 0 费技能 格挡 3
  - 蓝：`iaido` 拔剑术 1 费技能 获得 1 层剑意，消耗；`twinSlash` 连斩 1 费攻击 5 伤害 ×2，`.evolve(10, 'frenzySlash')`；`frenzySlash` 乱舞 1 费攻击 5 伤害 ×3，**不进奖励**；`stillMind` 心如止水 1 费技能 格挡 10
  - 金：`nothingSlash` 无想一剑 2 费攻击 `damagePerStack(12, 'swordIntent', 8)`，消耗；`swordSea` 万剑归宗 3 费能力 获得 1 层 `swordMaster`
  - 所有 `reward` 牌的稀有度与 spec 表格一致

- [ ] **Step 1: 写测试 `swordSaintCards.test.ts`**：所有新卡 id 全局唯一（`cards` 导入时不报错）；`swordStrike0` 的 `evolve` 指向存在的牌；`characters` 里有 `swordSaint`，起手牌组是 4 张 `swordStrike0` + 4 张 `defend`；`CHARACTER_RELIC_IDS` 含 `swordHeart`；`swordStrike` 与升级版（`resolveCards` 补出）卡面文字里只有一个数字（防止附魔成长时把"零"变坏）。
- [ ] **Step 2: 实现卡牌文件与角色注册**（按 `warrior/white.ts` 的写法）。
- [ ] **Step 3: 界面**：`BattleView` / `HandView` 中所有用 `card.cost` 判断可否打出或显示费用的位置改用 `displayCost(state, card)`；卡面增加进化进度显示；选择职业界面应已按 `characters` 渲染，确认剑圣出现即可。
- [ ] **Step 4: 提交**：`git commit -m "feat: sword saint class, cards and ui wiring"`
