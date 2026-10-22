# 剑圣遗物与连接牌 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给剑圣加汲血状态、8 张引擎 / 衔接牌、9 件遗物（含 2 件 Boss 遗物），并把"本回合攻击牌数"从剑心遗物挪进引擎。

**Architecture:** 汲血在 `applyDamage`（`effects.ts`）里按每段伤害结算；玩家侧"回合结束清空"补进 `clearTurnEndStatuses`；`turnAttacks` 改由 `battle.ts` 出牌时统一累计，剑心只负责读取。新卡牌的条件伤害 / 条件抽牌用 `damage` 与新 Effect 的可选字段表达。遗物沿用 `relics.ts` 的 `RELIC_RULES` 钩子，不新增钩子类型。

**Tech Stack:** TypeScript、Vue 3、Vitest（仓库已有）。

**Spec:** `docs/superpowers/specs/2026-10-20-sword-saint-design.md`（「第二阶段」下的汲血状态、「遗物」「补充卡牌」两节）

## Global Constraints

- 数值增伤一律四舍五入（readme「数值规则」）。汲血回复：`Math.max(1, Math.round(hpLost × 0.1 × 层数 + 1e-9))`，**每一段伤害各算一次**，`hpLost` 为 0（被完全格挡）时不回血。
- 汲血 `decay: 'turnEnd'`，在**玩家**身上；现有 `clearTurnEndStatuses` 只清敌人，必须补上玩家。
- `turnAttacks`：本回合已打出的攻击牌数，**含正在打的这一张**，在这张牌的效果结算**之前**累加；回合开始清零；与是否持有剑心无关。
- 所有 0 费且能抽牌的牌必须 `.exhaust()`。
- 新牌 / 新遗物 id 不得与战士 / 医生重复；不改动已有状态与遗物的现有数值。
- 万剑冢的"最大能量 −1"走 `RelicRule.maxEnergy: -1`。

## Review Focus

- 没有剑心遗物时，「连锁」「一闪」照样能读到攻击牌数。
- 汲血：敌人被格挡完全挡住（`hpLost` 0）不回血；多段牌每段各回至少 1 点；回合结束后汲血消失，下回合开始遗物重新给。
- 汲血回复不超过最大生命。
- 「一闪」第 1 张攻击牌就打它 = 1×4；「断水」打在无格挡敌人身上只有基础 7。
- 万剑冢与剑心同时持有：第 2 张攻击牌触发，不再在第 3 张重复触发。
- 无间：回合结束剑意清零，且不会让"每层使技能免费"在下回合残留。

---

### Task 1: 汲血与回合出牌计数

**Files:**
- Modify: `src/engine/statuses.ts`（新增 `bloodDrain`、`bladeMaster`）
- Modify: `src/engine/effects.ts`（`applyDamage` 汲血结算；`clearTurnEndStatuses` 增加玩家）
- Modify: `src/engine/battle.ts`（出牌时累加 `turnAttacks`；`bladeMaster` 每打出一张攻击牌 +1 格挡）
- Modify: `src/engine/relics.ts`（剑心去掉自己的累加，只读 `turnAttacks`）
- Test: `src/engine/bloodDrain.test.ts`

**Interfaces:**
- Produces（Task 2、3 依赖）：
  - 状态 id `bloodDrain`（玩家 buff，`decay: 'turnEnd'`，文案含"恢复伤害的 10%×N，至少 1 点，回合结束清空"）、`bladeMaster`（剑宗：`decay: 'none'`，文案"每打出一张攻击牌，获得 N 点格挡"）。
  - `BattleState.turnAttacks: number` 语义见 Global Constraints；回合开始清零（`battle.ts` 的回合开始处，不再依赖剑心）。
  - 导出函数 `attacksThisTurn(s: BattleState): number`（返回 `s.turnAttacks ?? 0`），放在 `src/engine/blades.ts`。

