# 剑圣属性剑体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给剑圣新增 4 个状态（背水、冰霜、感电、灼伤）、3 种新效果和 13 张奖励牌（毒路线三张已移除），并把打击 / 连斩的进化次数改为 20。

**Architecture:** 伤害修正里需要读战斗状态（血量、敌人格挡）的部分，集中放进新文件 `engine/blades.ts`，由 `effects.ts` 的 `applyDamage` 调用；`calcAttack` 增加一个可选的额外修正参数。灼伤用新增的衰减类型 `halve`。卡牌数据放 `data/cards/swordSaint/` 下，沿用现有 `Card` 构建器。

**Tech Stack:** TypeScript、Vue 3、Vitest（仓库已有）。

**Spec:** `docs/superpowers/specs/2026-10-20-sword-saint-design.md`（「第二阶段：属性剑体系」一节）

## Global Constraints

- 数值增伤一律**四舍五入**（`Mod.round: true`），没有特定说明不得向下取整（readme「数值规则」）。灼伤减半是特例：**向下取整**，文案要写明。
- 冰霜：敌人有格挡时，攻击穿透格挡（敌人格挡原样保留），伤害每层 +10%；玩家回合结束清空（`decay: 'turnEnd'`）；敌人没有格挡时无任何效果。
- 感电：下一张含伤害效果的牌，每层 +50%；该牌结算完后失去 1 层；同一张牌自己给的感电不加成自己。
- 背水：玩家血量 ×2 ≤ 最大生命时，攻击伤害 +50%。
- 剑圣新牌 id 不得与战士 / 医生的 id 重复（`CardPool` 会报错）。已用过的 id 勿再用：`parry`、`strike`、`defend`。
- 不改动已有状态（易伤、虚弱、脆弱）的取整方式。

## Review Focus

- 敌人**没有格挡**时挂着冰霜：不增伤、不改变伤害（最容易写成"有冰霜就 +10%"）。
- 冰霜穿甲时，敌人的格挡数值**不减少**，且 `damageDealt` 事件的 `blocked` 为 0。
- 同一张牌的多段伤害（连环雷 5×2）：感电只在整张牌结算后消耗 1 层，两段都吃加成。
- 灼伤 1 层：回合开始掉 1 点生命，然后减到 0 消失（不能永远烧不完）。
- 「搏命」「焚天」打在没有对应状态 / 满血的目标上：不报错，数值按基础值。

---

### Task 1: 新状态与伤害修正管线

**Files:**
- Create: `src/engine/blades.ts`
- Modify: `src/engine/statuses.ts`（新增 4 个状态 + 万雷之神的能力状态、`decay: 'halve'`、`calcAttack` 额外参数）
- Modify: `src/engine/effects.ts`（`applyDamage` 接入；`tickStatuses` 支持 `halve`）
- Modify: `src/engine/battle.ts`（出牌后消耗感电）
- Test: `src/engine/blades.test.ts`

**Interfaces:**
- Produces（Task 2、3 依赖）：
  - 状态 id：`lastStand`、`frost`、`shock`、`burn`、`thunderGod`（雷神降世的能力状态：回合开始 `gainStatus shock 1`）。
  - `StatusDef.decay` 增加 `'halve'`；`DECAY_TEXT.halve = '每个回合层数减半（向下取整），减到 0 消失'`。
  - `statuses.ts`：`calcAttack(base, attacker, defender, extra: Mod[] = []): number`，`extra` 与现有修正一起先加后乘。
  - `blades.ts`：`attackMods(s: BattleState, targetBlock: number, targetStatuses: Statuses): { mods: Mod[]; pierce: boolean }`——背水（见 Global Constraints）、感电（`mul: 1 + 0.5×层数, round: true`）、冰霜（仅 `targetBlock > 0` 且层数 > 0 时 `mul: 1 + 0.1×层数, round: true` 且 `pierce: true`）。
  - `blades.ts`：`hasDamage(card: CardDef): boolean`（effects 里含 `damage`）。
  - `applyDamage` 在玩家攻击敌人（`opts.source.side === 'player'` 且 `target === 'enemy'`）时调用 `attackMods`；`pierce` 为真时 `blocked = 0`，格挡不扣，伤害全部走生命。

