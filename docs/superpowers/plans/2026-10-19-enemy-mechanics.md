# 机制怪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给引擎加上"开战自带状态、受击触发、分裂/召唤、偷金币逃跑、击晕"这批能力，并做出蟑螂、蜂巢、分裂史莱姆、召唤师、哥布林、甲壳虫六只机制怪，普通战斗节点随机（由种子决定）出其中一只。

**Architecture:** 敌人的机制全部是"开战自带的状态"（`EnemyDef.startStatuses`），沿用 `STATUSES` 注册表，所以图标和悬浮说明不用另做。状态通过新增钩子（`capDamage`、`onHit`）接入 `applyDamage`；分裂、召唤、偷窃、逃跑、击晕写在 `effects.ts` / `battle.ts` 的敌人行动流程里。敌人意图永远是固定循环，不引入任何随机。

**Tech Stack:** Vue 3 + TypeScript、Vitest（`npx vitest run`）。

**Spec:** [2026-10-19-enemy-mechanics-design.md](../specs/2026-10-19-enemy-mechanics-design.md)

## Global Constraints

- 敌人的意图是固定循环：任何敌人的行动序列不得出现随机或条件分支（`intentIndex` 只在行动后 +1）。
- 引擎纯函数：`dispatch` 不修改入参（沿用 `draft`），不引入新的随机来源。
- 战斗里已死的敌人保留在原位，下标稳定；新增敌人追加到 `enemies` 末尾。
- 同时存活的敌人上限 4 只，分裂 / 召唤在上限下落空。
- 新状态加在 `STATUSES` 末尾，不要调换已有状态的顺序（声明顺序即结算顺序）。
- 不提交：工作区有大量与本计划无关的未提交改动，提交由用户决定，所以计划里没有 commit 步骤。
- 类型检查命令 `npx vue-tsc --noEmit`：已有两条与本计划无关的错误（`CardView.vue` 缺 `curse` 稀有度、`BattleView.vue` 找不到 `fxTimes`），除此之外不得新增。

## Review Focus

1. 分裂史莱姆被一击打到 0 血以下：不分裂（死了就是死了）。→ Task 4
2. 场上已有 4 只存活敌人时：分裂和召唤都落空，战斗继续、不报错。→ Task 4
3. 哥布林偷了金币后被中毒杀死（不是被攻击杀死）：金币也要归还。→ Task 5
4. 玩家金币不足偷窃数额（含 0 金币）：只偷剩下的，不出现负数。→ Task 5
5. 蜂巢被打中但伤害全被格挡：照样塞晕眩。→ Task 2

---

## 文件结构

- `src/engine/types.ts`：类型（`EnemyDef` / `EnemyState` / `BattleState` / `Intent` / `GameEvent`）。
- `src/engine/statuses.ts`：新状态与两个新钩子。
- `src/engine/effects.ts`：`applyDamage` 接入封顶 / 受击触发 / 分裂 / 死亡归还；`spawnEnemy`。
- `src/engine/battle.ts`：开战自带状态；敌人行动流程里的击晕、硬壳、召唤、偷窃、逃跑。
- `src/engine/run.ts`：战斗带入 / 带出金币；逃脱结算；普通战斗节点的怪物池。
- `src/data/enemies.ts`：六只怪的定义与 `monsterPool`。
- `src/data/cards/curses.ts`：晕眩状态牌。
- `src/engine/enemies.test.ts`：新建，本计划所有引擎测试。
- `src/ui/EnemyView.vue`、`src/ui/RunView.vue`：界面。

---

### Task 1: 开战自带状态 + 蟑螂（伤害封顶）

**Files:**
- Modify: `src/engine/types.ts`（`EnemyDef`、`GameEvent` 不动）
- Modify: `src/engine/statuses.ts`（`StatusDef.capDamage`、`capHpLoss`、状态 `damageCap`）
- Modify: `src/engine/effects.ts`（`applyDamage`）
- Modify: `src/engine/battle.ts`（`createBattle`）
- Modify: `src/data/enemies.ts`（`cockroach`）
- Test: `src/engine/enemies.test.ts`（新建）

