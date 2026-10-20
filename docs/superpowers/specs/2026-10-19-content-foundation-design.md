# 内容地基：目录结构与链式构建器 设计

日期：2026-10-19

## 目的

接下来要陆续设计敌人、精英、Boss、职业、随机事件、药水。现在这些内容有的是手写的大数组
（`enemies.ts`、`events.ts`），有的展示信息和战斗效果拆在两处（药水：`data/items.ts` + `engine/potions.ts`）。
内容一多就会重复、易错、难查重。

目标：把 `Card` / `CardPool`（`src/data/cards/card.ts`）已经验证过的做法推广到所有内容类型——
**链式构建器 + 集中注册的 Pool + `build()` 产出引擎使用的纯对象**，并定好统一的目录结构。

## 目标

- 敌人、事件、药水、职业各有一个链式构建器，写法与 `Card` 一致。
- 每类内容有自己的 Pool：集中注册、重复 id 报错、派生出引擎需要的表。
- 统一目录结构，新增一类内容时照搬。
- 复杂随机/行动逻辑放在"行为类"里，注册处只写纯数据，用名字引用行为。
- 现有内容（史莱姆、孢子史莱姆、三只史莱姆、16 个事件、3 种药水）迁移到新写法，行为不变。

## 非目标

- 不新增任何具体的敌人、精英、Boss、职业、药水、事件内容（只迁移现有的）。
- 不做职业对战斗的实际影响之外的系统（职业只先定义数据形状，见下）。
- 不改界面样式。

## 反目标（出现就算失败）

- 引擎状态里出现类实例：构建器和行为类只在定义阶段使用，`build()` 出的必须是可序列化的纯对象。
- 任何敌人行为里使用 `Math.random`：所有随机必须来自战斗传入的带种子随机流，同种子必须可重放。
- 迁移后现有测试（`battle.test.ts` / `run.test.ts` / `autoRun.test.ts` 等）结果变化，
  或相同种子下的战斗过程与迁移前不同。

## 已确定的决定（用户确认）

1. 所有内容都用链式构建器，写法对齐 `Card`。
2. 敌人注册只写最简单的静态信息：id、名字、血量、类型、行为名；
   没写行为的敌人，默认按链式写出的意图依次循环。
3. 每个有复杂行动池的敌人之后有自己的行为类，行为类按名字注册到行为注册表；
   敌人定义里只存行为名（字符串）。
4. 所有随机/复杂逻辑都遵守同一规则：注册处只放纯数据，逻辑放到按名字引用的类里。
   这也适用于药水、事件、职业。
5. 本轮只做地基，不加新内容。

## 设计

### 目录结构

```
src/data/
  pool.ts            通用 Pool 基类：add（查重）、entries、按 id 取
  cards/             （已有）card.ts、attacks.ts、…、index.ts
  enemies/
    enemy.ts         Enemy 构建器
    behaviors/
      behavior.ts    Behavior 接口与行为注册表
      cycle.ts       默认行为：按意图列表循环
    normal.ts elites.ts bosses.ts   各自导出 Enemy[]（本轮只有 normal.ts）
    encounters.ts    Encounter 构建器：敌人组合（如三只史莱姆）
    index.ts         建 Pool，导出 enemies 表、遭遇表
  events/
    event.ts         Event 构建器（含 option 子构建器）
    <类别>.ts        按类别分文件（删除/升级/遗物/…）
    index.ts
  potions/
    potion.ts        Potion 构建器
    index.ts
  classes/
    class.ts         Class 构建器
    index.ts
  relics/            本轮不动；与药水同样的拆分问题记入后续待办
```

每个 `index.ts` 的模式与 `cards/index.ts` 相同：建 Pool，导出引擎需要的表。
旧路径 `@/data/enemies` 保持可导入（`enemies/index.ts` 继续导出 `slime`、`slimeGroup` 等），
避免一次改动所有引用。

### Pool 基类

`Pool<T extends { id: string }>`：`add` 重复 id 抛错；`all()` 保持注册顺序
（顺序影响种子结果，必须稳定）；`byId()`。`CardPool` 继承它，保留自己的 `defs/rewardIds/starterDeck`。

### Enemy 构建器