- [ ] **Step 1: 写失败测试 `blades.test.ts`**，用例名与断言：
  - `背水：血量 ≤ 50% 才 +50%`：maxHp 80、hp 40 时 `calcAttack(6, {lastStand:1}, {}, attackMods(...).mods)` 为 9；hp 41 为 6。
  - `冰霜：有格挡时穿甲且每层 +10%`：敌人 block 10、冰霜 3 层，对其打 6 点 → 敌人 hp −8（6×1.3=7.8→8），敌人 block 仍为 10，事件 `blocked` 为 0。
  - `冰霜：没有格挡时无效果`：敌人 block 0、冰霜 3 层，打 6 点 → 扣 6。
  - `感电：两段伤害都吃加成，整张牌后只扣 1 层`：感电 2 层，打一张两段各 5 点的牌 → 每段 5×(1+0.5×2)=10，共扣 20 点生命，结算后感电剩 1 层。
  - `感电：自己给的感电不加成自己`：感电 0 层，打「雷鸣」类牌（伤害 4 + 给 1 层感电）→ 伤害为 4，结算后感电 1 层（不消耗，因为打出前为 0）。
  - `灼伤：1 层烧一次就消失`：敌人灼伤 1 层，经过一次敌人回合 → hp −1，灼伤移除；4 层 → −4，剩 2 层。
  - `雷神降世状态：回合开始 +1 层感电`。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/engine/blades.test.ts` Expected: FAIL（模块不存在）。
- [ ] **Step 3: 实现。** 在 `statuses.ts` 声明四个状态（文案、图标自定，图标用 emoji；冰霜 `kind:'debuff'`，灼伤 `kind:'debuff'`，其余 `buff`），`tickStatuses` 对 `halve` 取 `Math.floor(stacks/2)`，为 0 则移除并发 `statusRemoved`。`battle.ts` 在出牌结算后：若打出前感电层数 > 0 且 `hasDamage(card)`，`shiftStatus(... 'shock', -1)`（打出前层数在结算效果前读取）。
- [ ] **Step 4: 跑全部测试。** Run: `npx vitest run` Expected: 仅 `run.test.ts` 的商店占位那一条失败（既有问题，与本任务无关）。
- [ ] **Step 5: 类型检查。** Run: `npx vue-tsc --noEmit` Expected: 仅 `EnemyEditorView.vue` 两处既有报错。

### Task 2: 新效果类型与卡牌构建器

**Files:**
- Modify: `src/engine/types.ts`（Effect）
- Modify: `src/engine/effects.ts`（`resolveEffect`）
- Modify: `src/data/cards/card.ts`（`effectText`、构建器方法）
- Modify: `src/data/cards/cardSpec.ts`、`tools/cardCodegen.ts`、`src/ui/CardEffectsEditor.vue`（让编辑器和代码生成器认识新字段）
- Test: `src/engine/bladeEffects.test.ts`

**Interfaces:**
- Consumes: Task 1 的状态 id。
- Produces（Task 3 依赖）：
  - `damage` 效果新增 `lowHp?: { amount: number }`：玩家血量 ×2 ≤ 最大生命时，基数用 `lowHp.amount` 代替 `amount`。
  - `damage` 效果新增 `perTargetStatus?: { status: string; per: number }`：基数 += 目标该状态层数 × per，结算后清掉目标的该状态（`statusRemoved` 事件）。
  - 新 Effect：`{ type: 'multiplyStatus'; status: string; factor: number }`：把**目标敌人**身上该状态的层数乘以 `factor`；没有该状态则什么都不做。
  - `Card` 构建器：`damageLowHp(amount: number, lowAmount: number)`、`damagePerTargetStatus(amount: number, status: string, per: number)`、`multiplyStatus(status: string, factor: number)`。
  - 卡面文字：`damageLowHp` → `造成 8 点伤害，血量不高于一半时造成 16 点`；`damagePerTargetStatus` → `造成 0 点伤害，每层灼伤额外 +3，清除灼伤`（具体措辞实现者按现有 `perStack` 文案风格写，但必须含状态名和每层数值）；`multiplyStatus` → `使目标的中毒层数翻倍`（factor 为 2 时写"翻倍"，其他写 `×factor`）。

- [ ] **Step 1: 写失败测试 `bladeEffects.test.ts`**：
  - `lowHp：满血用基础值，半血以下用 lowHp.amount`（8 / 16）。
  - `perTargetStatus：目标灼伤 4 层，基数 0 + 4×3 = 12，并清掉灼伤`；`目标没有灼伤 → 伤害 0 且不报错`。
  - `multiplyStatus：中毒 3 层 ×2 = 6；没有中毒不报错、不凭空产生状态`。
  - `effectText` 三种新文案都包含状态名与数值。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/engine/bladeEffects.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现。** `resolveEffect` 里 `damage` 先算基数（含 `lowHp` / `perTargetStatus`），`multiplyStatus` 用 `shiftStatus` 补差值保持事件一致。编辑器 / 代码生成器参照现有 `perStack` 的处理方式增加对应字段，不新造机制。
- [ ] **Step 4: 跑全部测试与类型检查**（同 Task 1 的 Step 4、5）。

### Task 3: 13 张新牌 + 进化次数改 20

**Files:**
- Modify: `src/data/cards/swordSaint/white.ts`、`blue.ts`、`gold.ts`
- Modify: `src/data/swordSaintCards.test.ts`（追加）；若有测试写死了进化次数 10，同步改成 20
- Test: `src/data/swordSaintElements.test.ts`

**Interfaces:**
- Consumes: Task 2 的构建器方法；Task 1 的状态 id。
- 卡牌 id 与规格（均 `.reward()`，升级值由实现者按"主数值约 +40%，取整"定并写进测试）：

| id | 名 | 稀有度 | 费用 | 目标 | 效果 |
|---|---|---|---|---|---|
| `slash` | 割伤 | 白 | 1 | 敌人 | `loseHp 2`；`damage 12` |
| `desperate` | 搏命 | 蓝 | 1 | 敌人 | `damageLowHp(8, 16)` |
| `bloodDrink` | 饮血 | 蓝 | 1 | 敌人 | `damage 7`；`heal 2` |
| `lastStandPower` | 背水一战 | 金 | 1 | 能力 | `applyStatus lastStand 1 self` |
| `frostSlash` | 凝霜斩 | 白 | 1 | 敌人 | `damage 6`；`applyStatus frost 2 target` |
| `coldWave` | 寒潮 | 蓝 | 1 | 自身 | `applyStatus frost 2 allEnemies`；`draw 1` |
| `frostWorld` | 冰封千里 | 金 | 2 | 自身 | `applyStatus frost 5 allEnemies`；消耗 |
| `thunderClap` | 雷鸣 | 白 | 1 | 敌人 | `damage 4`；`applyStatus shock 1 self` |
| `chainLightning` | 连环雷 | 蓝 | 1 | 敌人 | `damage 5` 两段；`applyStatus shock 1 self` |
| `thunderGodPower` | 雷神降世 | 金 | 2 | 能力 | `applyStatus thunderGod 1 self` |
| `flameTongue` | 火舌 | 白 | 1 | 敌人 | `damage 5`；`applyStatus burn 3 target` |
| `firestorm` | 烈焰风暴 | 蓝 | 2 | 自身 | `applyStatus burn 4 allEnemies` |
| `burnSky` | 焚天 | 金 | 2 | 敌人 | `damagePerTargetStatus(0, 'burn', 3)`；消耗 |

- 另：`swordStrike0`（打击）与 `twinSlash`（连斩）的 `.evolve(10, ...)` 改为 `.evolve(20, ...)`。

- [ ] **Step 1: 写失败测试 `swordSaintElements.test.ts`**：
  - `13 张新牌全部注册，稀有度与费用与表一致`；`id 不与战士 / 医生重复`（`cards` 能加载即证明）。
  - `背水一战 + 半血：攻击伤害 +50%`（hp 40/80 打 6 点 → 9）。
  - `凝霜斩打在有 10 格挡的敌人上：穿甲，敌人 block 仍 10`。
  - `连环雷接在感电 1 层之后：两段各 +50%`。
  - `打击与连斩的 evolve.plays 均为 20`。
- [ ] **Step 2: 跑测试确认失败。** Run: `npx vitest run src/data/swordSaintElements.test.ts` Expected: FAIL。
- [ ] **Step 3: 实现。** 按表在 `white.ts`/`blue.ts`/`gold.ts` 末尾追加；图标用 emoji；升级值自定。
- [ ] **Step 4: 跑全部测试。** Run: `npx vitest run` Expected: 除既有的商店占位失败外全部通过（含 `autoRun.test.ts`、`attackCards.test.ts`、`skillCards.test.ts`、`powerCards.test.ts` 对新牌的批量校验）。若批量校验报"效果与定义不符"，在 `src/testing/cardHarness.ts` 的 `effectSnapshot` 里按 `swordStrike` 剑流的做法补预期，不要改卡牌。
- [ ] **Step 5: 类型检查。** Run: `npx vue-tsc --noEmit` Expected: 仅既有两处报错。

### Task 4: 界面最小接入

**Files:**
- Modify: `src/ui/StatusIcons.vue` 及任何按 `decay` 分支的位置（`grep -rn "decay" src/ui`）
- Modify: 卡牌编辑器目录列表（若有需要）

- [ ] **Step 1:** `grep -rn "'tick'\|'turnEnd'\|\.decay" src/ui src/composables` 找出所有按衰减类型显示的地方，补上 `halve` 分支（显示用 `DECAY_TEXT.halve`）。
- [ ] **Step 2:** 确认新状态在战斗界面能显示图标与悬浮说明（`statusTip` 已通用，核对一次即可，不需要新组件）。
- [ ] **Step 3:** Run: `npx vue-tsc --noEmit` Expected: 仅既有两处报错。