**Interfaces:**
- Produces: `EnemyDef.startStatuses?: Record<string, number>`、`EnemyDef.icon?: string`；`StatusDef.capDamage?: (stacks: number) => number`（返回单次攻击最多损失的生命）；`capHpLoss(owner: Statuses, loss: number): number`（statuses.ts 导出）；数据 `cockroach: EnemyDef`。

- [ ] **Step 1: 写失败的测试** `enemies.test.ts`，顶部放本文件共用的 `fight(enemy: EnemyDef, seed = 1): BattleState`（`createBattle({ seed, deck: starterDeck, enemy, cards }).state`）和一个内联的 `dummy(over: Partial<EnemyDef>): EnemyDef`（`maxHp: 100`，意图 `[{ type: 'defend', block: 1 }]`）。测试 `describe('伤害封顶')`：
  - `cheatDamage 30` 打 `dummy({ startStatuses: { damageCap: 9 } })` → `enemies[0].hp === 91`。
  - 先把敌人 `block` 设为 5，再 `cheatDamage 12` → `hp === 93`（格挡先抵消，剩下的 7 没超过 9）。
  - 开战后 `enemies[0].statuses.damageCap === 9`。
- [ ] **Step 2: 运行确认失败** `npx vitest run src/engine/enemies.test.ts`，预期 FAIL。
- [ ] **Step 3: 实现。** `EnemyDef` 加两个可选字段；`createBattle` 构造敌人时 `statuses: { ...def.startStatuses }`；`statuses.ts` 新增状态 `damageCap`（名称「众生平等」、图标 `⚖️`、`kind: 'buff'`、`decay: 'none'`、文案「每次受到的攻击最多损失 N 点生命」），`capHpLoss` 遍历 `STATUSES` 取所有 `capDamage` 的最小值；`applyDamage` 里 `hpLost = Math.min(t.hp, capHpLoss(t.statuses, amount - blocked))`（只作用于 `applyDamage`，不作用于 `loseHp`）。`enemies.ts` 加 `cockroach`：id `cockroach`、名称「蟑螂」、`icon: '🪳'`、`maxHp: 40`、`startStatuses: { damageCap: 9 }`、意图循环 攻击 6 → 格挡 8 → 攻击 10。
- [ ] **Step 4: 运行确认通过** `npx vitest run src/engine/enemies.test.ts`，预期 PASS；再跑 `npx vitest run` 确认已有测试不受影响。

---

### Task 2: 蜂巢（受击塞晕眩）

**Files:**
- Modify: `src/engine/statuses.ts`（`StatusDef.onHit`、状态 `hive`）
- Modify: `src/engine/types.ts`（事件 `cardAdded`）
- Modify: `src/engine/effects.ts`（`applyDamage`）
- Modify: `src/data/cards/curses.ts`（`stun`）
- Modify: `src/data/enemies.ts`（`hive`）
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Produces: `StatusDef.onHit?: (stacks: number) => { cardId: string; count: number }`；`GameEvent` 新增 `{ type: 'cardAdded'; cardId: string; count: number }`；卡牌 id `'stun'`；数据 `hive: EnemyDef`。

- [ ] **Step 1: 写失败的测试** `describe('蜂巢')`：`dummy({ startStatuses: { hive: 1 } })`，手牌 `['strike']`，打出后 `discardPile` 含 `'stun'` 且含 `'strike'`，事件含 `{ type: 'cardAdded', cardId: 'stun', count: 1 }`；把敌人格挡设为 20 再打出（伤害全被挡住）→ 照样塞入 `'stun'`；`cheatDamage`（无来源）不塞晕眩。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `curses.ts` 加 `Card.status('stun', '晕眩').icon('💫').cost(0).unplayable().text('无法打出')`；`statuses.ts` 新增状态 `hive`（「毒针」、`🐝`、`buff`、`none`、文案「每次被攻击，往玩家弃牌堆置入 N 张晕眩」，`onHit: (n) => ({ cardId: 'stun', count: n })`）；`applyDamage` 在伤害结算后，若 `target === 'enemy'` 且 `opts.source?.side === 'player'`，遍历有 `onHit` 的状态，把牌推进 `s.discardPile`，并依次发 `statusTriggered` 和 `cardAdded` 事件（无论是否被格挡）。`enemies.ts` 加 `hive`：id `hive`、「蜂巢」、`icon: '🐝'`、`maxHp: 36`、`startStatuses: { hive: 1 }`、意图 攻击 7 → 给玩家虚弱 1 → 攻击 9。
- [ ] **Step 4: 运行确认通过。**

