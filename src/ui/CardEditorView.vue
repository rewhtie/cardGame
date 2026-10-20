<script setup lang="ts">
import { computed, ref } from 'vue'
import { Card, editableCards } from '@/data/cards'
import type { CardSpec, EditableRarity } from '@/data/cards/cardSpec'
import type { CardDef } from '@/engine/types'
import CardEffectsEditor from './CardEffectsEditor.vue'
import CardView from './CardView.vue'

defineEmits<{ close: [] }>()

const DIRS = [
  { value: 'warrior', label: '战士' },
  { value: 'doctor', label: '鸦嘴医生' },
]
const RARITIES: { value: EditableRarity; label: string }[] = [
  { value: 'white', label: '白（普通）' },
  { value: 'blue', label: '蓝（稀有）' },
  { value: 'gold', label: '金（传说）' },
]
const RARITY_SHORT: Record<EditableRarity, string> = { white: '白', blue: '蓝', gold: '金' }

interface Entry {
  dir: string
  /** 磁盘上当前所在的稀有度文件 */
  fileRarity: EditableRarity
  spec: CardSpec
  /** 上次保存 / 载入时的快照，用于判断是否有未保存改动 */
  saved: string
}

const entries = ref<Entry[]>(
  editableCards().map(({ dir, spec }) => {
    const copy = structuredClone(spec)
    return { dir, fileRarity: spec.rarity, spec: copy, saved: JSON.stringify(copy) }
  }),
)

const dirFilter = ref('all')
const rarityFilter = ref<'all' | EditableRarity>('all')
const search = ref('')
const selectedId = ref<string | null>(null)
const showUpgraded = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)

const list = computed(() =>
  entries.value.filter(
    (e) =>
      (dirFilter.value === 'all' || e.dir === dirFilter.value) &&
      (rarityFilter.value === 'all' || e.spec.rarity === rarityFilter.value) &&
      (!search.value || e.spec.name.includes(search.value) || e.spec.id.includes(search.value)),
  ),
)
const current = computed(() => entries.value.find((e) => e.spec.id === selectedId.value) ?? null)
const dirty = (e: Entry) => JSON.stringify(e.spec) !== e.saved
const dirtyCount = computed(() => entries.value.filter(dirty).length)
const dirLabel = (dir: string) => DIRS.find((d) => d.value === dir)?.label ?? dir

/** 预览用的卡牌定义：原卡或套上升级版 */
const preview = computed<CardDef | null>(() => {
  const spec = current.value?.spec
  if (!spec) return null
  try {
    const def = Card.fromSpec(spec).build()
    if (!showUpgraded.value || !def.upgraded) return def
    return { ...def, ...def.upgraded, name: def.name + '+' }
  } catch {
    return null
  }
})

const costText = computed({
  get: () => String(current.value?.spec.cost ?? ''),
  set: (v: string) => {
    if (current.value) current.value.spec.cost = v.trim().toUpperCase() === 'X' ? 'X' : Number(v) || 0
  },
})
const hasUpgrade = computed({
  get: () => !!current.value?.spec.upgrade,
  set: (on: boolean) => {
    const spec = current.value?.spec
    if (!spec) return
    if (on) spec.upgrade = {}
    else delete spec.upgrade
  },
})
const upgradeReplacesEffects = computed({
  get: () => !!current.value?.spec.upgrade?.effects,
  set: (on: boolean) => {
    const spec = current.value?.spec
    if (!spec?.upgrade) return
    if (on) spec.upgrade.effects = structuredClone(spec.effects)
    else delete spec.upgrade.effects
  },
})
const upgradeCost = computed({
  get: () => String(current.value?.spec.upgrade?.cost ?? ''),
  set: (v: string) => {
    const up = current.value?.spec.upgrade
    if (!up) return
    if (v.trim() === '') delete up.cost
    else up.cost = v.trim().toUpperCase() === 'X' ? 'X' : Number(v) || 0
  },
})
const upgradeExhaust = computed({
  get: () => {
    const v = current.value?.spec.upgrade?.exhaust
    return v === undefined ? '' : String(v)
  },
  set: (v: string) => {
    const up = current.value?.spec.upgrade
    if (!up) return
    if (v === '') delete up.exhaust
    else up.exhaust = v === 'true'
  },
})

