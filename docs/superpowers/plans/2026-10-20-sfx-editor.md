# 音效编辑面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个仅开发模式的"音效编辑"面板：复现游戏里每个有动画的场景，用户为每个"音效槽位"挑选音效文件、试听、保存，保存后写回源码并立即生效。

**Architecture:** 所有音效改由"槽位键"触发，槽位键到文件的对应关系集中在 `src/data/sfxMap.ts`（由面板保存时整体重写）。战斗内的音效挂在演出队列（`useFx` 的 `drain`）上，所以面板复现与真实游戏走同一条路径；战斗外的触发点仍在原界面里，只是改传槽位键。面板的场景复现：战斗类槽位用只读 `BattleView` + 预设状态 + `pushFx`（与 `DevTestView` 同法），战斗外槽位挂真实组件。保存走 Vite 开发服务器插件（与 `tools/cardEditorPlugin.ts` 同构）。

**Tech Stack:** Vue 3 + TS、Vite 7、UnoCSS、Web Audio、vitest（node 环境）。

**Spec:** `docs/superpowers/specs/2026-10-20-sfx-editor-design.md`

## Global Constraints

- 槽位键写法：`分组.事件.变体`（点分，字母数字，如 `battle.damage.player`）。
- 面板与写文件接口只在开发服务器存在：入口用 `import.meta.env.DEV` + `defineAsyncComponent`；插件 `apply: 'serve'`；写接口校验请求头 `x-sfx-editor: 1`。
- 音效文件放 `src/assets/sfx/`；音效库列出 ogg、mp3、wav；面板只新增 / 替换，不删文件。
- 导入文件名只保留字母、数字、连字符、下划线；重名自动加序号，不覆盖已有文件。
- 节流按槽位：同一槽位 40 ms 内只响一次。
- 一个槽位可挂多个文件，播放时随机取一个；槽位有三态：已配 / 未配 / 有意静音。
- "只播开头 N 秒"（`maxSeconds`）和音量倍数（`volume`）属于槽位配置，不再由调用处传参。
- 史莱姆分裂槽位的初始值是合成音（`synth: 'split'`），选了文件则覆盖，清空则回到合成音。
- ffmpeg 不是项目依赖：导入时本机有 `ffmpeg`（在 PATH 上）才压成单声道 48 kbps ogg，没有则原样复制。
- 面板里的场景使用独立状态副本，不读写存档。
- 已有听感迁移后不变：现有 9 个旧音效名对应的槽位见 Task 3。

## Review Focus

- 保存请求里槽位键不在清单里 / 文件名含 `../` 或反斜杠：必须整体拒绝，不写任何文件。
- `sfxMap` 里引用了磁盘上不存在的文件：播放时静默跳过，不抛错，面板里标红。
- 同一槽位 40 ms 内连续触发（多段伤害）：只响一次；不同槽位共用同一文件时各自响。
- 槽位被设为"有意静音"或文件列表为空且无合成音：`playSfx` 什么都不播且不报错。
- 同一次演出里 `cardAdded` 只能响一次（战斗内既有队列事件又有 `RunView` 的弹牌动画）：队列侧不映射它。
- 面板里试听未保存的草稿后关闭 / 放弃：游戏里的实际配置不变。

---

## 文件结构

- Create `src/data/sfxSlots.ts` — 槽位清单（键、中文名、分组），面板的清单来源。
- Create `src/data/sfxMap.ts` — 用户的选择：槽位键 → `SlotConfig`；由保存接口整体重写。
- Create `src/composables/sfxResolve.ts` — 纯函数：选文件、槽位状态、节流判断、事件→槽位键。不碰 `AudioContext` / `localStorage`，可在 node 下测试。
- Modify `src/composables/useSfx.ts` — 改为 `playSfx(slot)`；草稿覆盖；合成分裂音保留。
- Modify `src/composables/useFx.ts` — `drain` 里在调用 handler 前触发队列侧音效。
- Modify `src/ui/BattleView.vue`、`RunHud.vue`、`RelicReveal.vue`、`RunView.vue`、`ShopView.vue` — 改传槽位键 / 删掉重复触发。
- Create `tools/sfxEditorCore.ts` — 纯函数：校验保存请求、安全文件名、生成 `sfxMap.ts` 源码。
- Create `tools/sfxEditorPlugin.ts` — Vite 插件，`POST /__dev/sfx`。
- Modify `vite.config.ts`、`vitest.config.ts`（加入 `tools/**/*.test.ts`）。
- Create `src/ui/SfxEditorView.vue`、`src/ui/sfxScenes.ts`、`src/ui/SfxScene.vue` — 面板、每个槽位的场景脚本、场景承载组件。
- Modify `src/App.vue` — 开发入口按钮。