---

### Task 3: 击晕 + 甲壳虫（防御反制）

**Files:**
- Modify: `src/engine/statuses.ts`（状态 `carapace`、`stunned`）
- Modify: `src/engine/battle.ts`（`endTurn` 敌人行动流程）
- Modify: `src/data/enemies.ts`（`beetle`）
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Produces: 状态 `stunned`（敌人跳过下一次行动，跳过时移除，不推进 `intentIndex`）；状态 `carapace`；数据 `beetle: EnemyDef`。

- [ ] **Step 1: 写失败的测试** `describe('甲壳虫')`：敌人 `dummy({ startStatuses: { carapace: 1 }, intents: [{ type: 'attack', damage: 5 }, { type: 'attack', damage: 7 }] })`。
  - 玩家 `block` 设为 10，`endTurn` 后：`enemies[0].statuses.stunned === 1`，`intentIndex === 1`，玩家 hp 不变。
  - 紧接着再 `endTurn`：玩家 hp 仍不变（被晕，7 点攻击没打出来），`statuses.stunned` 为 `undefined`，`intentIndex` 仍为 1。
  - 再 `endTurn` 一次：敌人打出第二个攻击，玩家 hp 减少 7。
  - 玩家没完全格挡（block 3，攻击 5）：不被击晕。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 状态 `carapace`（「硬壳」、`🪲`、`buff`、`none`、文案「攻击被完全格挡时，陷入晕眩一回合」）、`stunned`（「晕眩」、`💫`、`debuff`、`none`、文案「跳过下一次行动」）。`endTurn` 里敌人在 `tickStatuses` 之后、取意图之前：若 `statuses.stunned > 0`，删除该状态并发 `statusRemoved`，`return`（不发 `enemyActed`、不推进 `intentIndex`）。攻击结算处 `perfect` 为真时，若 `enemy.statuses.carapace > 0` 则 `addStatus(s, 'enemy', enemyIndex, 'stunned', 1, events)`。`enemies.ts` 加 `beetle`：id `beetle`、「甲壳虫」、`icon: '🪲'`、`maxHp: 45`、`startStatuses: { carapace: 1 }`、意图 格挡 6 → 攻击 11 → 攻击 7。
- [ ] **Step 4: 运行确认通过。**

---

### Task 4: 新增敌人 + 分裂史莱姆 + 召唤师

**Files:**
- Modify: `src/engine/types.ts`（`EnemyDef.splitInto`、`Intent` 加 `summon`、事件 `enemySpawned` / `enemySplit`）
- Modify: `src/engine/statuses.ts`（状态 `split`）
- Modify: `src/engine/effects.ts`（`MAX_ENEMIES`、`livingCount`、`spawnEnemy`、`applyDamage` 末尾分裂）
- Modify: `src/engine/battle.ts`（`summon` 意图）
- Modify: `src/data/enemies.ts`（`smallSlime`、`splitSlime`、`summoner`）
- Test: `src/engine/enemies.test.ts`

**Interfaces:**
- Produces: `MAX_ENEMIES = 4`；`livingCount(s: BattleState): number`；`spawnEnemy(s: BattleState, def: EnemyDef, events: GameEvent[], hp?: number): number`（返回新敌人下标，已达上限返回 -1，成功发 `{ type: 'enemySpawned'; enemyIndex: number }`）；`EnemyDef.splitInto?: EnemyDef`；`Intent` 新增 `{ type: 'summon'; enemy: EnemyDef }`；事件 `{ type: 'enemySplit'; enemyIndex: number; spawned: number[] }`。数据 `smallSlime`、`splitSlime`、`summoner`（均为 `EnemyDef`）。