async function save(e: Entry) {
  saving.value = true
  message.value = null
  try {
    const res = await fetch('/__dev/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Card-Editor': '1' },
      body: JSON.stringify({ dir: e.dir, fromRarity: e.fileRarity, spec: e.spec }),
    })
    const raw = await res.text()
    let body: { ok: boolean; error?: string }
    try {
      body = JSON.parse(raw)
    } catch {
      throw new Error(
        res.status === 403
          ? '请求被拒绝（403）'
          : `保存接口无响应（HTTP ${res.status}），请重启 pnpm dev 让编辑器插件生效`,
      )
    }
    if (!body.ok) throw new Error(body.error ?? '保存失败')
    e.fileRarity = e.spec.rarity
    e.saved = JSON.stringify(e.spec)
    message.value = { ok: true, text: `✔ 已写入 ${e.dir}/${e.spec.rarity}.ts：${e.spec.name}` }
  } catch (err) {
    message.value = { ok: false, text: `✘ ${(err as Error).message}` }
  } finally {
    saving.value = false
  }
}

function revert(e: Entry) {
  e.spec = JSON.parse(e.saved) as CardSpec
}
</script>

<template>
  <div class="ed">
    <header class="ed-head">
      <span class="ed-title">🛠 卡牌编辑器</span>
      <span class="ed-tag">仅开发模式</span>
      <span class="ed-hint">保存后会直接改写 src/data/cards 下的源码，热更新后生效</span>
      <span v-if="message" class="ed-msg" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</span>
      <span v-if="dirtyCount" class="ed-dirty">{{ dirtyCount }} 张未保存</span>
      <button class="ed-btn ed-close" @click="$emit('close')">关闭</button>
    </header>

    <div class="ed-body">
      <!-- 左：卡牌列表 -->
      <aside class="ed-list">
        <div class="ed-filters">
          <select v-model="dirFilter" class="ed-ctl">
            <option value="all">全部职业</option>
            <option v-for="d in DIRS" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
          <select v-model="rarityFilter" class="ed-ctl">
            <option value="all">全部稀有度</option>
            <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <input v-model="search" placeholder="🔍 搜索名称或 id" class="ed-ctl ed-search" />
        </div>
        <div class="ed-count">共 {{ list.length }} 张</div>
        <ul class="ed-items">
          <li
            v-for="e in list"
            :key="e.spec.id"
            class="ed-item"
            :class="[`r-${e.spec.rarity}`, { active: e.spec.id === selectedId }]"
            @click="selectedId = e.spec.id"
          >
            <span class="ed-item-icon">{{ e.spec.icon }}</span>
            <span class="ed-item-main">
              <span class="ed-item-name">{{ e.spec.name }}</span>
              <span class="ed-item-sub">{{ dirLabel(e.dir) }} · {{ RARITY_SHORT[e.spec.rarity] }}</span>
            </span>
            <span v-if="dirty(e)" class="ed-dot" title="有未保存的改动">●</span>
            <span class="ed-cost">{{ e.spec.cost }}</span>
          </li>
        </ul>
      </aside>

      <!-- 中：表单 -->
      <main v-if="current" class="ed-form">
        <section class="ed-card">
          <h3>基础信息</h3>
          <div class="ed-grid">
            <label class="ed-field span2">
              <span>卡牌名称</span>
              <input v-model="current.spec.name" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>图标（emoji）</span>
              <input v-model="current.spec.icon" class="ed-ctl" />
            </label>
            <div class="ed-field">
              <span>卡牌 id（不可修改）</span>
              <div class="ed-readonly">{{ current.spec.id }}</div>
            </div>

            <label class="ed-field">
              <span>稀有度</span>
              <select v-model="current.spec.rarity" class="ed-ctl">
                <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </label>
            <label class="ed-field">
              <span>能量费用（数字或 X）</span>
              <input v-model="costText" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>卡牌类型</span>
              <select v-model="current.spec.target" class="ed-ctl">
                <option value="enemy">攻击（需选择敌人）</option>
                <option value="self">技能（作用于自身）</option>
                <option value="power">能力（打出后持续生效）</option>
              </select>
            </label>
            <label class="ed-field">
              <span>初始牌组张数</span>
              <input v-model.number="current.spec.starter" type="number" min="0" class="ed-ctl" />
            </label>
          </div>
        </section>

        <section class="ed-card">
          <h3>特性</h3>
          <div class="ed-checks">
            <label><input v-model="current.spec.exhaust" type="checkbox" /> 消耗（打出后移出本场战斗）</label>
            <label><input v-model="current.spec.reward" type="checkbox" /> 加入奖励卡池</label>
            <label><input v-model="current.spec.unplayable" type="checkbox" /> 无法打出</label>
            <label class="inline">
              回合结束时失去生命
              <input v-model.number="current.spec.endTurnLoseHp" type="number" min="0" class="ed-ctl ed-mini" />
            </label>
          </div>
        </section>

        <section class="ed-card">
          <h3>效果 <small>按从上到下的顺序依次结算</small></h3>
          <CardEffectsEditor v-model="current.spec.effects" />
        </section>

        <section class="ed-card">
          <h3>
            <label class="ed-switch"><input v-model="hasUpgrade" type="checkbox" /> 升级版 <small>火堆锻造后的效果</small></label>
          </h3>
          <template v-if="current.spec.upgrade">
            <div class="ed-grid up">
              <label class="ed-field">
                <span>升级后费用</span>
                <input v-model="upgradeCost" placeholder="留空 = 不变" class="ed-ctl" />
              </label>
              <label class="ed-field">
                <span>升级后是否消耗</span>
                <select v-model="upgradeExhaust" class="ed-ctl">
                  <option value="">不变</option>
                  <option value="true">改为消耗</option>
                  <option value="false">改为不消耗</option>
                </select>
              </label>
              <label class="ed-check-inline">
                <input v-model="upgradeReplacesEffects" type="checkbox" /> 自定义升级后的效果
              </label>
            </div>
            <CardEffectsEditor v-if="current.spec.upgrade.effects" v-model="current.spec.upgrade.effects" />
            <p v-else class="ed-note">未自定义时，升级会按系统规则自动提升效果数值。</p>
          </template>
        </section>

        <section class="ed-card">
          <h3>卡面文字 <small>留空则根据效果自动生成</small></h3>
          <input v-model="current.spec.text" placeholder="自定义描述文字" class="ed-ctl full" />
        </section>

        <div class="ed-bar">
          <button class="ed-btn primary" :disabled="saving || !dirty(current)" @click="save(current)">
            {{ saving ? '保存中…' : '💾 保存到代码' }}
          </button>
          <button class="ed-btn" :disabled="!dirty(current)" @click="revert(current)">↩ 还原改动</button>
          <span v-if="!dirty(current)" class="ed-note">没有未保存的改动</span>
        </div>
      </main>
      <main v-else class="ed-empty">← 从左侧选择一张卡牌开始编辑</main>

      <!-- 右：预览 -->
      <aside class="ed-preview">
        <div class="ed-preview-title">卡牌预览</div>
        <label class="ed-check-inline">
          <input v-model="showUpgraded" type="checkbox" /> 显示升级版
        </label>
        <div v-if="preview" class="ed-preview-card">
          <CardView :card="preview" :playable="true" />
        </div>
        <p v-else class="ed-note">选择卡牌后在此预览</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ed {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  color: #e2e8f0;
  font-size: 14px;
  background: #0f172a;
}
.ed-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}
.ed-title {
  font-size: 18px;
  font-weight: 700;
  color: #fbbf24;
}
.ed-tag {
  padding: 1px 8px;
  font-size: 12px;
  color: #34d399;
  border: 1px solid #065f46;
  border-radius: 999px;
}
.ed-hint {
  font-size: 12px;
  color: #64748b;
}
.ed-msg {
  font-size: 13px;
}
.ed-msg.ok {
  color: #34d399;
}
.ed-msg.err {
  color: #f87171;
}
.ed-dirty {
  margin-left: auto;
  font-size: 12px;
  color: #fbbf24;
}
.ed-close {
  margin-left: auto;
}
.ed-dirty + .ed-close {
  margin-left: 0;
}

