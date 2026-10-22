# 参天古树 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出新职业「参天古树」：寄生种子状态与初始遗物、消耗寄生层数的出牌条件、尸体转随从与「指挥」牌、偷取最大生命值。

**Architecture:** 寄生种子是敌人身上的普通状态（`statuses.ts`），回血与清空挂在 `applyDamage` 的玩家攻击命中处。随从存在 `BattleState.minions`，占用不死的普通敌人尸体（尸体保留、不带 `vanishOnDeath`）；指挥牌不是卡牌实例，是 `BattleState` 上的临时数量，由新动作 `command` 结算。偷取最大生命值是新 `Effect`，战斗内改最大生命值，战斗结束时还原。

**Tech Stack:** Vue 3 + TypeScript，vitest。

**Spec:** `docs/superpowers/specs/2026-10-20-ancient-tree-design.md`

## Global Constraints

- 引擎纯函数，战斗由种子决定；不引入随机（随从攻击的目标选第一只存活敌人）。
- 寄生种子：每个敌方回合开始 +1；玩家攻击伤害命中时回复 `floor(层数×50%)`，随后该状态移除；中毒、反伤、药水伤害不触发也不清空；卡牌消耗层数不触发回血。
- 召唤 / 分裂的敌人（`vanishOnDeath`）不能转随从；目标是最后一只存活敌人时直接结束战斗，不生成随从。
- 随从 20 血，最多 3 只；敌人攻击只打玩家；随从血量只因「奉献」减少，≤0 消失（不再提供指挥牌）。
- 指挥牌：每只存活随从每回合开始一张，不进任何牌堆，回合结束消失；三选一：格挡 6 / 攻击 6 / 奉献（该随从 -6 血，玩家回 6 血）。
- 偷取最大生命值：敌人最大生命值最低为 1；敌人当前生命值被截断；玩家最大生命值增加；战斗结束还原。
- 初始牌组：打击 ×4、防御 ×4（沿用战士的 `strike` / `defend`）；不写具体卡牌清单。
- 不提交 git。

## Review Focus

- 寄生 1 层被打回 0 血且仍被清空；多段攻击只有第一段回血（Task 1）。
- 中毒 / 反伤 / 作弊伤害不触发寄生（Task 1）。
- 召唤、分裂敌人拒绝转随从；最后一只敌人转化即胜利、无随从（Task 2）。
- 随从超过 3 只时转化被拒绝，卡牌不被消耗（Task 2）。
- 奉献使随从归零后，下回合不再发指挥牌（Task 2）。
- 偷取不能偷死，战斗结束玩家最大生命值回到原值，且战斗内被截断的生命值不影响结束后的当前生命值上限（Task 3）。
- 目标寄生层数不足时无法打出消耗类卡牌（Task 4）。

---

### Task 1: 寄生种子、寄生之种遗物、职业注册

**Files:**
- Modify: `src/engine/statuses.ts`（`StatusDef` 增加 `turnStartGrow?: number`；`STATUSES` 末尾追加 `parasite`）
- Modify: `src/engine/battle.ts`（敌方回合开始：对每个存活敌人，对带 `turnStartGrow` 的状态 `addStatus` 加层；放在敌人行动之前）
- Modify: `src/engine/effects.ts`（`applyDamage`：玩家攻击命中敌人且 `hpLost` 与 `blocked` 之和 > 0 时，若敌人有 `parasite`，`heal` 玩家 `floor(stacks×0.5)`，随后 `delete` 状态并发 `statusRemoved`；仅 `opts.source?.side === 'player'` 时触发）
- Modify: `src/engine/relics.ts` 与 `src/data/items.ts`（遗物 `parasiteSeed`：`onBattleStart` 给所有存活敌人加 1 层 `parasite`）
- Modify: `src/data/characters.ts`（新职业 `ancientTree`：name `参天古树`，icon `🌳`，deck 4×`strike` + 4×`defend`，`relics: ['parasiteSeed']`，`allCards` / `rewardCards` 暂用 `['strike','defend']` / `[]`；实现者按 swordSaint 条目的结构补齐）
- Test: `src/engine/enemies.test.ts`、`src/data/ancientTree.test.ts`（仿 `swordSaintCards.test.ts`）

**Interfaces:**
- Produces: 状态 id `parasite`（寄生种子 🌱，debuff，decay none，text `每个敌方回合开始层数 +1；被你的攻击命中时，你恢复层数的 50% 点生命，然后清空`）；遗物 id `parasiteSeed`；职业 id `ancientTree`。
- Produces: `StatusDef.turnStartGrow?: number`。