- [ ] **Step 1: 写失败测试 `bloodDrain.test.ts`**：
  - `汲血 1 层：打出 20 点伤害回 2 点；4 点伤害保底回 1 点`（玩家先扣血以便观察）。
  - `多段牌每段各回：5×2 → 回 2 点`。
  - `敌人满格挡（hpLost 0）不回血`。
  - `回复不超过最大生命`。
  - `玩家回合结束后汲血清空`。
  - `没有剑心遗物时 turnAttacks 也累加：打 2 张攻击牌后 attacksThisTurn 为 2`；`新回合清零`。
  - `剑宗状态 2 层：打出攻击牌获得 2 点格挡，打出技能牌不获得`。
  - `剑心行为不变`：第 3 张攻击牌给剑意（现有 `swordSaint.test.ts` 须保持通过）。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/engine/bloodDrain.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现。** `applyDamage` 里在玩家攻击敌人且 `hpLost > 0` 时，用 `Math.round(hpLost*0.1*层数 + 1e-9)` 取值再 `Math.max(1, …)`，调用现有 `heal`。`turnAttacks` 在 `play` 里结算效果前累加（仅 `card.kind === 'attack'`）。
- [ ] **Step 4: 跑全部测试与类型检查。** Run: `npx vitest run; npx vue-tsc --noEmit` Expected: 与本任务开始前相比无新增失败。

### Task 2: 条件效果与 8 张新牌