.ed-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 列表 */
.ed-list {
  display: flex;
  flex-direction: column;
  width: 280px;
  min-height: 0;
  background: #111c31;
  border-right: 1px solid #334155;
}
.ed-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px;
}
.ed-filters select {
  flex: 1;
}
.ed-search {
  width: 100%;
}
.ed-count {
  padding: 0 12px 6px;
  font-size: 12px;
  color: #64748b;
}
.ed-items {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.ed-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-left: 3px solid transparent;
  cursor: pointer;
}
.ed-item:hover {
  background: #1e293b;
}
.ed-item.active {
  background: #26344d;
}
.ed-item.r-white {
  border-left-color: #94a3b8;
}
.ed-item.r-blue {
  border-left-color: #38bdf8;
}
.ed-item.r-gold {
  border-left-color: #fbbf24;
}
.ed-item-icon {
  font-size: 20px;
}
.ed-item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.ed-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-item-sub {
  font-size: 11px;
  color: #64748b;
}
.ed-dot {
  font-size: 10px;
  color: #fbbf24;
}
.ed-cost {
  min-width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  background: #fbbf24;
  border-radius: 50%;
}

/* 表单 */
.ed-form {
  flex: 1;
  min-width: 0;
  padding: 16px 20px 0;
  overflow-y: auto;
}
.ed-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: #64748b;
}
.ed-card {
  margin-bottom: 14px;
  padding: 14px 16px;
  background: #162033;
  border: 1px solid #2b3a55;
  border-radius: 10px;
}
.ed-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #fbbf24;
}
.ed-card h3 small {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
}
.ed-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.ed-grid.up {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  margin-bottom: 12px;
}
.span2 {
  grid-column: span 2;
}
.ed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.ed-ctl {
  height: 32px;
  padding: 0 10px;
  font-size: 14px;
  color: #f1f5f9;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 6px;
  outline: none;
}
.ed-ctl:focus {
  border-color: #fbbf24;
}
.ed-ctl.full {
  width: 100%;
  box-sizing: border-box;
}
.ed-mini {
  width: 64px;
  margin-left: 6px;
}
.ed-readonly {
  height: 32px;
  line-height: 32px;
  padding: 0 10px;
  color: #64748b;
  background: #0f172a80;
  border: 1px dashed #334155;
  border-radius: 6px;
}
.ed-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}
.ed-checks label,
.ed-check-inline,
.ed-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.ed-switch {
  font-size: 15px;
  color: #fbbf24;
}
.ed-note {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.ed-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 -20px;
  padding: 12px 20px;
  background: #0f172af2;
  border-top: 1px solid #334155;
}
.ed-btn {
  padding: 7px 16px;
  font-size: 14px;
  color: #e2e8f0;
  background: #334155;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.ed-btn:hover:not(:disabled) {
  background: #475569;
}
.ed-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ed-btn.primary {
  font-weight: 700;
  color: #052e1c;
  background: #34d399;
}
.ed-btn.primary:hover:not(:disabled) {
  background: #6ee7b7;
}

/* 预览 */
.ed-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 260px;
  padding: 16px;
  background: #111c31;
  border-left: 1px solid #334155;
}
.ed-preview-title {
  align-self: flex-start;
  font-weight: 700;
  color: #fbbf24;
}
.ed-preview .ed-check-inline {
  align-self: flex-start;
  font-size: 13px;
}
.ed-preview-card {
  width: 190px;
  height: 260px;
}
</style>
