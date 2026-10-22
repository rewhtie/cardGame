# 附魔改为卡牌机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 附魔不再是引擎里的特殊概念，而是"给卡牌补一段链式调用（机制字段）"；界面仍按牌组里记的附魔名显示宝石。

**Architecture:** 新增 `src/engine/enchants.ts`：附魔注册表（名字 + 对 `CardDef` 的链式调用，借助小型 `CardMod` 链式包装器 `.grow(1).innate().retain()`）。牌组 id 用单一后缀 `@名` 取代 `*` / `^`。`resolveCards` 先锻造、再执行附魔链，生成带 `grow` / `innate` / `retain` / `enchant` 字段的 `CardDef`；战斗只读机制字段。选牌可选性由机制字段算出。

**Tech Stack:** Vue 3 + TypeScript + Vitest（`npx vitest run <file>`、`npx vue-tsc --noEmit`）

**Spec:** `docs/superpowers/specs/2026-10-21-enchant-as-card-mechanic-design.md`

## Global Constraints

- 一张牌最多一个附魔；已带附魔的牌不能再附魔，也不替换。
- 牌已有某机制则不能附魔成该机制：增量要求无 `grow`，固有要求无 `innate`，保留要求无 `retain` 且无 `retainGrow`。
- 可附魔只看牌当前的样子（未锻造的传说斗篷可附保留；锻造后重复，无事发生）。
- 固有 = 每场战斗第一回合必定抽上手，**不改费用**。
- 存储规范顺序：基础 id、可选 `+`、可选 `@名`、可选 `~N`、战斗实例 `#i`。
- 旧存档：`*` → `@grow`，`^` → `@innate`；两者同时存在则只留 `@grow`。
- 战斗/引擎代码不得出现按附魔名分支的逻辑，只看机制字段。
- 先锻造，再执行附魔链（增量按锻造后数字 +1）。
- 不新增获得途径：训练指南→增量，王国公章→固有，保留只登记。
- 用户要求：不跑完整测试验证；每个任务只跑该任务相关的 vitest 文件与 `npx vue-tsc --noEmit`（已知预存类型错误：`EnemyEditorView.vue`、`battle.ts:329-330`、`PendingPicker.vue:28`）。提交只在用户要求时进行；提交信息末尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## Review Focus

- 旧存档同时含 `*` 和 `^`（如 `strike+*^`）→ 读档后只剩 `@grow`（Task 2 测试）。
- 带 `~N` 进度或 `#i` 实例的附魔牌（`strike+@grow~7#3`）：`rawId`、`isUpgraded`、`evolvedId`、`withProgress` 仍正确（Task 1）。
- 自带保留的牌、`retainGrow` 牌在保留选牌中不可选；已附魔的牌在任何选牌中都不可选（Task 3）。
- 固有牌费用保持原价，X 牌不受影响，且仍在第一回合起手（Task 4）。
- 增量牌连续打出两次：实例各自累积，另一张同名牌不受影响（Task 4）。

## File Structure

- Create `src/engine/enchants.ts`：`CardMod`、`ENCHANTS` 注册表、`enchantOf(id)`、`canEnchant(def, enchantId)`、`enchantedId(id, name)`。
- Modify `src/engine/enchant.ts`：id 后缀解析改 `@`；删除 `ENCHANT_SUFFIX` / `INNATE_SUFFIX` / `isEnchanted` / `isInnate` / `innateId`；`resolveCards` / `toInstanceIds` / `evolvedId` 改造；新增 `migrateLegacyId`。
- Modify `src/engine/types.ts`：`CardDef` 去掉 `enchanted`，加 `grow?: number`、`enchant?: string`（`innate` 保留）。
- Modify `src/engine/battle.ts`（79-81、271）、`src/engine/relics.ts`（278、456）、`src/data/items.ts`（23、183）、`src/engine/save.ts`。
- Modify UI：`src/ui/CardView.vue:230`、`src/composables/useSfxEvents.ts:35`、`src/ui/sfxScenes.ts:181,233`、`src/ui/RelicReveal.vue`（若直接引用旧函数）。
- Tests：`src/engine/enchants.test.ts`（新）、迁移 `evolve.test.ts`、`battle.test.ts:268`、`swordSaintCards.test.ts`、`commonRelics.test.ts`、`run.test.ts`。

---

### Task 1: 附魔注册表与 id 后缀 `@名`

**Files:**
- Create: `src/engine/enchants.ts`, `src/engine/enchants.test.ts`
- Modify: `src/engine/enchant.ts`, `src/engine/types.ts`