- [ ] **Step 1: 写失败测试**（`fight` + `dummy`，敌人 `startStatuses: { parasite: n }`，玩家先 `hp` 设低）
  - `寄生：层数 4 被打命中，回复 2 并清空`；`层数 1 命中回 0 且状态被移除`；`格挡吃光伤害也触发`。
  - `寄生：连续两次攻击只有第一次回血`。
  - `寄生：中毒伤害 / cheatDamage 不触发也不清空`。
  - `寄生：每个敌方回合开始 +1`（`endTurn` 后层数加一）。
  - `parasiteSeed：开战给所有敌人 1 层`（含 2 个敌人）。
  - ancientTree.test.ts：职业存在、deck 为 4 打击 4 防御、`relics` 为 `['parasiteSeed']`、`CHARACTER_RELIC_IDS` 含 `parasiteSeed`。
- [ ] **Step 2: 运行** `npx vitest run src/engine/enemies.test.ts src/data/ancientTree.test.ts`，预期 FAIL
- [ ] **Step 3: 实现** 上述修改。
- [ ] **Step 4: 运行**同命令预期 PASS；`npx vitest run` 全绿（已知无关失败：run.test.ts 商店占位用例）；`npx vue-tsc --noEmit` 无新增错误

### Task 2: 随从与指挥牌