**Files:**
- Modify: `src/engine/types.ts`、`src/engine/effects.ts`、`src/data/cards/card.ts`（`effectText` + 构建器）
- Modify: `src/data/cards/cardSpec.ts`、`tools/cardCodegen.ts`、`src/ui/CardEffectsEditor.vue`、`src/engine/enchant.ts`（让编辑器 / 代码生成 / 附魔升级认识新字段）
- Modify: `src/data/cards/swordSaint/white.ts`、`blue.ts`、`gold.ts`
- Test: `src/engine/connectEffects.test.ts`、`src/data/swordSaintConnect.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `attacksThisTurn`、状态 `bladeMaster`。
- Produces：
  - `damage` 新增 `ifTargetBlock?: { bonus: number }`：目标有格挡时基数 += `bonus`。
  - `damage` 新增 `perAttackPlayed?: { per: number }`：基数 += `attacksThisTurn × per`。
  - 新 Effect `{ type: 'drawIfAttacks'; min: number; count: number }`：`attacksThisTurn ≥ min` 时抽 `count` 张。
  - 构建器：`damageIfTargetBlock(amount, bonus)`、`damagePerAttackPlayed(amount, per)`、`drawIfAttacks(min, count)`。
- 卡牌规格（均 `.reward()`，升级值按"主数值约 +40% 取整"自定并写进测试；0 费且抽牌的牌必须 `.exhaust()`）：

| id | 名 | 稀有度 | 费用 | 效果 |
|---|---|---|---|---|
| `luck` | 运气 | 白 | 0 | 技能，`draw 1`，消耗 |
| `gather` | 蓄势 | 白 | 1 | 技能，`applyStatus swordFlow 1 self`；`block 4` |
| `cutWater` | 断水 | 白 | 1 | 攻击，`damageIfTargetBlock(7, 4)` |
| `chain` | 连锁 | 蓝 | 1 | 攻击，`damage 6`；`drawIfAttacks(3, 1)` |
| `swordDance` | 剑舞 | 蓝 | 1 | 技能，`applyStatus swordIntent 1 self`；`draw 1`；消耗 |
| `painForShock` | 以伤换伤 | 蓝 | 0 | 技能，`loseHp 3`；`applyStatus shock 1 self`；`draw 1`；消耗 |
| `bladeMasterPower` | 剑宗 | 金 | 3 | 能力，`applyStatus bladeMaster 1 self` |
| `flash` | 一闪 | 金 | 1 | 攻击，`damagePerAttackPlayed(0, 4)`；消耗 |

- [ ] **Step 1: 写失败测试**：`connectEffects.test.ts` 覆盖三个新字段（含"无格挡只有基础 7""一闪第 1 张 = 4""连锁第 3 张攻击才抽牌，第 2 张不抽"）；`swordSaintConnect.test.ts` 覆盖 8 张牌注册、稀有度、费用、"0 费抽牌牌均带消耗"、`effectText` 新文案含数值。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/engine/connectEffects.test.ts src/data/swordSaintConnect.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现。** `resolveEffect` 里 `damage` 先算基数再接已有的 `lowHp` / `perTargetStatus` 逻辑；`enchant.ts` 的 `bumpEffect`、`upgradeEffect`、`effectNumber` 补上新 Effect 的分支（`drawIfAttacks` 的数值取 `count`），保持 `switch` 穷尽。
- [ ] **Step 4: 批量校验。** Run: `npx vitest run src/testing src/data` Expected: 通过；若 `attackCards.test.ts` 因新牌需要前置状态而失败，仿照 `swordStrike` / 焚天的做法在 `src/testing/cardHarness.ts` 或该测试里补前置，不改卡牌。
- [ ] **Step 5: 类型检查。** Run: `npx vue-tsc --noEmit` Expected: 无新增报错。

### Task 3: 遗物

**Files:**
- Modify: `src/data/items.ts`（遗物定义）、`src/engine/relics.ts`（`RELIC_RULES`）
- Modify: 遗物掉落池（先 `grep -rn "swordHeart\|relicPool\|bossRelic" src` 找到登记位置，剑圣专属遗物与 Boss 遗物按现有战士 / 医生遗物的方式登记；不确定的放入剑圣职业遗物池）
- Test: `src/engine/swordRelics.test.ts`

**Interfaces:**
- Consumes: Task 1 的状态 `bloodDrain`、`attacksThisTurn`。
- 遗物规格（`BattleHooks` 现有钩子：`onBattleStart` / `onTurnStart` / `onTurnEnd` / `onCardPlayed`；`RelicRule.maxEnergy`）：

| id | 名 | 效果实现 |
|---|---|---|
| `bloodBlade` | 饮血剑 | `onTurnStart`：玩家 +1 层 `bloodDrain` |
| `frostBlade` | 霜剑 | `onTurnStart`：所有存活敌人 +1 层 `frost` |
| `thunderBlade` | 雷剑 | `onTurnStart` 且 `s.turn === 1`：玩家 +2 层 `shock` |
| `flameBlade` | 炎剑 | `onBattleStart`：所有存活敌人 +3 层 `burn` |
| `venomBlade2` | 毒剑 | `onTurnStart`：已有中毒的敌人 +1 层 `poison`（没中毒的不变） |
| `scabbard` | 剑鞘 | `onCardPlayed`：`card.kind === 'attack'` 且 `attacksThisTurn === 1` 时玩家 +1 层 `swordFlow`（已有则不再加） |
| `bladeTomb` | 万剑冢（Boss） | `maxEnergy: -1`；改写剑心触发阈值为 2（持有时第 2 张攻击牌触发，第 3 张不再触发） |
| `nothingBetween` | 无间（Boss） | `onTurnStart`：玩家 +1 层 `swordIntent`；`onTurnEnd`：清空玩家 `swordIntent` |

  （注意：`venomBlade2` 是遗物 id，避免与卡牌「淬毒」`venomBlade` 重名，虽然两张表不共享，仍保持唯一。）

- [ ] **Step 1: 写失败测试 `swordRelics.test.ts`**：每件遗物一个用例，断言上表效果；另加："毒剑不给没中毒的敌人上毒""雷剑第 2 回合不再给感电""万剑冢 + 剑心：第 2 张攻击牌给剑意、第 3 张不再给""无间：回合结束剑意清零、下回合开始 +1""霜剑与冰霜回合末清空配合：下回合敌人重新有 1 层"。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/engine/swordRelics.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现。** 万剑冢改写剑心阈值：剑心规则里读 `s.relics.includes('bladeTomb') ? 2 : 3`。
- [ ] **Step 4: 全量测试与类型检查。** Run: `npx vitest run; npx vue-tsc --noEmit` Expected: 与任务开始前相比无新增失败。
