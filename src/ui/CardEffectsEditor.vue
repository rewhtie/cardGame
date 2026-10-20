<script setup lang="ts">
import { STATUSES } from '@/engine/statuses'
import type { Effect } from '@/engine/types'

/** 效果列表编辑器：直接就地修改传入的效果数组 */
const effects = defineModel<Effect[]>({ required: true })

const EFFECT_TYPES: { value: Effect['type']; label: string }[] = [
  { value: 'damage', label: '⚔️ 造成伤害' },
  { value: 'block', label: '🛡️ 获得格挡' },
  { value: 'draw', label: '🃏 抽牌' },
  { value: 'gainEnergy', label: '⚡ 获得能量' },
  { value: 'applyStatus', label: '✨ 施加状态 / buff' },
  { value: 'heal', label: '💚 回复生命' },
  { value: 'loseHp', label: '💔 失去生命' },
  { value: 'addWound', label: '🩹 置入伤口' },
  { value: 'exhaustWounds', label: '🔥 消耗伤口' },
]
const GAINS = [
  { value: 'block', label: '格挡' },
  { value: 'gash', label: '裂伤（目标敌人）' },
  { value: 'gashAll', label: '裂伤（全体敌人）' },
  { value: 'draw', label: '抽牌' },
]

function newEffect(type: Effect['type']): Effect {
  switch (type) {
    case 'damage':
    case 'block':
    case 'gainEnergy':
    case 'heal':
    case 'loseHp':
      return { type, amount: 1 }
    case 'draw':
      return { type, count: 1 }
    case 'applyStatus':
      return { type, status: 'strength', stacks: 1, to: 'self' }
    case 'addWound':
      return { type, count: 1 }
    case 'exhaustWounds':
      return { type, from: 'hand', gain: 'block', per: 1 }
  }
}

const setType = (i: number, e: Event) => {
  effects.value[i] = newEffect((e.target as HTMLSelectElement).value as Effect['type'])
}
const add = () => effects.value.push(newEffect('damage'))
const remove = (i: number) => effects.value.splice(i, 1)
const move = (i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= effects.value.length) return
  const list = effects.value
  ;[list[i], list[j]] = [list[j]!, list[i]!]
}
</script>

<template>
  <div class="fx">
    <div v-if="!effects.length" class="fx-empty">暂无效果，点击下方按钮添加</div>

    <div v-for="(eff, i) in effects" :key="i" class="fx-row">
      <span class="fx-index">{{ i + 1 }}</span>

      <select :value="eff.type" class="fx-ctl fx-type" @change="setType(i, $event)">
        <option v-for="t in EFFECT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>

      <label v-if="eff.type === 'draw' || eff.type === 'addWound'" class="fx-field">
        <span>数量</span>
        <input v-model.number="eff.count" type="number" min="0" class="fx-ctl fx-num" />
      </label>

      <template v-else-if="eff.type === 'applyStatus'">
        <label class="fx-field">
          <span>状态</span>
          <select v-model="eff.status" class="fx-ctl">
            <option v-for="st in STATUSES" :key="st.id" :value="st.id">{{ st.icon }} {{ st.name }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>层数</span>
          <input v-model.number="eff.stacks" type="number" class="fx-ctl fx-num" />
        </label>
        <label class="fx-field">
          <span>对象</span>
          <select v-model="eff.to" class="fx-ctl">
            <option value="self">自身</option>
            <option value="target">选中的敌人</option>
            <option value="allEnemies">全体敌人</option>
          </select>
        </label>
      </template>

      <template v-else-if="eff.type === 'exhaustWounds'">
        <label class="fx-field">
          <span>来源</span>
          <select v-model="eff.from" class="fx-ctl">
            <option value="hand">手牌中的伤口</option>
            <option value="discard">弃牌堆中的伤口</option>
          </select>
        </label>
        <label class="fx-field">
          <span>每消耗 1 张获得</span>
          <select v-model="eff.gain" class="fx-ctl">
            <option v-for="g in GAINS" :key="g.value" :value="g.value">{{ g.label }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>数值</span>
          <input v-model.number="eff.per" type="number" min="0" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else>
        <label class="fx-field">
          <span>数值</span>
          <input v-model.number="eff.amount" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.type === 'damage' || eff.type === 'block'" class="fx-check" title="数值乘以消耗的能量 X">
          <input v-model="eff.perX" type="checkbox" /> × X（按能量倍乘）
        </label>
        <label v-if="eff.type === 'damage'" class="fx-field" title="牌堆中每有一张伤口，额外增加的伤害">
          <span>每张伤口额外 +</span>
          <input v-model.number="eff.woundBonus" type="number" min="0" class="fx-ctl fx-num" />
        </label>
      </template>

      <span class="fx-actions">
        <button class="fx-btn" title="上移" @click="move(i, -1)">▲</button>
        <button class="fx-btn" title="下移" @click="move(i, 1)">▼</button>
        <button class="fx-btn fx-del" title="删除" @click="remove(i)">✕</button>
      </span>
    </div>

    <button class="fx-add" @click="add">＋ 添加效果</button>
  </div>
</template>

<style scoped>
.fx {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fx-empty {
  padding: 12px;
  text-align: center;
  color: #64748b;
  border: 1px dashed #334155;
  border-radius: 8px;
}
.fx-row {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 10px 12px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
}
.fx-index {
  align-self: center;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  background: #0f172a;
  border-radius: 50%;
}
.fx-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: #94a3b8;
}
.fx-check {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  font-size: 13px;
  color: #cbd5e1;
  cursor: pointer;
}
.fx-ctl {
  height: 30px;
  padding: 0 8px;
  font-size: 13px;
  color: #f1f5f9;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 6px;
  outline: none;
}
.fx-ctl:focus {
  border-color: #fbbf24;
}
.fx-type {
  align-self: center;
  min-width: 150px;
  font-weight: 600;
}
.fx-num {
  width: 72px;
}
.fx-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
  align-self: center;
}
.fx-btn {
  width: 28px;
  height: 28px;
  font-size: 12px;
  color: #cbd5e1;
  background: #334155;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.fx-btn:hover {
  background: #475569;
}
.fx-del:hover {
  background: #b91c1c;
  color: #fff;
}
.fx-add {
  align-self: flex-start;
  padding: 6px 14px;
  font-size: 13px;
  color: #fbbf24;
  background: transparent;
  border: 1px dashed #92710f;
  border-radius: 6px;
  cursor: pointer;
}
.fx-add:hover {
  background: rgba(251, 191, 36, 0.1);
}
</style>
