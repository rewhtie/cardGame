<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BUFFS,
  DEBUFFS,
  DECAY_LABEL,
  durationText,
  STATUSES,
  statusTip,
  TIMING_TEXT,
  triggerTiming,
} from '@/engine/statuses'
import enemiesRaw from '@/data/enemies.json'

defineEmits<{ close: [] }>()

/** 全部状态（含敌人机制如分裂、硬壳）的只读查看：说明、持续规则、钩子数值都直接取自 statuses.ts，不会和代码不一致 */
const list = STATUSES
const KIND_LABEL = [
  { kind: 'buff', label: '正面 / 机制', items: BUFFS },
  { kind: 'debuff', label: '负面', items: DEBUFFS },
]

/** 卡牌源码和敌人数据按文本扫描，找出引用了某个状态 id 的地方 */
const cardSources = import.meta.glob('/src/data/cards/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>
const enemyList = (enemiesRaw as { enemies: { id: string; name: string }[] }).enemies

function usageOf(id: string): string[] {
  const out: string[] = []
  const quoted = [`'${id}'`, `"${id}"`]
  for (const [path, src] of Object.entries(cardSources)) {
    if (quoted.some((q) => src.includes(q))) out.push(`卡牌文件 ${path.split('/').pop()}`)
  }
  for (const e of enemyList) {
    const chunk = JSON.stringify(e)
    if (quoted.some((q) => chunk.includes(q))) out.push(`敌人 ${e.name}`)
  }
  return out
}

/** 引擎源码（不含测试和状态表本身）：找出“行为写在引擎里”的状态落在哪些文件 */
const engineSources = import.meta.glob(['/src/engine/*.ts', '!/src/engine/*.test.ts', '!/src/engine/statuses.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function engineUsageOf(id: string): string[] {
  const prop = new RegExp(`[.?]${id}\\b`)
  return Object.entries(engineSources)
    .filter(([, src]) => src.includes(`'${id}'`) || src.includes(`"${id}"`) || prop.test(src))
    .map(([path]) => path.split('/').pop()!)
}

const hasTrigger = (d: (typeof STATUSES)[number]) => !!(d.onTurnStart || d.onTurnEnd)

const selectedId = ref(list[0]?.id ?? '')
const search = ref('')

const match = (d: (typeof STATUSES)[number]) =>
  !search.value || d.name.includes(search.value) || d.id.includes(search.value) || d.text.includes(search.value)
const groups = computed(() =>
  KIND_LABEL.map((g) => ({ ...g, items: g.items.filter(match) })).filter((g) => g.items.length > 0),
)
const current = computed(() => list.find((d) => d.id === selectedId.value))
const usage = computed(() => (current.value ? usageOf(current.value.id) : []))
const engineUsage = computed(() => (current.value ? engineUsageOf(current.value.id) : []))
const previewStacks = ref(3)
const DISPLAY_LABEL: Record<string, string> = {
  number: 'number：层数即数值，直接显示数字',
  count: 'count：能力型，叠加后显示小号 ×N',
  value: 'value：纯数值，没有“层”的概念',
}
const preview = computed(() => (current.value ? statusTip(current.value, previewStacks.value) : null))

const fmtMod = (m: { add?: number; mul?: number; round?: boolean }) =>
  [
    m.add !== undefined ? `${m.add >= 0 ? '+' : ''}${m.add}` : '',
    m.mul !== undefined ? `×${Math.round(m.mul * 1000) / 1000}` : '',
    m.round ? '（四舍五入）' : '',
  ]
    .filter(Boolean)
    .join(' ')
const TRIGGER_LABEL: Record<string, string> = { loseHp: '失去生命', heal: '恢复生命', block: '获得格挡' }
const fmtTrigger = (t: { type: string; amount?: number; status?: string; stacks?: number }) =>
  t.type === 'gainStatus' ? `获得 ${t.stacks} 层 ${t.status}` : `${TRIGGER_LABEL[t.type] ?? t.type} ${t.amount}`
/** 每个钩子在预览层数下的实际返回值，用来核对说明文字和代码是否一致 */
const hookDetails = computed(() => {
  const d = current.value
  if (!d) return []
  const n = previewStacks.value
  const out: string[] = []
  if (d.modifyDamageDealt) out.push(`造成伤害：${fmtMod(d.modifyDamageDealt(n))}`)
  if (d.modifyDamageTaken) out.push(`受到伤害：${fmtMod(d.modifyDamageTaken(n))}`)
  if (d.modifyBlock) out.push(`获得格挡：${fmtMod(d.modifyBlock(n))}`)
  if (d.onTurnStart) out.push(`回合开始：${fmtTrigger(d.onTurnStart(n))}`)
  if (d.onTurnEnd) out.push(`回合结束：${fmtTrigger(d.onTurnEnd(n))}`)
  if (d.onDamaged) out.push(`被攻击时反伤 ${d.onDamaged(n).amount} 点`)
  if (d.capDamage) out.push(`单次攻击最多损失 ${d.capDamage(n)} 点生命`)
  if (d.onHit) out.push(`被打中时置入 ${d.onHit(n).count} 张 ${d.onHit(n).cardId}`)
  if (d.onPlayerCard) out.push(`玩家出牌后给自己 ${d.onPlayerCard(n).stacks} 层 ${d.onPlayerCard(n).status}`)
  if (d.afterPlayerCard) out.push(`玩家出牌后本回合力量 -${d.afterPlayerCard(n).strength}、敏捷 -${d.afterPlayerCard(n).dexterity}`)
  if (d.turnStartGrow !== undefined) out.push(`每个敌方回合开始自身层数 +${d.turnStartGrow}`)
  return out.length ? out : ['引擎内置（行为写在战斗逻辑里，这里无法核对）']
})
</script>

<template>
  <div class="ed">
    <header class="ed-head">
      <span class="ed-title">☠️ 状态面板</span>
      <span class="ed-tag">仅开发模式 · 只读</span>
      <span class="ed-hint">所有内容取自 statuses.ts；要改效果或文字，直接改代码</span>
      <button class="ed-btn" style="margin-left: auto" @click="$emit('close')">关闭</button>
    </header>

    <div class="ed-body">
      <aside class="ed-list">
        <input v-model="search" placeholder="🔍 搜索名称、id 或说明" class="ed-ctl" />
        <template v-for="g in groups" :key="g.kind">
          <div class="ed-item-sub" style="margin-top: 8px">{{ g.label }}（{{ g.items.length }}）</div>
          <div
            v-for="d in g.items"
            :key="d.id"
            class="ed-item"
            :class="{ active: d.id === selectedId }"
            @click="selectedId = d.id"
          >
            <span>{{ d.icon }}</span>
            <span class="ed-item-name">{{ d.name }}</span>
          </div>
        </template>
      </aside>

      <main v-if="current && preview" class="ed-form">
        <div class="ed-card">
          <h3>{{ current.icon }} {{ current.name }}　<span class="ed-item-sub">{{ current.id }}</span></h3>
          <div>{{ current.text }}</div>
          <div class="ed-item-sub" style="margin-top: 6px">
            {{ current.kind === 'buff' ? '正面' : '负面' }}　显示：{{ DISPLAY_LABEL[current.display ?? 'number'] }}
          </div>
        </div>

        <div class="ed-card">
          <h3>
            悬浮提示预览
            <input v-model.number="previewStacks" type="number" min="1" max="99" class="ed-ctl" style="width: 64px; margin-left: 8px" />
            层
          </h3>
          <div>{{ preview.plain ? "" : "每层：" }}{{ preview.perLayer }}</div>
          <div v-if="preview.total">当前 {{ previewStacks }} 层：{{ preview.total }}</div>
          <div v-if="preview.duration" class="ed-item-sub">{{ preview.duration }}</div>
        </div>

        <div class="ed-card">
          <h3>代码里的实际效果</h3>
          <div v-for="h in hookDetails" :key="h" style="margin-top: 4px">
            · {{ h }}<template v-if="!h.startsWith('引擎')">（{{ previewStacks }} 层）</template>
          </div>
        </div>

        <div class="ed-card">
          <h3>持续方式与结算时点</h3>
          <div>{{ DECAY_LABEL[current.decay] }}</div>
          <div class="ed-item-sub" style="margin-top: 6px">
            {{ durationText(current) || '永久常驻' }}
            <template v-if="hasTrigger(current) && triggerTiming(current, 'player')">；触发于{{ TIMING_TEXT[triggerTiming(current, 'player')!] }}（玩家持有时）</template>
          </div>
        </div>

        <div class="ed-card">
          <h3>被谁使用</h3>
          <div v-if="usage.length === 0 && engineUsage.length === 0" class="ed-item-sub">没有找到引用</div>
          <div v-for="u in usage" :key="u">{{ u }}</div>
          <div v-if="engineUsage.length" class="ed-item-sub" style="margin-top: 6px">引擎里处理它的文件：{{ engineUsage.join('、') }}</div>
        </div>
      </main>
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
  color: #a78bfa;
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
.ed-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.ed-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 280px;
  padding: 10px;
  overflow-y: auto;
  background: #111c33;
  border-right: 1px solid #334155;
}
.ed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.ed-item:hover {
  background: #1e293b;
}
.ed-item.active {
  background: #334155;
}
.ed-item-name {
  flex: 1;
}
.ed-item-sub {
  font-size: 12px;
  color: #94a3b8;
}
.ed-form {
  flex: 1;
  padding: 14px 18px;
  overflow-y: auto;
}
.ed-card {
  margin-bottom: 14px;
  padding: 12px 14px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
}
.ed-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: #fbbf24;
}
.ed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.ed-ctl {
  padding: 5px 8px;
  color: #e2e8f0;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 4px;
  font: inherit;
}
.ed-bar {
  display: flex;
  gap: 8px;
}
.ed-btn {
  padding: 5px 12px;
  color: #e2e8f0;
  cursor: pointer;
  background: #334155;
  border: 0;
  border-radius: 6px;
}
.ed-btn:hover:not(:disabled) {
  background: #475569;
}
.ed-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.ed-btn.primary {
  color: #0f172a;
  font-weight: 700;
  background: #fbbf24;
}
</style>
