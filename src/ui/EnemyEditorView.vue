<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, ref } from 'vue'
import { attackBonusAt, intentIndexAt } from '@/engine/intents'
import raw from '@/data/enemies.json'
import {
  ROLES,
  validateEnemyData,
  type EncounterSpec,
  type EnemyData,
  type EnemyRole,
  type ActionSpec,
  type EnemySpec,
  type IntentSpec,
} from '@/data/enemySpec'

defineEmits<{ close: [] }>()

const ROLE_LABEL: Record<EnemyRole, string> = {
  monster: '普通怪',
  elite: '精英',
  boss: 'Boss',
  other: '附属 / 其他',
}
const INTENT_LABEL: Record<IntentSpec['type'], string> = {
  attack: '攻击',
  defend: '防御',
  debuff: '给玩家上状态',
  buff: '给自己上状态',
  addCards: '往弃牌堆塞牌',
  idle: '蓄力（无动作）',
  summon: '召唤',
  steal: '偷金币',
  flee: '逃跑',
}
const INTENT_TYPES = Object.keys(INTENT_LABEL) as IntentSpec['type'][]

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const data = ref<EnemyData>(clone(raw as EnemyData))
const saved = ref(JSON.stringify(data.value))
const dirty = computed(() => JSON.stringify(data.value) !== saved.value)

const tab = ref<'enemies' | 'encounters'>('enemies')
const selectedId = ref(data.value.enemies[0]?.id ?? '')
const selectedEnc = ref(data.value.encounters[0]?.id ?? '')
const search = ref('')
const message = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)

const current = computed(() => data.value.enemies.find((e) => e.id === selectedId.value))
const currentEnc = computed(() => data.value.encounters.find((c) => c.id === selectedEnc.value))
const errors = computed(() => validateEnemyData(data.value))

const groups = computed(() =>
  ROLES.map((role) => ({
    role,
    items: data.value.enemies.filter(
      (e) =>
        e.role === role &&
        (!search.value || e.name.includes(search.value) || e.id.includes(search.value)),
    ),
  })).filter((g) => g.items.length > 0),
)
const nameOf = (id: string) => data.value.enemies.find((e) => e.id === id)?.name ?? `（缺失 ${id}）`

/** 其他敌人 / 遭遇对某只怪的引用，用于删除前提示 */
function usedBy(id: string): string[] {
  const out: string[] = []
  for (const e of data.value.enemies) {
    if (e.id === id) continue
    if (e.splitInto?.includes(id)) out.push(`${e.name} 的分裂`)
    if (e.intents.some((i) => actionsOf(i).some((a) => a.type === 'summon' && a.enemy === id))) out.push(`${e.name} 的召唤`)
  }
  for (const c of data.value.encounters) if (c.enemies.includes(id)) out.push(`遭遇 ${c.name}`)
  return out
}

function uniqueId(base: string, taken: (id: string) => boolean) {
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  return id
}

function addEnemy() {
  const id = uniqueId('new-enemy', (x) => data.value.enemies.some((e) => e.id === x))
  data.value.enemies.push({
    id,
    name: '新敌人',
    icon: '👾',
    role: 'monster',
    threat: 2,
    maxHp: 30,
    intents: [{ type: 'attack', damage: 6 }],
  })
  selectedId.value = id
}
function removeEnemy() {
  const e = current.value
  if (!e) return
  const used = usedBy(e.id)
  if (used.length) {
    message.value = { ok: false, text: `✘ 无法删除，仍被引用：${used.join('、')}` }
    return
  }
  data.value.enemies = data.value.enemies.filter((x) => x.id !== e.id)
  selectedId.value = data.value.enemies[0]?.id ?? ''
}
function copyEnemy() {
  const e = current.value
  if (!e) return
  const id = uniqueId(`${e.id}-copy`, (x) => data.value.enemies.some((y) => y.id === x))
  data.value.enemies.push({ ...clone(e), id, name: `${e.name}（副本）` })
  selectedId.value = id
}