```ts
Enemy.normal('slime', '史莱姆').hp(40)
  .attack(8).defend(6).attack(12)        // 默认循环意图
Enemy.elite(...) / Enemy.boss(...)       // 类型
  .behavior('someBehavior')              // 指定行为类；与意图链互斥
  .offset(1)                             // 循环起点错开（取代手写 rotate）
```

`build()` 产出 `EnemyDef`：`{ id, name, maxHp, kind, intents, behavior? , offset? }`。
`kind`：`'normal' | 'elite' | 'boss'`。

### 行为（Behavior）

```ts
interface Behavior {
  /** 决定下一个意图；rng 是战斗的带种子随机流 */
  next(ctx: { turn; self; player; enemies; last?: Intent; rng }): Intent
}
```

- 行为注册表：`name -> Behavior`；引擎按 `def.behavior` 取，缺省用 `cycle`。
- 引擎在**敌人行动结束时**（以及战斗开始时）调用 `next`，把结果存进 `EnemyState.intent`，
  界面读 `EnemyState.intent` 显示意图预告。随机数只在这时消耗，因此预告与实际行动一致，且可重放。
- `cycle` 行为用 `intentIndex` 保持现有语义：`intents[(offset + 回合数) % n]`。
  战斗中 `intentIndex` 仍然存在以保证旧测试通过。
- 本轮不写任何自定义行为，只落地接口、注册表和 `cycle`，并用一个测试用行为验证"随机来自带种子随机流、同种子可重放"。

### Encounter 构建器

`Encounter.of('slimeGroup').normal().floors(1, 5).enemy('slime').enemy('slime').offset(...)`：
敌人组合 + 类型 + 楼层范围，供之后按楼层和战斗类型抽取。本轮只迁移三只史莱姆并保持
`slimeGroup` 导出不变。

### Event 构建器

选项子构建器：`pay({hp, gold})`、`needs(fn)`、`removeCard()`、`upgradeCard()`、`upgradeRandom(n)`、
`addCard(id)`、`gold(n)`、`hp(n)`、`maxHp(n)`、`relic()`、`potion(n)`、`chance(p, win, lose)`、`battle(kind, bonus)`、`leave()`。
选项文案默认由 cost 和 outcomes 自动生成（与卡面文字同理），特殊文案用 `.label()` 覆盖。
事件级：`icon`、`text`、`weight`、`requires`。
迁移时必须逐个核对：生成的文案与现有手写文案一致，否则用 `.label()` 保留原文案。
`build()` 产出现有 `EventDef`（`engine/event.ts`），引擎不变。

### Potion 构建器

把 `data/items.ts` 里药水的展示信息与 `engine/potions.ts` 的 `PotionRule` 合并成一处：
`Potion.new('healPotion','治疗药水').icon('🧪').drink().heal(20)`；投掷类 `.throw().damage(20)`。
药水说明文字由 effects 自动生成。`PotionPool` 派生出 `POTION_RULES` 与展示表，
旧导出（`potions` 展示表、`POTION_RULES`）保持可用。

### Class（职业）构建器

只定数据形状与注册：id、名字、图标、最大生命、起始遗物、起始牌组（引用卡牌 id + 张数）、
起始药水栏位、描述。本轮定义一个与现有默认开局完全等价的职业用于验证，
不改变现有开局流程的行为（接入开局选择界面留给职业设计时做）。

## 测试

- 每个构建器：`build()` 产出的纯对象正确；Pool 重复 id 报错。
- 迁移等价：史莱姆/孢子史莱姆/三只史莱姆与迁移前深度相等；16 个事件的 `build()` 结果与迁移前深度相等
  （迁移前先把旧数组快照成测试夹具）；药水规则与展示表与迁移前相等。
- 行为：`cycle` 与 `offset`；测试用随机行为在相同种子下序列一致、不同种子下不同。
- 现有全部测试保持通过。

## 留给实现者决定

- `Pool` 与 `CardPool` 的具体继承方式；`EnemyState.intent` 具体字段名。
- 事件选项文案生成的措辞细节（只要迁移后文案与现有一致）。
- Encounter 楼层范围的数据形状。

## 后续（不在本轮）

- 遗物同样存在展示/规则拆分（`data/items.ts` 与 `engine/relics.ts`），之后用同样的做法迁移。
- 具体的敌人/精英/Boss 行为类、职业内容、更多药水与事件。