**Files:**
- Modify: `src/engine/types.ts`（`BattleState.minions?: { hp: number }[]`；`Effect` 增加 `{ type: 'convertCorpse'; ifParasiteOver: boolean }`；`Action` 增加 `{ type: 'command'; minion: number; choice: 'block' | 'attack' | 'devote' }`；`GameEvent` 增加 `minionRaised`、`minionDied`、`commanded`）
- Modify: `src/engine/effects.ts`（`resolveEffect` 的 `convertCorpse`：目标敌人满足「`parasite` 层数 > 当前生命值」、不是 `vanishOnDeath`、不是最后一只存活敌人、随从数 < 3 时才生效；生效即把该敌人 `hp` 置 0、清空状态并 `minions.push({ hp: 20 })`；若它是最后一只存活敌人则只杀死并让战斗结束，不生成随从；其余情况视为打出无效，见下）
- Modify: `src/engine/battle.ts`（`playCard`：在效果结算前预检 `convertCorpse` 条件，不满足返回 `invalid`，卡牌不被消耗；新增 `command` 动作的 `dispatch` 分支：仅玩家阶段、每个随从每回合只能指挥一次；`block` → 玩家 `applyBlock` 6（经 `calcBlock`）；`attack` → 对第一只存活敌人 `applyDamage` 6，来源为玩家以吃力量修正；`devote` → 该随从 `hp -= 6`，`heal` 玩家 6，随从 `hp ≤ 0` 时移除并发 `minionDied`；`startPlayerTurn` 重置本回合指挥记录 `commandedThisTurn`）
- Test: `src/engine/ancientTree.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `parasite`。
- Produces: `BattleState.minions`、`BattleState.commanded?: number[]`（本回合已指挥的随从下标）；`Action.command`；指挥牌数量 = 存活随从数 - 本回合已指挥数，由界面从状态推出，不入牌堆。

- [ ] **Step 1: 写失败测试**（用测试内自定义的 `convert` 牌：`target: 'enemy'`，效果 `[{ type: 'convertCorpse', ifParasiteOver: true }]`）
  - `转化：寄生层数大于生命值才生效`（层数 = 生命时被拒绝，卡牌留在手牌）。
  - `转化：普通敌人变成 20 血随从，敌人留在尸体位`。
  - `转化：召唤 / 分裂敌人（vanishOnDeath）被拒绝`。
  - `转化：最后一只存活敌人转化后战斗胜利，无随从`。
  - `转化：随从已有 3 只时被拒绝`。
  - `指挥：格挡 +6、攻击 6（含力量）、奉献随从 -6 血玩家 +6 血`。
  - `指挥：同一随从一回合只能指挥一次，下回合重置`。
  - `奉献到 0 血随从消失，下回合不再可指挥`。
  - `敌人攻击不影响随从血量`。
- [ ] **Step 2: 运行** `npx vitest run src/engine/ancientTree.test.ts`，预期 FAIL
- [ ] **Step 3: 实现** 上述修改。
- [ ] **Step 4: 运行** `npx vitest run` 与 `npx vue-tsc --noEmit`，预期新增测试全绿，无新增 tsc 错误

### Task 3: 偷取最大生命值

**Files:**
- Modify: `src/engine/types.ts`（`Effect` 增加 `{ type: 'stealMaxHp'; amount: number }`；`BattleState.maxHpStolen?: number`）
- Modify: `src/engine/effects.ts`（偷取：实际偷取量 = `min(amount, 敌人 maxHp 当前值 - 1)`，其中敌人当前最大生命值存放于 `EnemyState.maxHpOverride?`，未设置时取 `def.maxHp`；敌人 `hp = min(hp, 新最大值)`；玩家 `maxHp` 与 `hp` 各加实际偷取量，`maxHpStolen` 累加）
- Modify: `src/engine/battle.ts` / `src/engine/run.ts`（战斗结束写回玩家血量时，`maxHp` 扣回 `maxHpStolen`，`hp` 取 `min(hp, 还原后的 maxHp)`；实现者先读 `run.ts` 里战斗结算处，再决定写在哪）
- Modify: `src/ui/EnemyView.vue`（敌人最大生命值显示使用 `maxHpOverride ?? def.maxHp`）
- Test: `src/engine/ancientTree.test.ts`

**Interfaces:**
- Produces: `Effect.stealMaxHp`、`EnemyState.maxHpOverride?`、`BattleState.maxHpStolen?`。

- [ ] **Step 1: 写失败测试**
  - `偷取：敌人最大生命值 -N、玩家 +N、敌人当前生命值被截断`。
  - `偷取：最低留 1，再偷不再生效`。
  - `偷取：战斗结束玩家最大生命值回到原值`（经 `run.ts` 的结算流程验证，参考 `run.test.ts` 的战斗收尾用例）。
  - `偷取：战斗结束时当前生命值超过还原后的最大值则被截断`。
- [ ] **Step 2: 运行**同 Task 2 命令，预期 FAIL
- [ ] **Step 3: 实现** 上述修改。
- [ ] **Step 4: 运行** `npx vitest run` 与 `npx vue-tsc --noEmit`，预期通过

### Task 4: 消耗寄生层数的出牌条件

**Files:**
- Modify: `src/engine/types.ts`（`Effect` 增加 `{ type: 'consumeParasite'; amount: number }`，消耗目标的层数；`CardDef` 增加 `freeIfParasiteTotal?: number`）
- Modify: `src/engine/effects.ts`（`consumeParasite`：目标层数不足 `amount` 时由 `playCard` 预检拒绝；足够时扣层，扣到 0 移除状态，不触发回血）
- Modify: `src/engine/battle.ts`（预检；`freeIfParasiteTotal`：全场存活敌人寄生层数合计 ≥ 该值时费用为 0，仿照 `playCost` 的免费路径，不扣能量）
- Modify: `src/engine/swordSaint.ts`（`playCost` 的返回值扩展一个免费来源，或在 `battle.ts` 里并联判断；以不破坏剑圣现有测试为准）
- Test: `src/engine/ancientTree.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parasite`。
- Produces: `Effect.consumeParasite`、`CardDef.freeIfParasiteTotal`。

- [ ] **Step 1: 写失败测试**
  - `消耗：层数足够扣层，不触发回血`；`层数不足被拒绝，卡牌不被消耗，能量不变`。
  - `免费：全场合计达到阈值，能量为 0 也能打出且不扣能量；未达到时按原费用`。
  - `免费不影响剑圣的剑意 / 剑流`（跑 `src/engine/swordSaint.test.ts` 保持全绿）。
- [ ] **Step 2: 运行** `npx vitest run src/engine/ancientTree.test.ts src/engine/swordSaint.test.ts`，预期新增用例 FAIL
- [ ] **Step 3: 实现** 上述修改。
- [ ] **Step 4: 运行** `npx vitest run` 与 `npx vue-tsc --noEmit`，预期通过

### Task 5: 界面

**Files:**
- Modify: `src/ui/BattleView.vue`（敌人行：被转化的尸体位置显示随从及其血量；手牌区上方显示每只未指挥随从的「指挥」牌；点击后选择 格挡 / 攻击 / 奉献，发 `command` 动作）
- Modify: `src/composables/useRun.ts`（转发 `command`）；`src/ui/EnemyView.vue`、`src/ui/StatusIcons.vue` 无需改动，只确认 `parasite` 图标与层数显示正常
- Modify: `src/ui/CardEditorView.vue`（职业下拉加入「参天古树」）
- Modify: `src/ui/HandView.vue` 仅在需要时（卡牌 `freeIfParasiteTotal` 满足时费用显示 0）

**Interfaces:**
- Consumes: Task 2 的 `BattleState.minions`、`commanded`、`Action.command`。

- [ ] **Step 1: 实现** 上述界面；指挥牌不进手牌区的抽弃牌堆计数，样式区别于普通卡牌。
- [ ] **Step 2: 运行** `npx vue-tsc --noEmit` 无新增错误、`npx vitest run` 全绿。
- [ ] **Step 3: 手动检查**：浏览器里开战，确认寄生图标与层数、转随从的占位、指挥牌三选一、随从归零后指挥牌消失、Boss 分裂时布局不溢出。无法运行浏览器时在最终回复里明确说明未验证。

---

## Self-Review

- 覆盖：寄生规则与遗物（T1）、转随从与指挥（T2）、偷最大生命值（T3）、消耗层数与免费出牌（T4）、界面（T5）、职业注册与初始牌组（T1）。
- 类型一致：`parasite`、`minions`、`commanded`、`maxHpStolen`、`maxHpOverride` 均在定义它的任务中产生，后续任务只使用。
- 未覆盖（有意）：具体卡牌清单与数值、随从被攻击逻辑，均在设计文档的非目标里。
- 实现者可自行决定：图标 / 文案 / 动画；Task 3 还原逻辑的落点；Task 4 免费路径的接线方式；`convertCorpse` 的 `ifParasiteOver` 字段若始终为真可简化，但需保持测试行为不变。