/** 改 id 时同步所有引用，避免保存后到处断链 */
function renameId(e: EnemySpec, next: string) {
  const prev = e.id
  if (!next || next === prev) return
  for (const x of data.value.enemies) {
    x.splitInto = x.splitInto?.map((s) => (s === prev ? next : s))
    for (const i of x.intents) for (const a of actionsOf(i)) if (a.type === 'summon' && a.enemy === prev) a.enemy = next
  }
  for (const c of data.value.encounters) c.enemies = c.enemies.map((s) => (s === prev ? next : s))
  e.id = next
  selectedId.value = next
}

function setRole(e: EnemySpec, role: EnemyRole) {
  e.role = role
  if (role === 'monster') e.threat ??= 2
  else delete e.threat
}

// ---- 意图 ----
/** 一回合的所有动作：主动作在前，also 里的追加动作在后（主动作就是意图对象本身） */
function actionsOf(it: IntentSpec): ActionSpec[] {
  return [it, ...(it.also ?? [])]
}
function blankIntent(type: IntentSpec['type']): IntentSpec {
  switch (type) {
    case 'attack':
      return { type, damage: 6 }
    case 'defend':
      return { type, block: 6 }
    case 'debuff':
    case 'buff':
      return { type, status: 'weak', stacks: 1 }
    case 'addCards':
      return { type, cardId: 'slimed', count: 1 }
    case 'summon':
      return { type, enemy: data.value.enemies.find((x) => x.id !== selectedId.value)?.id ?? '' }
    case 'steal':
      return { type, amount: 10 }
    case 'idle':
    case 'flee':
      return { type }
  }
}
/** k=0 改主动作（保留追加动作），k>0 改 also 里第 k-1 个 */
function setActionType(e: EnemySpec, i: number, k: number, type: IntentSpec['type']) {
  const it = e.intents[i] as IntentSpec
  if (k === 0) {
    const next = blankIntent(type)
    if (it.also?.length) next.also = it.also
    e.intents[i] = next
  } else {
    const { also: _unused, ...action } = blankIntent(type)
    void _unused
    ;(it.also as ActionSpec[])[k - 1] = action
  }
}
function addAlso(it: IntentSpec) {
  const { also: _unused, ...action } = blankIntent('defend')
  void _unused
  ;(it.also ??= []).push(action)
}
function removeAction(it: IntentSpec, k: number) {
  it.also?.splice(k - 1, 1)
  if (!it.also?.length) delete it.also
}
function setHits(it: Extract<ActionSpec, { type: 'attack' }>, n: number) {
  if (Number.isInteger(n) && n > 1) it.hits = n
  else delete it.hits
}
function moveIntent(e: EnemySpec, i: number, by: -1 | 1) {
  const j = i + by
  if (j < 0 || j >= e.intents.length) return
  const list = e.intents
  ;[list[i], list[j]] = [list[j] as IntentSpec, list[i] as IntentSpec]
}
function setGrow(it: Extract<ActionSpec, { type: 'attack' }>, n: number) {
  if (Number.isInteger(n) && n > 0) it.grow = n
  else delete it.grow
}
function setLoopFrom(e: EnemySpec, n: number) {
  if (Number.isInteger(n) && n > 0) e.loopFrom = Math.min(n - 1, e.intents.length - 1)
  else delete e.loopFrom
}
/** 回合预览里第 n 回合（从 1 起）的意图摘要：含循环起点与递增攻击的累计伤害 */
function turnText(e: EnemySpec, n: number): string {
  const it = e.intents[intentIndexAt(e, n - 1)] as IntentSpec
  const bonus = attackBonusAt(e, n - 1)
  return actionsOf(it)
    .map((a) => describe(a.type === 'attack' ? { ...a, damage: a.damage + bonus } : a))
    .join(' + ')
}
function toggleAddCards(it: Extract<ActionSpec, { type: 'attack' }>) {
  if (it.addCards) delete it.addCards
  else it.addCards = { cardId: 'slimed', count: 1 }
}