**Interfaces:**
- Produces（`enchants.ts`）:
  - `class CardMod { constructor(def: CardDef); grow(n: number): this; innate(): this; retain(): this; done(): CardDef }`
  - `interface EnchantDef { id: string; name: string; chain: (m: CardMod) => CardMod; has: (c: CardDef) => boolean }`
  - `const ENCHANTS: Record<string, EnchantDef>`，首批 `grow`（名「增量」，`m.grow(1)`，`has = c => !!c.grow`）、`innate`（名「固有」，`m.innate()`，`has = c => !!c.innate`）、`retain`（名「保留」，`m.retain()`，`has = c => !!c.retain || !!c.retainGrow`）
  - `canEnchant(def: CardDef, enchantId: string): boolean`：`!def.enchant && !ENCHANTS[enchantId].has(def)`
  - `applyEnchant(def: CardDef, enchantId: string): CardDef`：`ENCHANTS[enchantId].chain(new CardMod(def)).done()` 并写入 `enchant: enchantId`
- Produces（`enchant.ts`）:
  - `ENCHANT_MARK = '@'`；`enchantOf(id: string): string | undefined`（读 `@名`，容忍 `~N`/`#i`）
  - `withEnchant(id: string, name: string): string`（已有附魔则原样返回；插在 `+` 之后、`~N`/`#` 之前）
  - `rawId` / `isUpgraded` / `upgradedId` / `evolvedId` / `withProgress` 改为识别 `@名`；`evolvedId` 保留 `+` 与 `@名`
  - `types.ts`：`CardDef.grow?: number`、`CardDef.enchant?: string`；删除 `enchanted`

- [ ] **Step 1: 写失败测试** `enchants.test.ts`：
  - `enchantOf('strike+@grow~7#3')` 为 `'grow'`，`enchantOf('strike')` 为 `undefined`
  - `withEnchant('strike+~7', 'grow')` 为 `'strike+@grow~7'`；`withEnchant('strike@innate', 'grow')` 仍为 `'strike@innate'`
  - `rawId('a+@grow~7#3')` 为 `'a'`；`isUpgraded('a+@innate')` 为 `true`；`upgradedId('a@grow~7')` 为 `'a+@grow~7'`
  - `evolvedId('a+@grow~9', 'b')` 为 `'b+@grow'`
  - `applyEnchant(def, 'grow')` 得 `grow === 1` 且 `enchant === 'grow'`；`applyEnchant(def,'innate')` 得 `innate === true` 且 `cost` 与原牌相同
  - `canEnchant`：自带 `retain` 的牌对 `retain` 为 false；`retainGrow` 牌对 `retain` 为 false；已有 `enchant` 的牌对任何附魔为 false；普通牌对三者为 true
- [ ] **Step 2:** `npx vitest run src/engine/enchants.test.ts`，预期 FAIL（模块不存在）
- [ ] **Step 3:** 按上面 Interfaces 实现 `enchants.ts`，并改造 `enchant.ts` 的后缀解析；`stripEnchant` 用正则去掉 `@\w+`。`CardMod` 方法只改对应字段，`grow(n)` 设置 `grow = (grow ?? 0) + n`，`innate()` 设 `innate: true` 且 `text` 加「固有。」前缀（与原卡面行为一致，不动 `cost`），`retain()` 设 `retain: true`
- [ ] **Step 4:** 重跑该测试，预期 PASS
- [ ] **Step 5:** （仅在用户要求提交时）提交

### Task 2: 旧存档迁移与牌组存储

**Files:**
- Modify: `src/engine/enchant.ts`（新增 `migrateLegacyId`）、`src/engine/save.ts`
- Test: `src/engine/enchants.test.ts`（追加）、`src/engine/save.test.ts`（若存在则追加，否则放 `enchants.test.ts`）

**Interfaces:**
- Produces: `migrateLegacyId(id: string): string`：把 `*`→`@grow`、`^`→`@innate`；同时含 `*` 和 `^` 时只留 `@grow`；`~N`、`#i` 尾巴保留；已是新格式的 id 原样返回
- `fromSave` 对 `save.deck` 逐项 `migrateLegacyId`

- [ ] **Step 1: 失败测试**：`migrateLegacyId('strike*')` = `'strike@grow'`；`'strike+^~3'` = `'strike+@innate~3'`；`'strike+*^'` = `'strike+@grow'`；`'strike'`、`'strike@grow'` 原样；`fromSave` 读到含 `strike*^` 的存档后牌组为 `strike@grow`
- [ ] **Step 2:** 跑测试，预期 FAIL
- [ ] **Step 3:** 实现 `migrateLegacyId` 并在 `fromSave` 里映射牌组
- [ ] **Step 4:** 重跑，预期 PASS

### Task 3: 遗物选牌与描述

**Files:**
- Modify: `src/engine/relics.ts`（278 王国公章、456 训练指南）、`src/data/items.ts`（23 训练指南、183 王国公章描述）
- Test: `src/engine/commonRelics.test.ts`、`src/engine/run.test.ts`（迁移旧 `*` / `^` 用例）

**Interfaces:**
- Consumes: `canEnchant`、`withEnchant`、`cards: Record<string, CardDef>`（选牌规则需拿到牌定义；`PickSpec.eligible` 签名按现有调用点补充卡牌定义参数，通过 `run.content.cards` 取）
- 训练指南：`eligible: (id, cards) => canEnchant(defOf(id), 'grow')`，`apply: id => withEnchant(id, 'grow')`
- 王国公章：同上，`'innate'`
- 王国公章描述去掉「费用为 0」，改为只写第一回合必抽上手