- [ ] **Step 1: 写失败的测试** `describe('分裂')` 与 `describe('召唤')`：
  - 分裂：`splitter = dummy({ maxHp: 40, startStatuses: { split: 1 }, splitInto: child })`（`child` 为 `maxHp: 20`、意图 攻击 3）；`cheatDamage 20` → `enemies.length === 3`，`enemies[0].hp === 0`，`enemies[1].hp === 20`、`enemies[2].hp === 20`，`enemies[1].def.id === child.id`，事件含 `enemySplit`。
  - 分裂（重点 1）：`cheatDamage 40` → `enemies.length === 1`，没有 `enemySplit` 事件。
  - 分裂（重点 2）：开战敌人 `[splitter, big, big, big]`（`big` 为 `maxHp: 100` 的 `dummy`），`cheatDamage 20` → `enemies.length === 4`，`enemies[0].hp === 20`，不报错。
  - 召唤：`dummy({ intents: [{ type: 'summon', enemy: child }] })`，`endTurn` 后 `enemies.length === 2`，`enemies[1].def.id === child.id`，事件含 `enemySpawned`；新敌人当回合不行动（玩家 hp 不变）。
  - 召唤（重点 2）：4 只存活时 `endTurn`，`enemies.length` 仍为 4。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** 状态 `split`（「分裂」、`🧬`、`buff`、`none`、文案「生命降到一半以下时分裂成两只小怪」）。`applyDamage` 末尾：目标是敌人、本次 `hpLost > 0`、`t.hp > 0`、`statuses.split > 0`、`def.splitInto` 存在、`t.hp * 2 <= def.maxHp`、且 `livingCount(s) + 1 <= MAX_ENEMIES` 时分裂：原敌人 `hp = 0`（不触发归还），用 `spawnEnemy` 追加两只 `splitInto`，生命均为分裂时的剩余生命，发 `enemySplit`。`spawnEnemy` 追加 `{ def, hp: hp ?? def.maxHp, block: 0, intentIndex: 0, statuses: { ...def.startStatuses } }`；`endTurn` 的 `s.enemies.forEach` 只会遍历开始时已有的敌人，所以新敌人本回合不行动（不要改成按下标循环）。`endTurn` 敌人行动改成 `switch (intent.type)`，加 `summon` 分支调用 `spawnEnemy`。`enemies.ts`：`smallSlime`（「小史莱姆」、`🟢`、`maxHp: 20`、意图 攻击 5 → 格挡 4）、`splitSlime`（「分裂史莱姆」、`maxHp: 40`、`startStatuses: { split: 1 }`、`splitInto: smallSlime`、意图 攻击 8 → 格挡 6 → 攻击 12，与现有 `slime` 一致，**不要改现有 `slime`**）、`summoner`（「召唤师」、`icon: '🧙'`、`maxHp: 50`、意图 攻击 6 → 召唤 `smallSlime` → 格挡 8）。
- [ ] **Step 4: 运行确认通过。**

---

### Task 5: 战斗内金币 + 哥布林（偷窃、逃跑、击杀归还）