---

### Task 1: 槽位清单

**Files:**
- Create: `src/data/sfxSlots.ts`
- Test: `src/data/sfxSlots.test.ts`

**Interfaces:**
- Produces: `export interface SlotDef { key: string; label: string; group: string }`；`export const SFX_SLOTS: SlotDef[]`；`export const SLOT_KEYS: Set<string>`。

清单（键 → 中文名），按分组：

- 战斗·出牌：`battle.cardPlayed.attack` 出攻击牌、`battle.cardPlayed.skill` 出技能牌、`battle.cardPlayed.power` 出能力牌
- 战斗·牌堆：`battle.cardDrawn` 抽牌、`battle.reshuffled` 洗牌、`battle.handDiscarded` 弃手牌、`battle.energyGained` 获得能量、`battle.turnStarted` 回合开始
- 战斗·伤害：`battle.damage.enemy` 敌人受伤、`battle.damage.player` 玩家受伤、`battle.damage.poison` 毒伤、`battle.damage.trigger` 触发类伤害、`battle.damage.blocked` 伤害被护盾挡住、`battle.perfectBlock` 完美格挡
- 战斗·护盾回血：`battle.block.player`、`battle.block.enemy`、`battle.heal.player`、`battle.heal.enemy`
- 战斗·状态：`battle.status.buff`、`battle.status.debuff`、`battle.status.removed`、`battle.status.triggered`、`battle.cardTriggered` 手牌触发、`battle.enchantGrew` 附魔成长
- 战斗·塞牌：`battle.cardAdded.bad` 塞入诅咒 / 状态牌、`battle.cardAdded.normal` 塞入普通牌
- 战斗·药水：`battle.potion`
- 战斗·敌人：`battle.enemy.attack` 敌人攻击、`battle.enemy.act` 敌人其他行动、`battle.enemy.spawn` 登场、`battle.enemy.split` 史莱姆分裂、`battle.enemy.flee` 逃跑
- 战斗·金币：`battle.gold.stolen` 被偷、`battle.gold.returned` 还回
- 战斗·结束：`battle.end.won`、`battle.end.lost`
- 战斗外：`run.gold.gain` 金币增加、`run.gold.spend` 金币减少、`run.shop.poor` 商店买不起、`run.forge.upgrade` 锻造 / 升级敲击、`run.enchant` 附魔镶嵌、`run.relic.gained` 获得遗物、`run.hpLost` 战斗外失血

- [ ] **Step 1: 写失败测试** `src/data/sfxSlots.test.ts`，断言：`SFX_SLOTS` 的键互不相同；每个键匹配 `/^[a-z]+(\.[a-zA-Z]+)+$/`；每项 `label` 与 `group` 非空；`SLOT_KEYS.has('battle.enemy.split')` 为 true。
- [ ] **Step 2: 运行确认失败** `pnpm vitest run src/data/sfxSlots.test.ts`，预期失败（模块不存在）。
- [ ] **Step 3: 实现** `src/data/sfxSlots.ts`，内容就是上面的清单。
- [ ] **Step 4: 运行确认通过**，预期 PASS。
- [ ] **Step 5: 提交** `feat: 音效槽位清单`

### Task 2: 槽位配置与解析（纯逻辑）

**Files:**
- Create: `src/composables/sfxResolve.ts`
- Test: `src/composables/sfxResolve.test.ts`