- [ ] **Step 1: 失败测试**：持有牌组含 `strike`、`strike@grow`、`strike@innate` 时，训练指南可选下标只有 `strike`（`strike@innate` 因"一牌一附魔"不可选）；王国公章同理；结算后 `strike` → `strike@innate`；描述文本不再含「费用为 0」
- [ ] **Step 2:** 跑测试，预期 FAIL
- [ ] **Step 3:** 改造两处 `PickSpec` 与描述文字
- [ ] **Step 4:** 重跑，预期 PASS

### Task 4: 战斗引擎读机制字段

**Files:**
- Modify: `src/engine/battle.ts`（79-81、271）、`src/engine/enchant.ts`（`resolveCards` / `toInstanceIds`）
- Test: `src/engine/battle.test.ts`（268 附近迁移）、`src/engine/evolve.test.ts`、`src/data/swordSaintCards.test.ts`

**Interfaces:**
- `resolveCards`：对带 `@名` 的 id，`def = isUpgraded ? forge(base) : base` 后 `applyEnchant(def, name)`，`id` 写成完整 id；删除原固有的 `cost: 0`
- `toInstanceIds`：带附魔的牌或可进化的牌编号（`${id}#${i}`），判断用 `enchantOf(id)`
- `battle.ts`：开局抽牌堆把 `cards[id]?.innate` 的牌排前；出牌后 `if (card.grow) s.cards = { ...s.cards, [cardId]: growCard(card) }`；不再 import `isEnchanted` / `isInnate`

- [ ] **Step 1: 失败测试**：
  - `strike@grow#0` 打出后卡面伤害 +1，另一张 `strike@grow#1` 不变（实例独立）
  - `strike@innate` 第一回合在起手 5 张里，且 `cards['strike@innate'].cost` 等于 `strike` 原费用；X 牌固有仍为 `'X'`
  - `s.cards['spinStrike@grow#0']?.grow` 为 1（替换旧 `enchanted` 断言）
  - `evolve.test.ts` 的 `*` 用例改成 `@grow`
- [ ] **Step 2:** 跑上述三个测试文件，预期 FAIL
- [ ] **Step 3:** 实现并清理 `enchant.ts` 中遗留的旧导出
- [ ] **Step 4:** 重跑，预期 PASS

### Task 5: 界面宝石与"新附魔"判断

**Files:**
- Modify: `src/ui/CardView.vue`（230、531）、`src/composables/useSfxEvents.ts`（4、35）、`src/ui/sfxScenes.ts`（5、181、233）、`src/ui/RelicReveal.vue`（如引用旧函数）

**Interfaces:**
- `CardView.vue`：宝石显示条件 `card.enchant`，`title` 取 `ENCHANTS[card.enchant].name`；`innate` 样式类改按 `card.enchant === 'innate'`；自带保留的牌因无 `enchant` 而没有宝石
- `useSfxEvents.ts` 的 `isNewEnchant`：`enchantOf(c.to) && !enchantOf(c.from)`
- `sfxScenes.ts`：`enchantedId('strike')` 改 `withEnchant('strike', 'grow')`

- [ ] **Step 1:** 跑 `npx vue-tsc --noEmit`，确认改造前 import 报错点（预期出现旧函数缺失错误）
- [ ] **Step 2:** 按上面三处改造
- [ ] **Step 3:** 再跑 `npx vue-tsc --noEmit`，预期除已知预存错误外无新增；跑 `npx vitest run src/composables/sfxResolve.test.ts`，预期 PASS
- [ ] **Step 4:** 全仓 `grep -rnE "isEnchanted|isInnate|innateId|ENCHANT_SUFFIX|INNATE_SUFFIX|\.enchanted" src tools` 应无结果

### Task 6: 测试迁移收尾与卡面文字

**Files:**
- Modify: `src/engine/commonRelics.test.ts`、`src/engine/run.test.ts`、`src/data/swordSaintCards.test.ts`、`readme.md`（如有附魔说明）

- [ ] **Step 1:** 全仓搜索测试里的 `*`、`^` 后缀 id（`grep -rnE "['\"][a-zA-Z0-9]+[+]?[*^]" src --include=*.test.ts`），逐个改成 `@grow` / `@innate`
- [ ] **Step 2:** 逐个跑被改的测试文件，预期 PASS
- [ ] **Step 3:** `npx vue-tsc --noEmit` 无新增错误

---

## Self-Review

- 规格覆盖：注册表 + 链式调用（T1）；一牌一附魔与重复机制不可选（T1/T3）；`@名` 存储与旧档迁移（T1/T2）；引擎只读字段、固有不改费用（T4）；训练指南/王国公章/描述（T3）；UI 宝石按记录名（T5）；测试迁移（T6）。无遗漏。
- 类型一致：`enchantOf` / `withEnchant` / `applyEnchant` / `canEnchant` / `CardDef.grow|enchant|innate` 在各任务用法一致。
- 范围：不新增获得途径，保留仅登记，符合非目标。