/** 意图的一句话摘要，也用于回合预览 */
function describe(it: ActionSpec): string {
  switch (it.type) {
    case 'attack':
      return `攻击 ${it.damage}${(it.hits ?? 1) > 1 ? `×${it.hits}` : ''}${it.addCards ? `，塞 ${it.addCards.count} 张 ${it.addCards.cardId}` : ''}`
    case 'defend':
      return `防御 ${it.block}`
    case 'debuff':
      return `给你 ${it.status} ×${it.stacks}`
    case 'buff':
      return `自身 ${it.status} ×${it.stacks}`
    case 'addCards':
      return `塞 ${it.count} 张 ${it.cardId}`
    case 'summon':
      return `召唤 ${nameOf(it.enemy)}`
    case 'steal':
      return `偷 ${it.amount} 金币`
    case 'idle':
      return '蓄力'
    case 'flee':
      return '逃跑'
  }
}
/** 意图列表走一遍的直接伤害合计（计入多段与追加动作，不含递增），粗略看强度 */
const cycleDamage = computed(() =>
  (current.value?.intents ?? []).reduce(
    (s, i) => s + actionsOf(i).reduce((t, a) => t + (a.type === 'attack' ? a.damage * (a.hits ?? 1) : 0), 0),
    0,
  ),
)

// ---- 初始状态 ----
const statusRows = computed(() => Object.entries(current.value?.startStatuses ?? {}))
function setStatus(e: EnemySpec, oldKey: string, key: string, stacks: number) {
  const next: Record<string, number> = {}
  for (const [k, v] of Object.entries(e.startStatuses ?? {})) {
    if (k === oldKey) next[key] = stacks
    else next[k] = v
  }
  e.startStatuses = next
}
function addStatus(e: EnemySpec) {
  const key = uniqueId('status', (k) => k in (e.startStatuses ?? {}))
  e.startStatuses = { ...(e.startStatuses ?? {}), [key]: 1 }
}
function removeStatus(e: EnemySpec, key: string) {
  const next = { ...(e.startStatuses ?? {}) }
  delete next[key]
  e.startStatuses = next
}

// ---- 遭遇 ----
function addEncounter() {
  const id = uniqueId('encounter', (x) => data.value.encounters.some((c) => c.id === x))
  const first = data.value.enemies.find((e) => e.role === 'monster')?.id ?? ''
  data.value.encounters.push({ id, name: '新遭遇', enemies: [first], minFloor: 1, maxFloor: 13 })
  selectedEnc.value = id
}
function removeEncounter() {
  const c = currentEnc.value
  if (!c) return
  data.value.encounters = data.value.encounters.filter((x) => x.id !== c.id)
  selectedEnc.value = data.value.encounters[0]?.id ?? ''
}
function renameEncounter(c: EncounterSpec, next: string) {
  if (!next || next === c.id) return
  c.id = next
  selectedEnc.value = next
}
const encThreat = (c: EncounterSpec) =>
  c.enemies.reduce((s, id) => s + (data.value.enemies.find((e) => e.id === id)?.threat ?? 0), 0)

// ---- 保存 ----
async function save() {
  saving.value = true
  message.value = null
  try {
    const res = await fetch('/__dev/enemies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Enemy-Editor': '1' },
      body: JSON.stringify(data.value),
    })
    const text = await res.text()
    let body: { ok: boolean; error?: string }
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(
        res.status === 403
          ? '请求被拒绝（403）'
          : `保存接口无响应（HTTP ${res.status}），请重启 pnpm dev 让编辑器插件生效`,
      )
    }
    if (!body.ok) throw new Error(body.error ?? '保存失败')
    saved.value = JSON.stringify(data.value)
    message.value = { ok: true, text: '✔ 已写入 src/data/enemies.json，热更新后新开一局生效' }
  } catch (err) {
    message.value = { ok: false, text: `✘ ${(err as Error).message}` }
  } finally {
    saving.value = false
  }
}
function revert() {
  data.value = JSON.parse(saved.value) as EnemyData
  if (!current.value) selectedId.value = data.value.enemies[0]?.id ?? ''
  if (!currentEnc.value) selectedEnc.value = data.value.encounters[0]?.id ?? ''
}
</script>

