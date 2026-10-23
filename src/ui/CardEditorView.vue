<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, ref } from 'vue'
import { Card, editableCards } from '@/data/cards'
import { saveCardOverrides } from '@/data/cards/overrides'
import type { CardSpec, EditableRarity } from '@/data/cards/cardSpec'
import { upgradeCard } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import CardEffectsEditor from './CardEffectsEditor.vue'
import CardView from './CardView.vue'

defineEmits<{ close: [] }>()

/** 开发模式：保存直接改写源码，可新增 / 删除 / 换职业；发布版：只能调整已有卡牌，改动存在本机 */
const DEV = import.meta.env.DEV

const DIRS = [
  { value: 'warrior', label: '战士' },
  { value: 'doctor', label: '鸦嘴医生' },
  { value: 'swordSaint', label: '剑圣' },
  { value: 'ancientTree', label: '参天古树' },
  { value: 'colorless', label: '无色' },
]
const RARITIES: { value: EditableRarity; label: string }[] = [
  { value: 'white', label: '白（普通）' },
  { value: 'blue', label: '蓝（稀有）' },
  { value: 'gold', label: '金（传说）' },
]
const RARITY_SHORT: Record<EditableRarity, string> = { white: '白', blue: '蓝', gold: '金' }

interface Entry {
  /** 当前选择的职业（改它再保存就会把卡牌移到该职业目录） */
  dir: string
  /** 磁盘上当前所在的职业目录 */
  fileDir: string
  /** 磁盘上当前所在的稀有度文件 */
  fileRarity: EditableRarity
  spec: CardSpec
  /** 内置原版数据（还原基准） */
  base: CardSpec
  /** 上次保存 / 载入时的快照，用于判断是否有未保存改动 */
  saved: string
}

const entries = ref<Entry[]>(
  editableCards().map(({ dir, spec, base }) => {
    const copy = structuredClone(spec)
    return { dir, fileDir: dir, fileRarity: spec.rarity, spec: copy, base, saved: JSON.stringify(copy) }
  }),
)

const dirFilter = ref('all')
const rarityFilter = ref<'all' | EditableRarity>('all')
const search = ref('')
const selectedId = ref<string | null>(null)
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
const dirty = (e: Entry) => JSON.stringify(e.spec) !== e.saved || e.dir !== e.fileDir
/** 与内置原版不同（发布版里即玩家改过的卡） */
const modified = (e: Entry) => JSON.stringify(e.spec) !== JSON.stringify(e.base)
const dirtyCount = computed(() => entries.value.filter(dirty).length)
const dirLabel = (dir: string) => DIRS.find((d) => d.value === dir)?.label ?? dir