**Interfaces:**
- Consumes: `SLOT_KEYS`（Task 1）、`GameEvent`（`@/engine/types`）、`CardDef`。
- Produces:
  - `export interface SlotConfig { files?: string[]; volume?: number; maxSeconds?: number; silent?: boolean; synth?: 'split' }`
  - `export type SfxMap = Record<string, SlotConfig>`
  - `export type SlotStatus = 'configured' | 'missing' | 'silent'`
  - `export function slotStatus(map: SfxMap, key: string): SlotStatus` —— `silent` 为 true → `silent`；`files` 非空或有 `synth` → `configured`；否则 `missing`。
  - `export function pickFile(config: SlotConfig, rand: () => number): string | undefined` —— 从 `files` 里按 `rand()` 取一个，空则 `undefined`。
  - `export function shouldPlay(lastAt: number | undefined, now: number, windowMs?: number): boolean` —— 窗口默认 40。
  - `export function sfxSlotsForEvent(e: GameEvent, prev: GameEvent | undefined, cards: Record<string, CardDef>): string[]` —— 战斗演出队列里一个事件对应的槽位键（可空）。

`sfxSlotsForEvent` 的映射规则（与 `BattleView` 现有演出逻辑一致）：
- `cardPlayed`：按 `cards[e.cardId]?.kind` 取 `battle.cardPlayed.<kind>`；牌不存在则空。
- `damageDealt`：成因按 `prev` 判断，规则同 `BattleView.damageCause`（`prev` 是 `cardTriggered` 且目标是玩家 → trigger；`prev` 是同目标同敌人的 `statusTriggered` 时，毒 → poison，其他 → trigger；否则 attack）。poison → `battle.damage.poison`（仅 `amount>0`）；`amount<=0` 且 `blocked>0` → `battle.damage.blocked`；`amount>0`：trigger 成因且目标玩家 → `battle.damage.trigger`，否则目标玩家 → `battle.damage.player`，目标敌人 → `battle.damage.enemy`。
- `blockGained` → `battle.block.<target>`；`healed` → `battle.heal.<target>`。
- `cardDrawn`、`reshuffled`、`handDiscarded`、`energyGained`、`turnStarted`、`perfectBlock`、`cardTriggered`、`cardEnchantGrew`（→ `battle.enchantGrew`）、`potionUsed`（→ `battle.potion`）各对应同名槽位。
- `statusApplied`：按状态种类取 `battle.status.buff|debuff`（种类取自 `@/engine/statuses` 的 `statusById[e.status]?.kind`，缺省 debuff）；`statusRemoved` → `battle.status.removed`；`statusTriggered` → `battle.status.triggered`。
- `enemyActed`：`intent.type === 'attack'` → `battle.enemy.attack`，否则 `battle.enemy.act`；`enemySpawned` → `battle.enemy.spawn`；`enemySplit` → `battle.enemy.split`；`enemyFled` → `battle.enemy.flee`。
- `goldStolen` → `battle.gold.stolen`；`goldReturned` → `battle.gold.returned`；`battleEnded` → `battle.end.won|lost`。
- **不映射** `cardAdded`（由 `RunView` 的弹牌动画触发，避免重复）、`relicGained`、`cardsUpgraded`、`hpLost`、`invalidAction`。

- [ ] **Step 1: 写失败测试** `sfxResolve.test.ts`，用例名与断言：
  - `slotStatus 三态`：`{a:{files:['x.ogg']}}` → a 为 configured；`{a:{silent:true,files:['x.ogg']}}` → silent；`{a:{synth:'split'}}` → configured；`{}` 与 `{a:{files:[]}}` → missing。
  - `pickFile`：`rand=()=>0` 取第一个，`rand=()=>0.999` 取最后一个；空列表返回 `undefined`。
  - `shouldPlay`：`shouldPlay(undefined, 100)` 为 true；`shouldPlay(100, 139)` 为 false；`shouldPlay(100, 140)` 为 true。
  - `sfxSlotsForEvent`：玩家受伤（amount 5, blocked 0）→ `['battle.damage.player']`；敌人受伤 → `['battle.damage.enemy']`；`amount 0, blocked 3` → `['battle.damage.blocked']`；前一事件是毒的 `statusTriggered` 且同目标 → `['battle.damage.poison']`；前一事件是 `cardTriggered` 且目标玩家 → `['battle.damage.trigger']`；`enemyActed` 攻击意图 → `['battle.enemy.attack']`；`enemySplit` → `['battle.enemy.split']`；`cardAdded` → `[]`；`cardPlayed` 对一张技能牌 → `['battle.cardPlayed.skill']`。
  - 完整性：遍历 `GameEvent['type']` 的每个事件的样例，`sfxSlotsForEvent` 返回的键都必须在 `SLOT_KEYS` 里。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现** `sfxResolve.ts`（纯函数，导出上述接口）。