<template>
  <div class="ed">
    <header class="ed-head">
      <span class="ed-title"><Emoji e="👹" /> 敌人编辑器</span>
      <span class="ed-tag">仅开发模式</span>
      <span class="ed-hint">保存后写回 src/data/enemies.json，新开一局生效</span>
      <span v-if="message" class="ed-msg" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</span>
      <span v-if="dirty" class="ed-dirty">有未保存的改动</span>
      <button class="ed-btn" :disabled="!dirty" @click="revert">还原</button>
      <button class="ed-btn primary" :disabled="!dirty || saving || errors.length > 0" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <button class="ed-btn" @click="$emit('close')">关闭</button>
    </header>

    <div v-if="errors.length" class="ed-errors">
      <div v-for="(er, i) in errors" :key="i">✘ {{ er }}</div>
    </div>

    <div class="ed-tabs">
      <button class="ed-tab" :class="{ on: tab === 'enemies' }" @click="tab = 'enemies'">
        敌人（{{ data.enemies.length }}）
      </button>
      <button class="ed-tab" :class="{ on: tab === 'encounters' }" @click="tab = 'encounters'">
        固定遭遇（{{ data.encounters.length }}）
      </button>
    </div>

    <!-- 敌人 -->
    <div v-if="tab === 'enemies'" class="ed-body">
      <aside class="ed-list">
        <div class="ed-filters">
          <input v-model="search" placeholder="🔍 搜索名称或 id" class="ed-ctl" />
          <button class="ed-btn" @click="addEnemy">＋ 新增</button>
        </div>
        <div v-for="g in groups" :key="g.role" class="ed-group">
          <div class="ed-group-title">{{ ROLE_LABEL[g.role] }}（{{ g.items.length }}）</div>
          <div
            v-for="e in g.items"
            :key="e.id"
            class="ed-item"
            :class="{ active: e.id === selectedId }"
            @click="selectedId = e.id"
          >
            <span><Emoji :e="e.icon || '👾'" /></span>
            <span class="ed-item-name">{{ e.name }}</span>
            <span class="ed-item-sub">{{ e.maxHp }}血<template v-if="e.threat"> · 威胁{{ e.threat }}</template></span>
          </div>
        </div>
      </aside>

      <main v-if="current" class="ed-form">
        <section class="ed-card">
          <h3>基础信息</h3>
          <div class="ed-grid">
            <label class="ed-field">
              <span>名称</span>
              <input v-model="current.name" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>图标（emoji，可空）</span>
              <input v-model="current.icon" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>id（改名会同步所有引用）</span>
              <input
                :value="current.id"
                class="ed-ctl"
                @change="renameId(current, ($event.target as HTMLInputElement).value.trim())"
              />
            </label>
            <label class="ed-field">
              <span>定位</span>
              <select
                :value="current.role"
                class="ed-ctl"
                @change="setRole(current, ($event.target as HTMLSelectElement).value as EnemyRole)"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
              </select>
            </label>
            <label class="ed-field">
              <span>生命上限</span>
              <input v-model.number="current.maxHp" type="number" min="1" class="ed-ctl" />
            </label>
            <label v-if="current.role === 'monster'" class="ed-field">
              <span>威胁值（决定出现的楼层）</span>
              <input v-model.number="current.threat" type="number" min="0.5" step="0.5" class="ed-ctl" />
            </label>
          </div>
          <div class="ed-note">
            只有"普通怪"会进入随机池；精英 / Boss 目前仍固定用汲取者 / 史莱姆老大（定位仅作分类），附属怪只作为分裂或召唤的产物。
          </div>
        </section>

        <section class="ed-card">
          <h3>意图循环（每回合一个意图，可含多段攻击与追加动作；走完回到循环起点）</h3>
          <div v-for="(it, i) in current.intents" :key="i" class="ed-turnbox">
            <div v-for="(a, k) in actionsOf(it)" :key="k" class="ed-intent">
              <span class="ed-idx">{{ k === 0 ? i + 1 : '+' }}</span>
              <select
                :value="a.type"
                class="ed-ctl"
                @change="setActionType(current, i, k, ($event.target as HTMLSelectElement).value as IntentSpec['type'])"
              >
                <option v-for="t in INTENT_TYPES" :key="t" :value="t">{{ INTENT_LABEL[t] }}</option>
              </select>


              <template v-if="a.type === 'attack'">
                <label class="ed-inline">伤害 <input v-model.number="a.damage" type="number" min="0" class="ed-ctl ed-num" /></label>
                <label class="ed-inline" title="多段攻击：每段独立结算伤害与格挡">段数 <input :value="a.hits ?? 1" type="number" min="1" class="ed-ctl ed-num" @input="setHits(a, Number(($event.target as HTMLInputElement).value))" /></label>
                <label class="ed-inline" title="每次攻击后，下一次攻击伤害增加多少">
                  每次递增 <input :value="a.grow ?? 0" type="number" min="0" class="ed-ctl ed-num" @input="setGrow(a, Number(($event.target as HTMLInputElement).value))" />
                </label>
                <label class="ed-inline">
                  <input type="checkbox" :checked="!!a.addCards" @change="toggleAddCards(a)" /> 附带塞牌
                </label>
                <template v-if="a.addCards">
                  <input v-model="a.addCards.cardId" class="ed-ctl ed-id" placeholder="卡牌 id" />
                  <input v-model.number="a.addCards.count" type="number" min="1" class="ed-ctl ed-num" />
                </template>
              </template>
              <label v-else-if="a.type === 'defend'" class="ed-inline">
                格挡 <input v-model.number="a.block" type="number" min="0" class="ed-ctl ed-num" />
              </label>
              <template v-else-if="a.type === 'debuff' || a.type === 'buff'">
                <input v-model="a.status" class="ed-ctl ed-id" placeholder="状态 id，如 weak" />
                <label class="ed-inline">层数 <input v-model.number="a.stacks" type="number" class="ed-ctl ed-num" /></label>
              </template>
              <template v-else-if="a.type === 'addCards'">
                <input v-model="a.cardId" class="ed-ctl ed-id" placeholder="卡牌 id" />
                <label class="ed-inline">张数 <input v-model.number="a.count" type="number" min="1" class="ed-ctl ed-num" /></label>
              </template>
              <label v-else-if="a.type === 'steal'" class="ed-inline">
                金币 <input v-model.number="a.amount" type="number" min="0" class="ed-ctl ed-num" />
              </label>
              <select v-else-if="a.type === 'summon'" v-model="a.enemy" class="ed-ctl">
                <option v-for="x in data.enemies" :key="x.id" :value="x.id">{{ x.name }}</option>
              </select>

              <span class="ed-spacer" />
              <template v-if="k === 0">
                <button class="ed-mini" :disabled="i === 0" @click="moveIntent(current, i, -1)">↑</button>
                <button class="ed-mini" :disabled="i === current.intents.length - 1" @click="moveIntent(current, i, 1)">↓</button>
                <button class="ed-mini" @click="current.intents.push(clone(it))">复制</button>
                <button class="ed-mini" title="同一回合在主动作之后再做一件事" @click="addAlso(it)">＋追加动作</button>
                <button class="ed-mini danger" @click="current.intents.splice(i, 1)">删除</button>
              </template>
              <button v-else class="ed-mini danger" @click="removeAction(it, k)">删除</button>
            </div>
          </div>
          <button class="ed-btn" @click="current.intents.push(blankIntent('attack'))">＋ 添加意图</button>
          <label class="ed-inline" title="填 N：走完最后一个意图后回到第 N 个；留空 / 1 表示整体循环">
            循环起点（第几个意图）
            <input
              :value="current.loopFrom !== undefined ? current.loopFrom + 1 : ''"
              type="number"
              min="1"
              :max="current.intents.length"
              class="ed-ctl ed-num"
              @change="setLoopFrom(current, Number(($event.target as HTMLInputElement).value))"
            />
          </label>

          <div class="ed-preview">
            <div class="ed-preview-title">回合预览（每个循环直接伤害合计 {{ cycleDamage }}）</div>
            <div class="ed-turns">
              <span v-for="n in Math.max(6, current.intents.length * 2)" :key="n" class="ed-turn">
                第 {{ n }} 回合：{{ turnText(current, n) }}
              </span>
            </div>
          </div>
        </section>

        <section class="ed-card">
          <h3>被动 / 开战自带状态</h3>
          <div v-for="[k, v] in statusRows" :key="k" class="ed-intent">
            <input
              :value="k"
              class="ed-ctl ed-id"
              @change="setStatus(current, k, ($event.target as HTMLInputElement).value.trim(), v)"
            />
            <input
              :value="v"
              type="number"
              class="ed-ctl ed-num"
              @change="setStatus(current, k, k, Number(($event.target as HTMLInputElement).value))"
            />
            <button class="ed-mini danger" @click="removeStatus(current, k)">删除</button>
          </div>
          <button class="ed-btn" @click="addStatus(current)">＋ 添加状态</button>
          <div class="ed-note">状态 id 示例：split（分裂）、carapace（舍身）、hive、drain、damageCap（单次伤害上限）。</div>
        </section>

        <section class="ed-card">
          <h3>死亡 / 半血分裂（需配合 split 状态）</h3>
          <div v-for="(_s, i) in current.splitInto ?? []" :key="i" class="ed-intent">
            <select v-model="(current.splitInto as string[])[i]" class="ed-ctl">
              <option v-for="x in data.enemies" :key="x.id" :value="x.id">{{ x.name }}</option>
            </select>
            <button class="ed-mini danger" @click="(current.splitInto as string[]).splice(i, 1)">删除</button>
          </div>
          <button
            class="ed-btn"
            @click="(current.splitInto ??= []).push(data.enemies.find((x) => x.id !== current!.id)?.id ?? '')"
          >
            ＋ 添加分裂体
          </button>
        </section>

        <div class="ed-bar">
          <button class="ed-btn" @click="copyEnemy">复制这只敌人</button>
          <button class="ed-btn danger" @click="removeEnemy">删除这只敌人</button>
        </div>
      </main>
      <main v-else class="ed-form ed-empty">选择左侧的敌人开始编辑</main>
    </div>

    <!-- 固定遭遇 -->
    <div v-else class="ed-body">
      <aside class="ed-list">
        <div class="ed-filters"><button class="ed-btn" @click="addEncounter">＋ 新增遭遇</button></div>
        <div
          v-for="c in data.encounters"
          :key="c.id"
          class="ed-item"
          :class="{ active: c.id === selectedEnc }"
          @click="selectedEnc = c.id"
        >
          <span class="ed-item-name">{{ c.name }}</span>
          <span class="ed-item-sub">{{ c.minFloor }}–{{ c.maxFloor }} 层 · {{ c.enemies.length }} 只</span>
        </div>
        <div v-if="!data.encounters.length" class="ed-note">还没有固定遭遇，普通战斗全部按威胁值预算自动组怪。</div>
      </aside>

      <main v-if="currentEnc" class="ed-form">
        <section class="ed-card">
          <h3>遭遇设置</h3>
          <div class="ed-grid">
            <label class="ed-field">
              <span>名称</span>
              <input v-model="currentEnc.name" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>id</span>
              <input
                :value="currentEnc.id"
                class="ed-ctl"
                @change="renameEncounter(currentEnc, ($event.target as HTMLInputElement).value.trim())"
              />
            </label>
            <label class="ed-field">
              <span>最早楼层</span>
              <input v-model.number="currentEnc.minFloor" type="number" min="1" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>最晚楼层</span>
              <input v-model.number="currentEnc.maxFloor" type="number" min="1" class="ed-ctl" />
            </label>
          </div>
          <div class="ed-note">
            楼层范围内的普通战斗，有 50% 概率直接出这一组；多个遭遇同时命中时随机选一个，其余仍按预算组怪。
          </div>
        </section>

        <section class="ed-card">
          <h3>敌人（总威胁值 {{ encThreat(currentEnc) }}）</h3>
          <div v-for="(_id, i) in currentEnc.enemies" :key="i" class="ed-intent">
            <select v-model="currentEnc.enemies[i]" class="ed-ctl">
              <option v-for="x in data.enemies" :key="x.id" :value="x.id">
                {{ x.name }}（{{ ROLE_LABEL[x.role] }} · {{ x.maxHp }}血）
              </option>
            </select>
            <button class="ed-mini danger" :disabled="currentEnc.enemies.length <= 1" @click="currentEnc.enemies.splice(i, 1)">
              删除
            </button>
          </div>
          <button
            class="ed-btn"
            :disabled="currentEnc.enemies.length >= 4"
            @click="currentEnc.enemies.push(data.enemies.find((x) => x.role === 'monster')?.id ?? '')"
          >
            ＋ 添加敌人
          </button>
        </section>

        <div class="ed-bar">
          <button class="ed-btn danger" @click="removeEncounter">删除这个遭遇</button>
        </div>
      </main>
      <main v-else class="ed-form ed-empty">选择或新增一个遭遇</main>
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
  color: #fb7185;
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
.ed-dirty + .ed-btn {
  margin-left: 0;
}
.ed-errors {
  padding: 6px 18px;
  font-size: 12px;
  color: #fca5a5;
  background: #450a0a;
  max-height: 84px;
  overflow: auto;
}
.ed-tabs {
  display: flex;
  gap: 4px;
  padding: 6px 18px 0;
  background: #1e293b;
}
.ed-tab {
  padding: 6px 16px;
  color: #94a3b8;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}
.ed-tab.on {
  color: #fbbf24;
  border-bottom-color: #fbbf24;
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
.ed-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.ed-group-title {
  margin: 8px 0 2px;
  font-size: 12px;
  color: #64748b;
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
.ed-empty {
  color: #64748b;
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
.ed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
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
}
.ed-num {
  width: 72px;
}
.ed-id {
  width: 150px;
}
.ed-intent {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ed-turnbox {
  padding: 6px 8px 2px;
  margin-bottom: 6px;
  background: #172033;
  border-radius: 6px;
}
.ed-idx {
  width: 18px;
  color: #64748b;
  text-align: center;
}
.ed-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.ed-spacer {
  flex: 1;
}
.ed-mini {
  padding: 2px 8px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
  background: #334155;
  border: 0;
  border-radius: 4px;
}
.ed-mini:disabled {
  opacity: 0.35;
  cursor: default;
}
.ed-mini.danger,
.ed-btn.danger {
  color: #fecaca;
  background: #7f1d1d;
}
.ed-note {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
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
.ed-preview {
  margin-top: 12px;
  padding: 8px 10px;
  background: #0f172a;
  border-radius: 6px;
}
.ed-preview-title {
  margin-bottom: 6px;
  font-size: 12px;
  color: #94a3b8;
}
.ed-turns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ed-turn {
  padding: 2px 8px;
  font-size: 12px;
  background: #1e293b;
  border-radius: 4px;
}
</style>