/** 预览用的卡牌定义：原卡与升级版上下并排对比；没有手写升级版时只显示原卡 */
const preview = computed<{ base: CardDef; upgraded: CardDef; auto?: boolean } | null>(() => {
  const spec = current.value?.spec
  if (!spec) return null
  try {
    const base = Card.fromSpec(spec).build()
    // 没有手写升级版时，火堆锻造按系统规则自动加数值，预览同样展示这个结果
    if (!base.upgraded) return { base, upgraded: upgradeCard(base), auto: true }
    return { base, upgraded: { ...base, ...base.upgraded, name: base.name + '+' } }
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
/** 卡牌类型：攻击 / 技能（选敌人）/ 技能（自身）/ 能力；技能（选敌人）= 目标为敌人且 asSkill */
type KindChoice = 'attack' | 'attackAll' | 'targetSkill' | 'allSkill' | 'selfSkill' | 'power'
const kindChoice = computed<KindChoice>({
  get: () => {
    const sp = current.value?.spec
    if (!sp) return 'attack'
    if (sp.target === 'power') return 'power'
    if (sp.target === 'self') return 'selfSkill'
    if (sp.target === 'allEnemies') return sp.asSkill ? 'allSkill' : 'attackAll'
    return sp.asSkill ? 'targetSkill' : 'attack'
  },
  set: (v) => {
    const sp = current.value?.spec
    if (!sp) return
    sp.target =
      v === 'power' ? 'power' : v === 'selfSkill' ? 'self' : v === 'attackAll' || v === 'allSkill' ? 'allEnemies' : 'enemy'
    if (v === 'targetSkill' || v === 'allSkill') sp.asSkill = true
    else delete sp.asSkill
  },
})
/** 可选数字特性：0 / 空 = 删除字段，保存出的代码里就不带这个调用 */
function optionalNumber(key: 'retainGrow' | 'grow' | 'freeIfParasiteTotal') {
  return computed({
    get: () => current.value?.spec[key] ?? 0,
    set: (v: number) => {
      const spec = current.value?.spec
      if (!spec) return
      if (Number(v) > 0) spec[key] = Math.floor(Number(v))
      else delete spec[key]
    },
  })
}
const retainGrow = optionalNumber('retainGrow')
const grow = optionalNumber('grow')
const freeParasite = optionalNumber('freeIfParasiteTotal')
/** 有剑意时免费：关闭 = 删除字段 */
const freeIntent = computed({
  get: () => !!current.value?.spec.freeIfSwordIntent,
  set: (on: boolean) => {
    const spec = current.value?.spec
    if (!spec) return
    if (on) spec.freeIfSwordIntent = true
    else delete spec.freeIfSwordIntent
  },
})

/** 成长：累计打出 plays 次后变成 into（战斗胜利时结算）；开启时默认指向自己，需要再改目标 */
const hasEvolve = computed({
  get: () => !!current.value?.spec.evolve,
  set: (on: boolean) => {
    const spec = current.value?.spec
    if (!spec) return
    if (on) spec.evolve = { plays: 10, into: spec.id }
    else delete spec.evolve
  },
})
const evolveTargetName = computed(() => {
  const into = current.value?.spec.evolve?.into
  return entries.value.find((e) => e.spec.id === into)?.spec.name
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
    if (on) spec.upgrade.effects = JSON.parse(JSON.stringify(spec.effects)) // 响应式代理不能 structuredClone
    else delete spec.upgrade.effects
  },
})
const upgradeText = computed({
  get: () => current.value?.spec.upgrade?.text ?? '',
  set: (v: string) => {
    const up = current.value?.spec.upgrade
    if (!up) return
    if (v === '') delete up.text
    else up.text = v
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
const upgradeRetain = computed({
  get: () => {
    const v = current.value?.spec.upgrade?.retain
    return v === undefined ? '' : String(v)
  },
  set: (v: string) => {
    const up = current.value?.spec.upgrade
    if (!up) return
    if (v === '') delete up.retain
    else up.retain = v === 'true'
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

/** 发布版：把与原版不同的卡整理成改动记录写入本机；和原版一致的不记 */
function persistOverrides() {
  saveCardOverrides(Object.fromEntries(entries.value.filter(modified).map((e) => [e.spec.id, e.spec])))
}

/** 发布版保存：改动存在本机，下次启动游戏时生效 */
function saveLocal(e: Entry) {
  // 经构建器过一遍，字段顺序与原版一致，才能准确判断“是否改过”；改坏了无法构建会在这里报错
  try {
    e.spec = Card.fromSpec(e.spec).spec()
  } catch (err) {
    message.value = { ok: false, text: `✘ 这张卡的数据无法使用：${(err as Error).message}` }
    return
  }
  e.saved = JSON.stringify(e.spec)
  persistOverrides()
  message.value = { ok: true, text: `✔ 已保存：${e.spec.name}（重启游戏后生效）` }
}

/** 发布版：把这张卡恢复成内置原版 */
function restoreCard(e: Entry) {
  e.spec = structuredClone(e.base)
  e.saved = JSON.stringify(e.spec)
  persistOverrides()
  message.value = { ok: true, text: `✔ 已还原：${e.spec.name}（重启游戏后生效）` }
}

/** 发布版：还原全部改动 */
function restoreAll() {
  if (!window.confirm('确定把所有卡牌还原成初始数据？你的改动会丢失。')) return
  entries.value.forEach((e) => {
    e.spec = structuredClone(e.base)
    e.saved = JSON.stringify(e.spec)
  })
  persistOverrides()
  message.value = { ok: true, text: '✔ 已还原全部卡牌（重启游戏后生效）' }
}

async function save(e: Entry) {
  if (!DEV) return saveLocal(e)
  saving.value = true
  message.value = null
  try {
    const res = await fetch('/__dev/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Card-Editor': '1' },
      body: JSON.stringify({ dir: e.dir, fromDir: e.fileDir, fromRarity: e.fileRarity, spec: e.spec }),
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
    e.fileDir = e.dir
    e.fileRarity = e.spec.rarity
    e.saved = JSON.stringify(e.spec)
    message.value = { ok: true, text: `✔ 已写入 ${e.dir}/${e.spec.rarity}.ts：${e.spec.name}` }
  } catch (err) {
    message.value = { ok: false, text: `✘ ${(err as Error).message}` }
  } finally {
    saving.value = false
  }
}

/** 把卡牌从源码里删掉（连同升级版）；被别处引用时服务端会拒绝 */
async function remove(e: Entry) {
  if (!window.confirm(`确定删除「${e.spec.name}」(${e.spec.id})？会直接改写源码，无法在这里撤销。`)) return
  saving.value = true
  message.value = null
  try {
    const res = await fetch('/__dev/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Card-Editor': '1' },
      body: JSON.stringify({ delete: true, dir: e.fileDir, rarity: e.fileRarity, id: e.spec.id }),
    })
    const raw = await res.text()
    let body: { ok: boolean; error?: string }
    try {
      body = JSON.parse(raw)
    } catch {
      throw new Error(`删除接口无响应（HTTP ${res.status}），请重启 pnpm dev 让编辑器插件生效`)
    }
    if (!body.ok) throw new Error(body.error ?? '删除失败')
    entries.value = entries.value.filter((x) => x !== e)
    if (selectedId.value === e.spec.id) selectedId.value = null
    message.value = { ok: true, text: `✔ 已删除：${e.spec.name}` }
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
      <span class="ed-title"><Emoji e="🛠" /> 卡牌编辑器</span>
      <span v-if="DEV" class="ed-tag">仅开发模式</span>
      <span v-if="DEV" class="ed-hint">保存会直接改写 src/data/cards 下的源码；不会自动刷新页面，要在游戏里看到效果请手动刷新（F5）</span>
      <span v-else class="ed-hint">只能调整已有卡牌，改动保存在本机，重启游戏后生效</span>
      <span v-if="message" class="ed-msg" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</span>
      <span v-if="dirtyCount" class="ed-dirty">{{ dirtyCount }} 张未保存</span>
      <button v-if="!DEV" class="ed-btn" :disabled="!entries.some(modified)" @click="restoreAll">全部还原</button>
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
            <span class="ed-item-icon"><Emoji :e="e.spec.icon" /></span>
            <span class="ed-item-main">
              <span class="ed-item-name">{{ e.spec.name }}</span>
              <span class="ed-item-sub">{{ dirLabel(e.dir) }} · {{ RARITY_SHORT[e.spec.rarity] }}</span>
            </span>
            <span v-if="!DEV && modified(e)" class="ed-dot" title="已修改（与初始数据不同）">✎</span>
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
              <span>职业（选择职业专属卡）</span>
              <select v-model="current.dir" class="ed-ctl" :disabled="!DEV">
                <option v-for="d in DIRS" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </label>
            <label class="ed-field">
              <span>稀有度</span>
              <select v-model="current.spec.rarity" class="ed-ctl" :disabled="!DEV">
                <option v-for="r in RARITIES" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </label>
            <label class="ed-field">
              <span>能量费用（数字或 X）</span>
              <input v-model="costText" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>卡牌类型</span>
              <select v-model="kindChoice" class="ed-ctl">
                <option value="attack">攻击（需选择敌人）</option>
                <option value="attackAll">攻击（全体敌人，无需选择目标）</option>
                <option value="targetSkill">技能（需选择敌人，不算攻击牌）</option>
                <option value="allSkill">技能（全体敌人，不算攻击牌）</option>
                <option value="selfSkill">技能（作用于自身）</option>
                <option value="power">能力（打出后持续生效）</option>
              </select>
            </label>
            <label class="ed-field">
              <span>初始牌组张数</span>
              <input v-model.number="current.spec.starter" type="number" min="0" class="ed-ctl" :disabled="!DEV" />
            </label>
          </div>
        </section>

        <section class="ed-card">
          <h3>特性</h3>
          <div class="ed-checks">
            <label><input v-model="current.spec.exhaust" type="checkbox" /> 消耗（打出后移出本场战斗）</label>
            <label><input v-model="current.spec.ethereal" type="checkbox" /> 虚无（回合结束时还在手牌中则消耗）</label>
            <label><input v-model="current.spec.retain" type="checkbox" /> 保留（回合结束时留在手牌）</label>
            <label><input v-model="current.spec.reward" type="checkbox" :disabled="!DEV" /> 加入奖励卡池</label>
            <label><input v-model="current.spec.unplayable" type="checkbox" /> 无法打出</label>
            <label><input v-model="current.spec.innate" type="checkbox" /> 固有（第一回合必定抽上手）</label>
            <label class="inline">
              蓄势：每保留一回合伤害 +
              <input v-model.number="retainGrow" type="number" min="0" class="ed-ctl ed-mini" />
            </label>
            <label class="inline">
              增量：每打出一次数值 +
              <input v-model.number="grow" type="number" min="0" class="ed-ctl ed-mini" />
            </label>
            <label class="inline">
              全场寄生合计 ≥ N 时免费
              <input v-model.number="freeParasite" type="number" min="0" class="ed-ctl ed-mini" />
            </label>
            <label><input v-model="freeIntent" type="checkbox" /> 有剑意时免费打出（要消耗剑意请再加一条「失去 1 层剑意」）</label>
            <label class="inline">
              回合结束时失去生命
              <input v-model.number="current.spec.endTurnLoseHp" type="number" min="0" class="ed-ctl ed-mini" />
            </label>
          </div>
          <p class="ed-note">0 / 空 = 不启用；蓄势会隐含保留；固有、保留会自动写进卡面文字</p>
        </section>

        <section class="ed-card">
          <h3>
            <label class="ed-switch"><input v-model="hasEvolve" type="checkbox" /> 成长 <small>累计打出若干次后，战斗胜利时变成另一张牌；攻击牌斩杀敌人时，持有「蜕变」会额外 +2 层</small></label>
          </h3>
          <div v-if="current.spec.evolve" class="ed-grid">
            <label class="ed-field">
              <span>累计打出次数</span>
              <input v-model.number="current.spec.evolve.plays" type="number" min="1" class="ed-ctl" />
            </label>
            <label class="ed-field">
              <span>成长为（卡牌 id）<template v-if="evolveTargetName"> · {{ evolveTargetName }}</template></span>
              <input v-model="current.spec.evolve.into" list="ed-evolve-targets" class="ed-ctl" />
              <datalist id="ed-evolve-targets">
                <option v-for="e in entries" :key="e.spec.id" :value="e.spec.id">{{ e.spec.name }}</option>
              </datalist>
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
              <label class="ed-field">
                <span>升级后是否保留</span>
                <select v-model="upgradeRetain" class="ed-ctl">
                  <option value="">不变</option>
                  <option value="true">改为保留</option>
                  <option value="false">改为不保留</option>
                </select>
              </label>
              <label class="ed-check-inline">
                <input v-model="upgradeReplacesEffects" type="checkbox" /> 自定义升级后的效果
              </label>
            </div>
            <CardEffectsEditor v-if="current.spec.upgrade.effects" v-model="current.spec.upgrade.effects" />
            <p v-else class="ed-note">未自定义时，升级版沿用原效果，只应用上面的费用 / 消耗 / 保留改动；不开启「升级版」则按系统规则自动提升数值。</p>
            <label class="ed-field upText">
              <span>升级版卡面文字（留空则自动生成）</span>
              <input v-model="upgradeText" class="ed-ctl full" />
            </label>
          </template>
        </section>

        <section class="ed-card">
          <h3>卡面文字 <small>留空则根据效果自动生成</small></h3>
          <input v-model="current.spec.text" placeholder="自定义描述文字" class="ed-ctl full" />
        </section>

        <div class="ed-bar">
          <button class="ed-btn primary" :disabled="saving || !dirty(current)" @click="save(current)">
            <template v-if="saving">保存中…</template><template v-else><Emoji e="💾" /> {{ DEV ? '保存到代码' : '保存' }}</template>
          </button>
          <button class="ed-btn" :disabled="!dirty(current)" @click="revert(current)">↩ 还原改动</button>
          <span v-if="!dirty(current)" class="ed-note">没有未保存的改动</span>
          <button v-if="DEV" class="ed-btn danger" :disabled="saving" @click="remove(current)"><Emoji e="🗑" /> 删除卡牌</button>
          <button v-else class="ed-btn danger" :disabled="!modified(current)" @click="restoreCard(current)">↺ 还原为初始数据</button>
        </div>
      </main>
      <main v-else class="ed-empty">← 从左侧选择一张卡牌开始编辑</main>

      <!-- 右：预览 -->
      <aside class="ed-preview">
        <div class="ed-preview-title">卡牌预览</div>
        <template v-if="preview">
          <div class="ed-preview-label">原卡</div>
          <div class="ed-preview-card">
            <CardView :card="preview.base" :playable="true" />
          </div>
          <div class="ed-preview-label">升级版<template v-if="preview.auto">（系统自动）</template></div>
          <div class="ed-preview-card">
            <CardView :card="preview.upgraded" :playable="true" />
          </div>
        </template>
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
.ed-checks + .ed-note,
.upText {
  margin-top: 10px;
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
.ed-btn.danger {
  margin-left: auto;
  color: #fecaca;
  background: #7f1d1d;
}
.ed-btn.danger:hover:not(:disabled) {
  background: #b91c1c;
}

/* 预览 */
.ed-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 260px;
  padding: 16px;
  overflow-y: auto;
  background: #111c31;
  border-left: 1px solid #334155;
}
.ed-preview-title {
  align-self: flex-start;
  font-weight: 700;
  color: #fbbf24;
}
.ed-preview-label {
  align-self: flex-start;
  font-size: 13px;
  color: #94a3b8;
}
.ed-preview-card {
  flex: none;
  width: 190px;
  height: 260px;
}
</style>