- [ ] **Step 4: 运行确认通过**
- [ ] **Step 5: 提交** `feat: 音效槽位解析与事件映射`

### Task 3: 运行时迁移（useSfx、sfxMap、触发点）

**Files:**
- Create: `src/data/sfxMap.ts`
- Modify: `src/composables/useSfx.ts`、`src/composables/useSfxEvents.ts`、`src/composables/useFx.ts`、`src/ui/BattleView.vue`、`src/ui/RunHud.vue`、`src/ui/RunView.vue`
- Test: `src/data/sfxMap.test.ts`

**Interfaces:**
- Consumes: `SfxMap`/`SlotConfig`/`pickFile`/`shouldPlay`/`sfxSlotsForEvent`（Task 2）。
- Produces:
  - `export const sfxMap: SfxMap`（`src/data/sfxMap.ts`，保存接口会整体重写它，所以文件格式固定为：一行 `import type`，然后 `export const sfxMap: SfxMap = {...}`，键按字母序）。
  - `useSfx.ts`：`playSfx(slot: string, opts?: { volume?: number; maxSeconds?: number }): Promise<void>`（`opts` 覆盖槽位配置，供 RelicReveal 的敲击音量渐变用）；`setSfxDraft(map: SfxMap | null): void`（非空时试听草稿，空则回到已保存配置）；`export const sfxLibrary: string[]`（`src/assets/sfx/` 下所有 ogg / mp3 / wav 的文件名）；`sfxUrl(name: string): string | undefined`；保留 `sfxVolume`、`setSfxVolume`、`preloadSfx`。
  - 合成分裂音保留为内部函数，由 `synth: 'split'` 触发，`playSplitSfx` 导出删除。
  - `useFx.ts`：`drain` 里在 `await handler?.(...)` 之前，调用 `playEventSfx(entry.event, entry.prev)`；`playEventSfx` 用 `sfxSlotsForEvent` 加 `playSfx`，需要当前战斗的 `cards`：`FxHandler` 注册处新增 `setFxCards(cards: Record<string, CardDef> | null)`，`BattleView` 挂载时设置、卸载时清除。

迁移后的初始配置（保证听感不变）：

| 槽位 | 文件 |
|---|---|
| `run.gold.gain` | coin-1.ogg, coin-2.ogg |
| `battle.heal.player`、`battle.heal.enemy` | heal-1.ogg, heal-2.ogg |
| `battle.damage.player`、`battle.damage.trigger` | hurt-1.ogg, hurt-2.ogg |
| `battle.damage.enemy` | hit-1.ogg, hit-2.ogg |
| `battle.block.player`、`battle.block.enemy`、`battle.damage.blocked` | block-1.ogg, block-2.ogg |
| `run.forge.upgrade` | forge-1.ogg, forge-2.ogg，`maxSeconds: 0.5` |
| `run.enchant` | enchant-1.mp3 |
| `battle.cardAdded.bad` | curse-1.ogg, curse-2.ogg |
| `battle.cardAdded.normal` | card-1.ogg, card-2.ogg, card-3.ogg |
| `battle.enemy.split` | `synth: 'split'` |

触发点改动：
- `BattleView.vue`：删掉所有 `playSfx(...)` / `playSplitSfx()` 调用和 `enemySplit` 的 player；挂载时 `setFxCards(props.state.cards)`，卸载时 `setFxCards(null)`。
- `RunHud.vue`：金币增加 → `playSfx('run.gold.gain')`，金币减少 → `playSfx('run.gold.spend')`。
- `useSfxEvents.ts`（`RelicReveal` 已不再发声，整局层面的事件音效都在这里订阅 `fxBatch`）：`hammer()` 里 `playSfx('run.forge.upgrade', { volume, maxSeconds: 0.5 })`；`relicGained` 带新附魔 → `run.enchant`，带改牌的升级 → `hammer()`，其余（含只回血的遗物）→ `run.relic.gained`；`relicGained` 带 `heal` 时再响一次 `battle.heal.player`；新增 `hpLost` → `run.hpLost`。文件头注释里"战斗内音效仍在 BattleView 的播放器里"改为"战斗内音效挂在 `useFx` 的演出队列上"。
- `RunView.vue`：弹牌音 `playSfx(bad ? 'battle.cardAdded.bad' : 'battle.cardAdded.normal')`（`cardAdded` 仍由这里触发，队列和 `useSfxEvents` 都不映射它）。
- `ShopView.vue` 的 `poor()` 里 `playSfx('run.shop.poor')`。