**Files:**
- Modify: `src/engine/types.ts`（`BattleState.gold` / `escaped`、`BattleConfig.playerGold`、`EnemyState.stolenGold` / `fled`、`Intent` 加 `steal` / `flee`、事件 `goldStolen` / `goldReturned` / `enemyFled`）
- Modify: `src/engine/effects.ts`（`onEnemyDeath`，在 `applyDamage` 与 `loseHp` 里调用）
- Modify: `src/engine/battle.ts`（`createBattle` 带入金币；`steal` / `flee` 意图）
- Modify: `src/engine/run.ts`（`startBattle` 传 `playerGold: run.gold`；`continueRun` 回写金币、处理逃脱）
- Modify: `src/data/enemies.ts`（`goblin`）
- Test: `src/engine/enemies.test.ts`、`src/engine/run.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `isAlive` 语义不变（`hp > 0`）。
- Produces: `BattleState.gold: number`；`BattleState.escaped?: boolean`（最后一个离场的敌人是逃跑的）；`BattleConfig.playerGold?: number`；`EnemyState.stolenGold?: number`、`EnemyState.fled?: boolean`；`Intent` 新增 `{ type: 'steal'; amount: number }` 和 `{ type: 'flee' }`；事件 `{ type: 'goldStolen'; amount: number; enemyIndex: number }`、`{ type: 'goldReturned'; amount: number }`、`{ type: 'enemyFled'; enemyIndex: number }`；数据 `goblin`。

- [ ] **Step 1: 写失败的测试** `describe('哥布林')`（`createBattle` 传 `playerGold: 10`，敌人 `dummy({ maxHp: 30, intents: [{ type: 'steal', amount: 15 }, { type: 'flee' }] })`）：
  - 第一次 `endTurn`：`state.gold === 0`，`enemies[0].stolenGold === 10`（重点 4：只偷剩下的），事件含 `goldStolen`；`playerGold: 0` 时 `gold` 仍为 0，`stolenGold` 为 0 或 `undefined`。
  - 偷完后 `cheatDamage 99` 击杀：`gold === 10`，事件含 `goldReturned`。
  - 重点 3：偷完后给敌人 `statuses: { poison: 99 }`，再 `endTurn`，中毒在回合开始杀死它：`gold === 10`。
  - 逃跑：连续两次 `endTurn` → `enemies[0].fled === true`、`enemies[0].hp === 0`、`phase === 'won'`、`escaped === true`、`gold === 0`（金币不归还），事件含 `enemyFled`。
  - 场上还有别的存活敌人时哥布林逃跑：战斗继续，`phase === 'player'`，`escaped` 不为真。
  - `run.test.ts`：把一个 `battle.phase === 'won'`、`escaped: true`、`gold: 7` 的战斗放进 run，`dispatchRun(run, { type: 'continue' })` → `screen === 'map'`、`run.gold === 7`、`rewards` 为空；同样条件但 `escaped` 为假 → `screen === 'reward'` 且 `run.gold === 7`（沿用该文件已有的构造 run 的辅助方法）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `createBattle` 令 `gold: config.playerGold ?? 0`。`onEnemyDeath(s, enemyIndex, events)`：`stolenGold > 0` 时 `s.gold += stolenGold`、清零、发 `goldReturned`；在 `applyDamage` 与 `loseHp` 里，敌人 `hp` 从大于 0 变为 0 时调用。`endTurn` 行动分支：`steal` 取 `min(s.gold, amount)`，扣玩家、记到 `enemy.stolenGold`、发 `goldStolen`；`flee` 令 `enemy.hp = 0`、`enemy.fled = true`、发 `enemyFled`，若此后 `!s.enemies.some(isAlive)` 则 `s.escaped = true`（在 `endBattleIfOver` 之前）。`run.ts`：`startBattle` 传 `playerGold: run.gold`；`continueRun` 胜利时 `gold: battle.gold` 写回，若 `battle.escaped` 则把 `{ ...run, screen: 'reward', battle: null, player, gold, rewards: [] }` 交给 `finishRewards` 直接回到地图（事件战斗的额外奖励随之丢弃）。`enemies.ts` 加 `goblin`：id `goblin`、「哥布林」、`icon: '👺'`、`maxHp: 30`、意图 攻击 5 → 偷 15 金币 → 逃跑。
- [ ] **Step 4: 运行确认通过，** 再跑 `npx vitest run` 全量。

---

### Task 6: 普通战斗节点出怪

**Files:**
- Modify: `src/engine/run.ts`（`RunContent.monsters`、`createRun` 复制该字段、`startBattle` 选怪）
- Modify: `src/data/enemies.ts`（导出 `monsterPool`）
- Modify: `src/composables/useRun.ts`（`content()` 加 `monsters: monsterPool`）
- Test: `src/engine/run.test.ts`

**Interfaces:**
- Consumes: Task 1–5 的六只怪。
- Produces: `RunContent.monsters?: EnemyDef[]`；`monsterPool: EnemyDef[]`（`cockroach`、`hive`、`splitSlime`、`summoner`、`goblin`、`beetle`）。

- [ ] **Step 1: 写失败的测试**（`run.test.ts`，沿用已有的构造 run 方式，给 content 加 `monsters: [a, b]`，两只 `maxHp` 不同的怪）：进入一个普通战斗节点 → `battle.enemies.length === 1` 且 `def` 在 `[a, b]` 里；同种子同节点两次进入选到的是同一只；精英 / Boss 节点和事件触发的战斗仍用 `content.enemies`；没有 `monsters` 时行为与原来完全一致（已有测试保持通过）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现。** `startBattle` 里：当 `findNode(run.map, nodeId)?.type === 'monster'` 且 `run.content.monsters?.length` 时，敌人为 `sample(monsters, 1, createRng(deriveSeed(run.seed, `enemy:${nodeId}`)))`；否则沿用 `content.enemies ?? [content.enemy]`。`createRun` 的 content 里补 `monsters: config.monsters`。`monsterPool` 与 `useRun.ts` 的 `content()` 接上。
- [ ] **Step 4: 运行确认通过，** 全量 `npx vitest run`。

---

### Task 7: 界面

**Files:**
- Modify: `src/ui/EnemyView.vue`
- Modify: `src/ui/RunView.vue`

**Interfaces:**
- Consumes: Task 1 的 `EnemyDef.icon`；Task 4–5 的新 `Intent` 类型与 `EnemyState.stolenGold`；`BattleState.gold`。

- [ ] **Step 1: `EnemyView.vue`。** 意图区把现有的 `v-else`（debuff / buff）改成显式分支，否则新增意图会让 `intent.status` 类型报错：`summon` 显示 `📣 召唤`、`steal` 显示 `🪙 偷 {amount}`、`flee` 显示 `💨 逃跑`，颜色用 `text-purple-300`。模型圆里的 `🟢` 换成 `enemy.def.icon ?? '🟢'`。敌人身上有 `stolenGold > 0` 时，在血量行旁边显示 `🪙 {stolenGold}`。
- [ ] **Step 2: `RunView.vue`。** 战斗中状态栏的金币参照已有的 `hudHp`（战斗中显示战斗内的生命）做一个 `hudGold`：战斗中显示 `run.battle.gold`，否则 `run.gold`，传给 `RunHud`。
- [ ] **Step 3: 类型检查** `npx vue-tsc --noEmit`，预期只剩 Global Constraints 里那两条已有错误。
- [ ] **Step 4: 手动看一遍**（仅此任务需要，无法写单测）：`npm run dev`，用上帝模式或多开几局，遇到哥布林确认偷金币 / 逃跑的意图和金币显示正确；遇到分裂史莱姆和召唤师确认 4 只敌人在 1280 宽的舞台里排得下、新敌人出现不错位；蜂巢被打后弃牌堆里有晕眩。若 4 只敌人排布溢出，调整 `BattleView.vue` 里敌人行的间距 / 缩放。

---

## 自检结果

- **Spec 覆盖：** 六类机制各有任务（封顶 T1、受击塞牌 T2、反制+击晕 T3、分裂+召唤 T4、偷窃逃跑 T5）；"引擎新增能力汇总"六项都落在 T1–T5；界面见 T7；出怪方式（T6）是 spec 没写但"让玩家实际遇到"必需的，作为本计划的决定。
- **偏离 spec 的地方：** 蜂巢的药水也会触发（spec 已同步改过）；逃脱结算在多只敌人时只看"最后一个离场的是不是逃跑"。
- **类型一致性：** `spawnEnemy`、`livingCount`、`MAX_ENEMIES`、`stolenGold`、`fled`、`escaped`、`startStatuses`、`splitInto` 在各任务里同名。
