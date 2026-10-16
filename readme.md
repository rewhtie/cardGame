# CardFire

Vue 3 + TypeScript + Tauri 2 + UnoCSS 的杀戮尖塔类卡牌游戏（最简 demo）。

## 开发

```bash
pnpm install
pnpm tauri icon <1024x1024.png>   # 首次：生成 src-tauri/icons
pnpm tauri dev                    # 桌面窗口运行
pnpm dev                          # 仅浏览器运行
```

## 常用脚本

| 命令               | 说明                |
| ------------------ | ------------------- |
| `pnpm test`        | Vitest 引擎单元测试 |
| `pnpm lint`        | ESLint              |
| `pnpm typecheck`   | vue-tsc 类型检查    |
| `pnpm format`      | Prettier            |
| `pnpm tauri build` | 打包桌面应用        |

## 结构

- `src/engine`：纯 TS 引擎，禁止依赖 Vue / Tauri（ESLint 强制）
  - `battle.ts`：战斗，`dispatch(state, action) -> { state, events }`
  - `map.ts`：按种子生成地图（15 层 + Boss，2–4 条路径）
  - `run.ts`：一局流程（选节点、战斗、休息、结算），`dispatchRun`
  - `seed.ts`：种子工具，`deriveSeed(seed, label)` 派生互不干扰的随机流
- `src/data`：卡牌与敌人数据
- `src/ui`、`src/composables`：Vue 界面与桥接层
- `src-tauri`：Tauri 壳

## 种子

开始游戏时可输入种子，留空则随机生成。同一个种子得到相同的地图与战斗；游戏内左上角可复制种子分享。

目前可玩：战斗、精英、Boss、休息。商店、事件、宝箱为占位房间。

设计文档见 `docs/superpowers/specs/`。