- [ ] **Step 1: 写失败测试** `src/data/sfxMap.test.ts`（node 下，用 `node:fs` 读目录），断言：`sfxMap` 的每个键都在 `SLOT_KEYS`；每个被引用的文件都存在于 `src/assets/sfx/`；上表中的每个槽位 `slotStatus` 都是 `configured`；`slotStatus(sfxMap, 'battle.enemy.split')` 为 `configured`。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现** `sfxMap.ts` 初始配置、`useSfx.ts` 改造（文件名到 URL 用 `import.meta.glob('../assets/sfx/*.{ogg,mp3,wav}', ...)` 以文件名为键；播放时按 `shouldPlay` 做槽位节流；`silent` / 缺失文件静默返回；草稿覆盖优先于已保存配置）、`useFx.ts` 队列侧触发与 `setFxCards`、上面所有触发点改动。
- [ ] **Step 4: 运行确认通过** `pnpm vitest run` 与 `pnpm typecheck`，预期全部通过。
- [ ] **Step 5: 提交** `refactor: 音效改为槽位键触发，战斗音效挂在演出队列`

### Task 4: 保存接口（开发服务器插件）

**Files:**
- Create: `tools/sfxEditorCore.ts`、`tools/sfxEditorPlugin.ts`
- Modify: `vite.config.ts`（加入 `sfxEditorPlugin()`）、`vitest.config.ts`（`include` 加 `'tools/**/*.test.ts'`）
- Test: `tools/sfxEditorCore.test.ts`

