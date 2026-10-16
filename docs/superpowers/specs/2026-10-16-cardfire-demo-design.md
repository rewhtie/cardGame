# CardFire 最简 Demo 设计

## 目标与成功标准

用 Vue 3 + TypeScript + Tauri + UnoCSS 做杀戮尖塔类卡牌游戏。本阶段只做一场战斗的最简 demo，重点是打好工程化基础。

完成标准：
1. `pnpm tauri dev` 打开桌面窗口，能玩完一场战斗（胜或负）。
2. `pnpm lint`、`pnpm typecheck`、`pnpm test` 全部通过。
3. 提交时 husky + lint-staged 自动检查。
4. 引擎目录不依赖 Vue / Tauri，由 ESLint 规则强制。

不做：地图、遗物、商店、存档、动画、音频、Steam 集成、CI、多平台打包。

## 架构：命令进，事件出

纯 TS 引擎：`dispatch(state, action) -> { state, events }`。状态不可变。Vue 只派发 Action 并渲染 State；事件列表暂不消费，留作后续动画接入点。

```
cardFire/
├─ src/
│  ├─ engine/    types.ts rng.ts effects.ts battle.ts *.test.ts
│  ├─ data/      cards.ts enemies.ts
│  ├─ ui/        Battle / Hand / Card / EnemyView / EnergyOrb (.vue)
│  ├─ composables/useBattle.ts   # shallowRef 持有状态，调用 dispatch
│  ├─ App.vue  main.ts
├─ src-tauri/    # Rust 壳，不写业务逻辑
├─ uno.config.ts vite.config.ts vitest.config.ts
├─ eslint.config.js .prettierrc .husky/ tsconfig*.json
```

约定：路径别名 `@/` -> `src/`；卡牌与敌人是数据，卡牌由 `Effect[]` 组成，引擎解释效果。

## 数据模型

```ts
type Effect =
  | { type: 'damage'; amount: number }
  | { type: 'block'; amount: number }
  | { type: 'draw'; count: number }
  | { type: 'gainEnergy'; amount: number }

interface CardDef { id: string; name: string; cost: number; target: 'enemy' | 'self'; effects: Effect[]; text: string }
type Intent = { type: 'attack'; damage: number } | { type: 'defend'; block: number }
interface EnemyDef { id: string; name: string; maxHp: number; intents: Intent[] }

interface BattleState {
  turn: number
  phase: 'player' | 'enemy' | 'won' | 'lost'
  player: { hp: number; maxHp: number; block: number; energy: number; maxEnergy: number }
  enemy: { def: EnemyDef; hp: number; block: number; intentIndex: number }
  drawPile: string[]; hand: string[]; discardPile: string[]  // 卡 id
  rngState: number
}
type Action = { type: 'playCard'; handIndex: number } | { type: 'endTurn' }
```

`GameEvent` 为带数据的联合类型：cardPlayed、damageDealt、blockGained、cardDrawn、turnStarted、enemyActed、battleEnded、invalidAction。

## 战斗规则

- 玩家 80 血，每回合 3 能量，每回合抽 5 张。
- 回合开始：玩家格挡清零，抽牌；牌堆空时用带种子 PRNG 把弃牌堆洗回牌堆。
- 出牌：校验阶段、能量、手牌索引；扣能量，依次结算效果，牌进弃牌堆。
- 回合结束：弃掉全部手牌；敌人执行当前意图（敌人格挡在其行动前清零）；意图索引循环前进；开始新回合。
- 伤害先扣格挡再扣血。敌人血量为 0 判胜，玩家血量为 0 判负；胜负后拒绝所有操作。
- 非法操作返回原状态和 `invalidAction` 事件，不抛异常。
- 内容：初始牌组 打击×5（1 费，6 伤害）、防御×4（1 费，5 格挡）、疾跑×1（0 费，抽 2 张）。敌人史莱姆 40 血，意图循环 攻击 8 -> 防御 6 -> 攻击 12。

## 工程化工具链

- 包管理：pnpm。构建：Vite。TypeScript 开启 strict。
- 样式：UnoCSS（`presetUno`），卡牌等常用组合写成 shortcuts。
- 代码质量：ESLint flat config（typescript-eslint + eslint-plugin-vue）+ Prettier。`src/engine/**` 通过 `no-restricted-imports` 禁止 import `vue` 和 `@tauri-apps/*`。
- 测试：Vitest，覆盖引擎。
- 提交钩子：husky + lint-staged，提交时对暂存文件跑 ESLint 和 Prettier。
- 脚本：`dev`、`build`、`tauri`、`lint`、`format`、`typecheck`、`test`。
- Tauri：v2，使用官方脚手架生成 `src-tauri`；窗口 1280x720，标题 CardFire；应用标识 `com.cardfire.app`。依赖版本以安装时的最新稳定版为准。

## 测试策略

引擎单元测试：伤害与格挡结算、能量不足拒绝、手牌索引非法拒绝、洗牌同种子可复现、回合流转与敌人意图循环、胜负判定及结束后拒绝操作。UI 不写自动化测试，用 `pnpm tauri dev` 手动验证一场完整战斗。

## 风险

- Windows 需要 WebView2 运行时（Win10 通常已有）；首次 Rust 编译较慢。
- 项目为独立 git 仓库（已在 cardFire 内 `git init`），不要与上层 `D:/` 仓库混用。
