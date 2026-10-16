# 地图与一局流程（Run）设计

## 目标

在最简战斗 demo 之上，加入杀戮尖塔式的路线地图与"一局游戏"流程。地图由种子生成，种子可分享，相同种子得到相同的一局。

本阶段不做：商店、事件、宝箱的内容（只占位）、多种敌人（全部用史莱姆）、牌组成长、存档。

## 种子（`engine/seed.ts`）

- 种子是字符串。不输入则随机生成 8 位短码，字符集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（去掉易混淆字符）。
- 输入的种子会 trim 并转大写，所以不区分大小写。
- 用 FNV-1a 把字符串哈希成 uint32；用 `deriveSeed(seed, label)` 派生独立随机流：地图用 `map`，每场战斗用 `battle:<节点id>`。打牌不影响地图。
- 界面上显示种子并提供复制按钮；开始界面可输入种子，留空则随机。

## 地图（`engine/map.ts`，纯 TS）

```ts
type NodeType = 'monster' | 'elite' | 'rest' | 'shop' | 'event' | 'treasure' | 'boss'
interface MapNode { id: string; floor: number; col: number; type: NodeType; next: string[] }
interface GameMap { seed: string; floors: MapNode[][]; boss: MapNode }
```

生成（路径法）：
- 15 层（索引 0–14），7 列，Boss 单独在最上方（id `boss`）。
- 路径数为 2–4 的随机数，因此每层最多 4 个节点。各路径起点至少分布在 2 个不同的列。
- 每步从上一个节点走到下一层的同列或左右相邻列；若会与已有连线交叉（`c -> c+1` 与 `c+1 -> c`）则排除。多条路径可以合并。
- 第 14 层所有节点连向 Boss。
- 类型分配：
  - 唯一的固定层：第 14 层全部为休息（火堆）。
  - 其余按权重：普通战斗 45、事件 22、休息 12、精英 8、商店 5、宝箱 4。
  - 最小楼层：精英 ≥ 5，休息 ≥ 5，商店 ≥ 3，宝箱 ≥ 3；第 13 层不放休息。
  - 精英、休息、商店的类型不能与任一父节点相同。
  - 同一父节点的子节点类型尽量互不相同（无法满足时放宽）。
  - 候选为空时回退为普通战斗。

## 一局流程（`engine/run.ts`，纯 TS）

```ts
type RunScreen = 'map' | 'battle' | 'rest' | 'placeholder' | 'victory' | 'defeat'
interface RunState {
  seed: string; map: GameMap; current: string | null; visited: string[]
  player: { hp: number; maxHp: number }
  screen: RunScreen; battle: BattleState | null
  content: { cards; deck; enemy }   // 由调用方注入，引擎不依赖 data 目录
}
type RunAction =
  | { type: 'chooseNode'; id: string }
  | { type: 'battle'; action: Action }
  | { type: 'continue' }   // 战斗结束后继续
  | { type: 'rest' }       // 休息：回复 30% 最大血量
  | { type: 'leave' }      // 离开休息点 / 占位房间
```

规则：
- `chooseNode` 仅在地图界面有效：尚未出发时可选第 0 层任意节点，之后只能选当前节点的 `next`。战斗、精英、Boss 创建战斗（种子由 `deriveSeed` 得到，继承当前血量），休息进入休息界面，商店、事件、宝箱进入占位界面。
- 战斗胜利后停留在战斗界面，`continue` 时同步血量；若当前是 Boss 则进入 `victory`，否则回到地图。战败时 `continue` 进入 `defeat`。
- 非法操作返回原状态和 `invalidAction` 事件，不抛异常。
- 引擎改动：`BattleConfig` 增加可选的 `playerHp`。

## 界面

- `StartView`：种子输入、开始按钮。
- `MapView`：SVG 绘制 16 行节点与连线，可选节点高亮，已走过的变暗，每种类型一个图标。
- `RunView`：按 `screen` 切换地图、战斗、休息、占位、结算。
- `RunHud`：血量与种子（含复制）。
- `BattleView` 改为受控组件（接收状态、抛出操作），移除 `useBattle`。
- 结算界面提供"返回主菜单"和"同种子重来"。

## 测试

- 种子：哈希稳定，派生流互不相同，`generateSeed` 格式正确。
- 地图（批量 200 个种子）：确定性；每层 1–4 个节点；首层至少 2 个节点；无死路、无孤儿；连线不交叉；类型规则全部成立。
- 流程：只能选后继节点；血量继承；休息回血；占位通过；战败；通关；相同种子相同战斗初始手牌。