**Interfaces:**
- Consumes: `SfxMap`/`SlotConfig`（Task 2）、`SLOT_KEYS`（Task 1）。
- Produces（`sfxEditorCore.ts`，纯函数）：
  - `export interface ImportFile { name: string; dataBase64: string }`
  - `export interface SaveBody { map: SfxMap; imports: ImportFile[] }`
  - `export function safeFileName(raw: string): string` —— 去掉路径与扩展名之外的非法字符（只留字母、数字、`-`、`_`），保留小写扩展名 `.ogg/.mp3/.wav`；扩展名不合法则抛 `Error`。
  - `export function uniqueName(name: string, taken: Set<string>): string` —— 重名时在扩展名前加 `-2`、`-3`……
  - `export function validateSave(body: SaveBody, existingFiles: string[]): void` —— 槽位键不在 `SLOT_KEYS`、`files` 里有含 `/` `\` `..` 的名字、引用的文件既不在磁盘也不在 `imports` 里、`volume` 不在 0~3、`maxSeconds` 非正数，任何一项都抛 `Error`（带中文原因）。
  - `export function renderSfxMap(map: SfxMap): string` —— 生成 `src/data/sfxMap.ts` 的完整源码（键按字母序，格式固定，便于 diff）。
- `sfxEditorPlugin.ts`：`apply: 'serve'`，`POST /__dev/sfx`；非 POST → 405；缺请求头 `x-sfx-editor: 1` → 403；校验通过后：把 `imports` 写入 `src/assets/sfx/`（用 `uniqueName` 避免覆盖；本机 PATH 上有 `ffmpeg` 时先压成单声道 48 kbps ogg 并把扩展名改为 `.ogg`），把响应里的重命名映射一并返回（`{ ok: true, renamed: Record<string,string> }`），再写 `sfxMap.ts`；失败返回 400 与 `{ ok: false, error }`，且**不写任何文件**（先全部校验再落盘）。

- [ ] **Step 1: 写失败测试** `tools/sfxEditorCore.test.ts`：
  - `safeFileName('../hack!.OGG')` 的结果只含字母数字 `-` `_` 与 `.ogg`，且不含 `/`、`..`；`safeFileName('a.exe')` 抛错。
  - `uniqueName('coin.ogg', new Set(['coin.ogg']))` 为 `coin-2.ogg`；再占用后得 `coin-3.ogg`。
  - `validateSave`：未知槽位键抛错；`files: ['../x.ogg']` 抛错；引用不存在的文件抛错；引用在 `imports` 里的新文件通过；`volume: 9` 抛错。
  - `renderSfxMap`：输出里键按字母序；`renderSfxMap({})` 能被当作合法 TS 的 `export const sfxMap: SfxMap = {}`；对一个带 `synth`、`silent`、`maxSeconds` 的配置，输出字符串再被解析回来与输入一致（用 `new Function` 或 `import()` 解析输出里的对象字面量）。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现** `sfxEditorCore.ts` 与插件（参照 `tools/cardEditorPlugin.ts` 的请求处理与请求头校验）。
- [ ] **Step 4: 运行确认通过** `pnpm vitest run tools`
- [ ] **Step 5: 提交** `feat: 音效编辑保存接口`

### Task 5: 面板外壳（清单、状态、选文件、试听、保存）

**Files:**
- Create: `src/ui/SfxEditorView.vue`
- Modify: `src/App.vue`（紧邻"卡牌编辑"按钮加一个"🔊 音效编辑"开发入口，同样用 `import.meta.env.DEV` + `defineAsyncComponent`）

**Interfaces:**
- Consumes: `SFX_SLOTS`、`sfxMap`、`slotStatus`、`sfxLibrary`、`sfxUrl`、`setSfxDraft`、`playSfx`；Task 4 的 `POST /__dev/sfx`；Task 6 的 `SfxScene`（本任务先用空占位插槽）。

面板行为（参照 `CardEditorView.vue` 的布局与未保存提示做法）：
- 左侧按分组列出所有槽位，每项显示状态点：已配 / 未配（红点，且未配的排在组内前面）/ 静音；顶部有"只看未配"开关和搜索框。
- 右侧：场景区（Task 6 填充）、当前槽位的文件列表（可增删、排序无要求）、音效库（可单个试听）、导入按钮（选 ogg/mp3/wav，读成 base64 暂存，保存前不写盘）、`volume` 与 `maxSeconds` 输入、"设为静音"开关、"恢复合成音"（仅分裂槽位）。
- 草稿：面板内部维护 `SfxMap` 副本；每次改动调用 `setSfxDraft(draft)`，关闭面板或放弃时 `setSfxDraft(null)`；有未保存改动的槽位有标记，关闭时提示。
- 保存：`fetch('/__dev/sfx', { method: 'POST', headers: { 'x-sfx-editor': '1' }, body: JSON.stringify({ map: draft, imports }) })`；成功后用返回的 `renamed` 修正草稿里的文件名，并清空待导入；失败显示服务器返回的中文错误。

- [ ] **Step 1: 手动验证清单（无单元测试，纯 UI）** 写在任务描述里留给执行者：`pnpm dev` 打开，开始界面出现入口；列表含 Task 1 的全部槽位；初始状态与 Task 3 的迁移表一致；选一个槽位换文件后 `playSfx` 试听的是新文件；保存后刷新页面仍是新文件。
- [ ] **Step 2: 实现** 面板与入口。
- [ ] **Step 3: 运行** `pnpm typecheck` 与 `pnpm lint`，预期无新增错误。
- [ ] **Step 4: 提交** `feat: 音效编辑面板外壳`

### Task 6: 场景复现

**Files:**
- Create: `src/ui/sfxScenes.ts`、`src/ui/SfxScene.vue`
- Modify: `src/ui/SfxEditorView.vue`（把 `SfxScene` 放进场景区，并加"重播"按钮）
- Test: `src/ui/sfxScenes.test.ts`

**Interfaces:**
- Consumes: `setupScenario`（`@/testing/cardHarness`）、`dispatch`/`createBattle`（`@/engine/battle`）、`pushFx`/`resetFx`（`@/composables/useFx`）、`createRun`（`@/engine/run`）、`SFX_SLOTS`。
- Produces：
  - `export type Scene = { kind: 'battle'; build: () => { state: BattleState; events: GameEvent[] } } | { kind: 'run'; component: 'hud-gold' | 'relic-reveal' | 'card-add' | 'shop' | 'none' }`
  - `export function sceneFor(slot: string): Scene`
  - `SfxScene.vue` 的 props：`{ slot: string; replayKey: number }`，`replayKey` 变化时重播。

要点：
- **战斗类槽位**：用 `setupScenario` 构造预设状态，再用真实 `dispatch` 产生事件，不手写事件（保证事件序列真实）；`SfxScene` 挂只读 `BattleView`（`readonly`），重播时先 `resetFx()` 再把状态设回起点并 `pushFx(events)`。每个战斗类槽位至少要能触发该槽位对应的事件（例如史莱姆分裂：一只带 `split` 状态、血量低于阈值的史莱姆，让一次玩家出牌后触发 `enemySplit`；毒伤：给敌人上毒再 `endTurn`；敌人逃跑、偷金币用对应敌人）。无法用现有卡牌 / 敌人真实触发的事件，退而在预设状态上直接 `pushFx` 一个手写事件，并在 `sceneFor` 注释里写明。
- **战斗外槽位**：挂真实组件——`run.gold.gain|spend` 用 `RunHud`，重播时改变 `gold` prop；`run.forge.upgrade`、`run.enchant`、`run.relic.gained` 用 `RelicReveal`，重播时 `pushFx([...], false)` 发对应的 `cardsUpgraded` / `relicGained` 事件；`battle.cardAdded.*` 用 `CardAddFx`（或承载它的最小 `RunView`）；`run.shop.poor` 用 `ShopView` 配 `createRun` 造的一份商店状态，重播时触发一次买不起；`run.hpLost` 用 `HurtFx`。
- 独立状态：所有场景状态都是临时构造的，不读 `useRun` 的单例，也不写存档。
- 挂载多个战斗界面会共用 `useFx` 的全局队列：`SfxScene` 同一时刻只挂一个场景，切换槽位 / 重播时必须 `resetFx()`。

- [ ] **Step 1: 写失败测试** `sfxScenes.test.ts`：
  - 对 `SFX_SLOTS` 的每个槽位，`sceneFor(slot)` 都返回场景（没有抛错）。
  - 对每个 `kind: 'battle'` 的场景，`build()` 得到的 `events` 非空，且 `events.flatMap(e => sfxSlotsForEvent(e, undefined, state.cards))` 在映射规则上**包含该槽位的键**（用 `prev` 为 `undefined` 的调用会漏掉依赖前一事件的成因，所以对毒伤 / 触发伤害的槽位改用 `events` 里相邻事件作 `prev` 来计算）。
  - 对每个 `kind: 'run'` 的场景，`component` 不是 `'none'`；清单里允许为 `'none'` 的槽位白名单要在测试里写明并说明原因。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现** `sfxScenes.ts`、`SfxScene.vue`，并把它接进面板。
- [ ] **Step 4: 运行确认通过** `pnpm vitest run src/ui/sfxScenes.test.ts`，再 `pnpm typecheck`。
- [ ] **Step 5: 手动验证（留给执行者）** `pnpm dev`：逐个点开槽位，动画和真实游戏一致；选新音效点"重播"，动画与新音效一起放；史莱姆分裂槽位在清空文件后回到合成音。
- [ ] **Step 6: 提交** `feat: 音效面板场景复现`

---

## Self-Review

- **规格覆盖：** 槽位清单（Task 1）、配置表与迁移（Task 3）、导入 / 保存 / 校验 / 安全（Task 4）、面板与状态三态 / 草稿 / 入口（Task 5）、场景复现（Task 6）、合成分裂音（Task 3）、节流按槽位（Task 2、3）、`maxSeconds` / `volume` 进配置（Task 2、3）、不加 ffmpeg 依赖（Task 4）、生产构建不含面板（Task 5 入口 + Task 4 `apply: 'serve'`）均已对应。
- **风险核实项：** 战斗外场景用的 `RelicReveal`、`CardAddFx`、`ShopView`、`RunHud` 都是通过 props 取状态的组件，不依赖 `useRun` 单例，所以不需要先改造 `useRun`；但它们依赖 `useFx` 的全局 `fxBatch`，由 Task 6 的"一次只挂一个场景 + `resetFx()`"规避。
- **类型一致性：** `SlotConfig` / `SfxMap` / `SlotStatus` 由 Task 2 定义，Task 3、4、5 引用同名；`playSfx(slot, opts)` 与 `setSfxDraft` 由 Task 3 定义，Task 5 引用；`sceneFor` 由 Task 6 定义。
