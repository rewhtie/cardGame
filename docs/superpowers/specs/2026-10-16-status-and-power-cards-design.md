# 状态系统与能力牌设计

日期：2026-10-16

## 目标

1. 玩家和敌人都有通用状态表，增益牌和减益牌可以给任意一方上状态。
2. 新增能力牌：打出后不进任何牌堆，效果持续整场战斗。
3. 卡池的 `Card` 构建器能写出这些牌，卡面文字仍由效果自动生成。

## 不变量

- 现有行为保持不变：易伤 +50%、圆盾遗物、附魔成长。
- 同一个种子的战斗结果不变。状态钩子均为纯函数，不使用随机数。

## 1. 状态模型

### 数据

- `PlayerState` 与 `EnemyState` 各增加 `statuses: Record<string, number>`，值为层数，缺省视为 0。
- 删除 `EnemyState.vulnerable`，迁入状态表。易伤仍在敌人行动时 -1，受到伤害 ×1.5。
- 圆盾遗物改为给敌人加 `vulnerable` 状态。
- 测试中直接读取 `enemy.vulnerable` 的地方同步改为读取状态表。

### 状态定义

新文件 `src/engine/statuses.ts`，一张注册表，每项包含：

- `id`、`name`、`icon`、`text`、`kind`（`buff` 或 `debuff`）
- `decay`：`'none'` 层数永久；`'tick'` 每个所有者回合 -1，减到 0 移除
- 可选钩子：`modifyDamageDealt`、`modifyDamageTaken`、`modifyBlock`、`onTurnStart`、`onTurnEnd`、`onDamaged`

### 第一批状态

| 状态 | 类型 | 衰减 | 效果 |
|---|---|---|---|
| strength 力量 | buff | none | 造成的攻击伤害 +N |
| dexterity 敏捷 | buff | none | 获得的格挡 +N |
| vulnerable 易伤 | debuff | tick | 受到伤害 ×1.5 |
| weak 虚弱 | debuff | tick | 造成伤害 ×0.75 |
| poison 中毒 | debuff | tick | 所有者回合开始失去 N 点生命 |
| regen 再生 | buff | tick | 所有者回合结束恢复 N 点生命 |
| thorns 荆棘 | buff | none | 被攻击时对攻击者造成 N 点伤害 |
| metallicize 钢铁之躯 | buff | none | 所有者回合结束获得 N 点格挡 |

### 结算顺序

先加算（力量），再乘算（虚弱、易伤），最后向下取整。取整只在最后一步，与现有 `Math.floor(amount * 1.5)` 一致。遍历状态按注册表声明顺序，不按插入顺序。

## 2. 效果、卡牌种类、能力牌流转

### 效果

- 新增 `{ type: 'applyStatus', status, stacks, to: 'self' | 'target' | 'allEnemies' }`。
- 新增 `{ type: 'heal', amount }`。
- 附魔 `bumpEffect`：`applyStatus` 层数 +1，`heal` 数值 +1。
- `applyStatus` 本批不支持 `perX`。

### 卡牌种类

- `CardDef` 增加 `kind: 'attack' | 'skill' | 'power'` 与 `exhaust?: boolean`。
- 旧卡的 `kind` 由 `target` 推出：`enemy` 为 attack，其余为 skill。`Card` 构建器自动设置。
- power 牌的 `target` 固定为 `self`。

### 打出后去向

| 种类 | 去向 |
|---|---|
| attack、skill | 弃牌堆 |
| 带 exhaust | 消耗牌堆 |
| power | 从手牌移除，不进任何牌堆 |

能力牌没有独立触发器，它只是给玩家加一个永久状态。持续效果与状态是同一套机制。

## 3. 触发时机

在 `battle.ts` 中按固定顺序调用：

1. 玩家回合开始：清格挡，触发玩家状态 `onTurnStart`，然后抽牌。玩家死亡则立即结束战斗。
2. 玩家回合结束：弃手牌，触发玩家状态 `onTurnEnd`，再对 `tick` 状态 -1。
3. 敌人行动：每个存活敌人依次执行清格挡、`onTurnStart`（死亡则跳过）、意图、`onTurnEnd`、衰减。
4. 受击：`applyDamage` 造成伤害后调用受击方 `onDamaged`。荆棘反伤不再触发荆棘，避免无限反弹。

## 4. 敌人意图

- `Intent` 增加 `{ type: 'debuff', status, stacks }`（给玩家）与 `{ type: 'buff', status, stacks }`（给自己）。
- 界面上攻击意图按敌人当前力量、虚弱显示最终伤害。
- 先给史莱姆加一个虚弱意图验证整条链路，其他敌人不变。

## 5. 事件

新增 `statusApplied`、`statusRemoved`、`healed`、`statusTriggered`，带目标与层数。

## 6. 卡池构建器

`Card` 增加 `.power()`、`.exhaust()`、`.applyStatus(status, stacks, to)`、`.heal(amount)`。卡面文字由效果自动生成，并补充对应的文案模板。

## 7. 界面

- 玩家与每只敌人的血条旁显示状态图标，右下角显示层数，悬浮显示名称和说明。增益与减益用不同边框颜色。
- `CardView` 为能力牌和消耗牌显示小标记。
- 能力牌打出后只靠状态图标体现，不单独占界面位置。

## 8. 测试

- 新增 `statuses.test.ts`：修正顺序、衰减、荆棘不无限反弹、能力牌流转、同种子结果不变。
- 更新 `battle.test.ts`、`run.test.ts` 中读取 `vulnerable` 的断言。
- 实施阶段只编写测试，不运行（按用户要求）。

## 非目标

- `applyStatus` 的 `perX`。
- 事件总线式的订阅机制。
- 能力牌在界面上的独立展示区。
