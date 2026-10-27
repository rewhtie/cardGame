<script setup lang="ts">
import { toRaw } from 'vue'
import { STATUSES } from '@/engine/statuses'
import { cards } from '@/data/cards'
import type { Effect } from '@/engine/types'

/** 效果列表编辑器：直接就地修改传入的效果数组 */
const effects = defineModel<Effect[]>({ required: true })

const EFFECT_TYPES: { value: Effect['type']; label: string }[] = [
  { value: 'damage', label: '⚔️ 造成伤害' },
  { value: 'block', label: '🛡️ 获得格挡' },
  { value: 'draw', label: '🃏 抽牌' },
  { value: 'gainEnergy', label: '⚡ 获得能量' },
  { value: 'applyStatus', label: '✨ 状态 / buff（固定、按伤口、按寄生、倍增、代价…）' },
  { value: 'heal', label: '💚 回复生命' },
  { value: 'loseHp', label: '💔 失去生命' },
  { value: 'lifeOverload', label: '❤️‍🔥 生命降至1并获得999格挡' },
  { value: 'mentalOverload', label: '🧠 整局最大生命变1（极限、俱焚另加状态效果）' },
  { value: 'sensoryOverload', label: '🧠 按自己生成的状态牌施加裂伤和易伤' },
  { value: 'addCard', label: '🩹 置入牌（伤口 / 状态牌 / 诅咒…）' },
  { value: 'fetch', label: '🧲 捞取非伤口牌' },
  { value: 'consumeParasite', label: '🌱 消耗目标寄生层数' },
  { value: 'stealMaxHp', label: '🌿 偷取最大生命值' },
  { value: 'devourParasite', label: '🌱 吞食寄生层数（每层伤害）' },
  { value: 'parasiteBurst', label: '🌱 引爆目标寄生（等量伤害）' },
  { value: 'drawIfParasite', label: '🌱 寄生够数时抽牌' },
  { value: 'blockFromDamage', label: '🛡️ 按造成的伤害获得格挡' },
  { value: 'meltBlock', label: '🔥 熔化目标格挡' },
  { value: 'spreadParasite', label: '🌱 传播目标寄生' },
  { value: 'purgeSelfBuff', label: '🧹 随机移除自身一个状态并获得等量格挡' },
  { value: 'drawIfAttacks', label: '🃏 攻击够数时抽牌' },
  { value: 'choose', label: '👆 打出后选择（净化 / 复制 / 预知 / 发现 / 回收）' },
  { value: 'exhaustCards', label: '🔥 消耗指定牌堆中的牌（可限定类型 / 数量）' },
  { value: 'redraw', label: '🔄 弃手牌再抽' },
  { value: 'reshuffle', label: '🔀 弃牌堆洗入抽牌堆' },
  { value: 'blockByIntent', label: '🛡️ 按目标攻击意图获得格挡' },
  { value: 'goldIfKill', label: '💰 击杀目标获得金币' },
  { value: 'gainPotion', label: '🧪 获得随机药水' },
  { value: 'playTop', label: '🎴 打出抽牌堆顶的牌' },
  { value: 'convertCorpse', label: '☠️ 斩杀寄生敌人并转为随从' },
]
/** 所有「状态」类效果合并成一个入口，具体怎么算层数由「方式」选择 */
const STATUS_MODES: { value: Effect['type']; label: string }[] = [
  { value: 'applyStatus', label: '固定层数' },
  { value: 'woundStatus', label: '按伤口数' },
  { value: 'parasiteStatus', label: '按目标寄生层数' },
  { value: 'multiplyStatus', label: '目标状态层数倍增' },
  { value: 'sapStrength', label: '目标临时失去力量' },
  { value: 'penalty', label: '自身代价（下回合）' },
]
const STATUS_TYPES = new Set<string>(STATUS_MODES.map((m) => m.value))
const typeGroup = (t: string) => (STATUS_TYPES.has(t) ? 'applyStatus' : t)

/** 已被通用效果取代、不再提供新建，但老卡牌里还在用的效果 */
const LEGACY: Record<string, string> = {
  addWound: '🩹 置入伤口（旧）',
  exhaustWounds: '🔥 消耗伤口（旧）',
  exhaustStatusCard: '🗑️ 消耗手牌中的状态牌（旧）',
  overdraft: '📉 透支（旧）',
}

/** 可置入的牌：状态牌与诅咒牌 */
const INJECT_CARDS = Object.values(cards).filter((c) => c.rarity === 'status' || c.rarity === 'curse')

const GAINS = [
  { value: 'block', label: '格挡' },
  { value: 'gash', label: '裂伤（目标敌人）' },
  { value: 'gashAll', label: '裂伤（全体敌人）' },
  { value: 'draw', label: '抽牌' },
  { value: 'damage', label: '伤害（目标敌人）' },
  { value: 'damageAll', label: '伤害（全体敌人）' },
]

function newEffect(type: Effect['type']): Effect {
  switch (type) {
    case 'damage':
    case 'block':
    case 'gainEnergy':
    case 'heal':
    case 'loseHp':
    case 'overdraft':
      return { type, amount: 1 }
    case 'draw':
      return { type, count: 1 }
    case 'sensoryOverload':
      return { type, per: 2 }
    case 'woundStatus':
      return { type, status: 'gash', per: 1, to: 'allEnemies' }
    case 'exhaustStatusCard':
      return { type }
    case 'fetch':
      return { type, from: 'discard', count: 1 }
    case 'applyStatus':
      return { type, status: 'strength', stacks: 1, to: 'self' }
    case 'addCard':
      return { type, cardId: 'wound', count: 1, to: 'discard' }
    case 'penalty':
      return { type, stat: 'energy', amount: 1 }
    case 'addWound':
      return { type, count: 1 }
    case 'drawIfAttacks':
      return { type, min: 3, count: 1 }
    case 'multiplyStatus':
      return { type, status: 'poison', factor: 2 }
    case 'convertCorpse':
    case 'parasiteBurst':
    case 'meltBlock':
    case 'blockFromDamage':
    case 'spreadParasite':
    case 'purgeSelfBuff':
    case 'reshuffle':
    case 'blockByIntent':
    case 'lifeOverload':
    case 'mentalOverload':
    case 'gainPotion':
    case 'playTop':
      return { type }
    case 'choose':
      return { type, mode: 'exhaust', count: 3 }
    case 'exhaustCards':
      return { type, from: 'hand', kind: 'status' }
    case 'redraw':
      return { type, extra: 0 }
    case 'goldIfKill':
      return { type, gold: 25 }
    case 'drawIfParasite':
      return { type, min: 10, count: 1 }
    case 'devourParasite':
      return { type, max: 4, per: 3 }
    case 'parasiteStatus':
      return { type, status: 'poison', divisor: 1 }
    case 'stealMaxHp':
    case 'sapStrength':
    case 'consumeParasite':
      return { type, amount: 1 }
    case 'exhaustWounds':
      return { type, from: 'hand', gain: 'block', per: 1 }
  }
}

type DamageEffect = Extract<Effect, { type: 'damage' }>
type DamageMode =
  | 'normal'
  | 'perStack'
  | 'perTargetStatus'
  | 'maxHpPct'
  | 'ifTargetBlock'
  | 'perAttackPlayed'
  | 'lowHp'
  | 'woundBonus'
  | 'buffTotal'

/** 伤害的计算方式互斥（代码生成只认其中一种），切换时清掉其余字段 */
const DAMAGE_MODES: { value: DamageMode; label: string }[] = [
  { value: 'normal', label: '固定数值（可多段 / ×X）' },
  { value: 'perStack', label: '消耗自身状态层数加成' },
  { value: 'perTargetStatus', label: '按目标状态层数加成（可翻倍 / 清除）' },
  { value: 'maxHpPct', label: '按最大生命值百分比' },
  { value: 'ifTargetBlock', label: '目标有格挡时加成' },
  { value: 'perAttackPlayed', label: '按本回合已打出攻击牌数' },
  { value: 'lowHp', label: '生命不高于一半时改用数值' },
  { value: 'woundBonus', label: '按牌堆中伤口数加成' },
  { value: 'buffTotal', label: '按场上增益层数总和' },
]
const DAMAGE_MODE_KEYS = [
  'perX',
  'hits',
  'perStack',
  'perTargetStatus',
  'maxHpPct',
  'ifTargetBlock',
  'perAttackPlayed',
  'lowHp',
  'woundBonus',
  'buffTotal',
] as const

function damageMode(e: DamageEffect): DamageMode {
  if (e.perStack) return 'perStack'
  if (e.perTargetStatus) return 'perTargetStatus'
  if (e.maxHpPct !== undefined) return 'maxHpPct'
  if (e.ifTargetBlock) return 'ifTargetBlock'
  if (e.perAttackPlayed) return 'perAttackPlayed'
  if (e.lowHp) return 'lowHp'
  if (e.woundBonus !== undefined) return 'woundBonus'
  if (e.buffTotal) return 'buffTotal'
  return 'normal'
}

function setDamageMode(e: DamageEffect, mode: DamageMode) {
  for (const k of DAMAGE_MODE_KEYS) delete e[k]
  switch (mode) {
    case 'perStack':
      e.perStack = { status: 'strength', per: 1 }
      break
    case 'perTargetStatus':
      e.perTargetStatus = { status: 'poison', per: 1 }
      break
    case 'maxHpPct':
      e.maxHpPct = 10
      e.amount = 0
      break
    case 'ifTargetBlock':
      e.ifTargetBlock = { bonus: 3 }
      break
    case 'perAttackPlayed':
      e.perAttackPlayed = { per: 1 }
      break
    case 'lowHp':
      e.lowHp = { amount: e.amount * 2 }
      break
    case 'woundBonus':
      e.woundBonus = 1
      break
    case 'buffTotal':
      e.buffTotal = true
      break
  }
}

const AMOUNT_LABELS: Partial<Record<DamageMode, string>> = {
  perStack: '基础伤害',
  perTargetStatus: '基础伤害',
  ifTargetBlock: '基础伤害',
  perAttackPlayed: '基础伤害',
  lowHp: '正常伤害',
  woundBonus: '基础伤害',
  buffTotal: '无增益时伤害',
}
const amountLabel = (e: DamageEffect) => AMOUNT_LABELS[damageMode(e)] ?? '数值'

/** 段数 1 等同于没有：不写入字段，避免保存出多余的 hits */
function setHits(e: DamageEffect, raw: string) {
  const n = Math.floor(Number(raw))
  if (n > 1) e.hits = n
  else delete e.hits
}

/** 数量留空 = 不写 count 字段（表示全部） */
function setCount(e: { count?: number }, raw: string) {
  const n = Math.floor(Number(raw))
  if (raw.trim() !== '' && n >= 1) e.count = n
  else delete e.count
}

function togglePerCard(e: { perCard?: Effect[] }, on: boolean) {
  if (on) e.perCard = [{ type: 'damage', amount: 6 }]
  else delete e.perCard
}

/** 切换状态方式：保留已选的状态和对象 */
const setMode = (i: number, e: Event) => {
  const old = effects.value[i] as Record<string, unknown>
  const next = newEffect((e.target as HTMLSelectElement).value as Effect['type']) as Record<string, unknown>
  if (typeof old.status === 'string' && 'status' in next) next.status = old.status
  if (typeof old.to === 'string' && 'to' in next) next.to = old.to
  effects.value[i] = next as Effect
}

const setType = (i: number, e: Event) => {
  effects.value[i] = newEffect((e.target as HTMLSelectElement).value as Effect['type'])
}
const add = () => effects.value.push(newEffect('damage'))
const remove = (i: number) => effects.value.splice(i, 1)
const duplicate = (i: number) => effects.value.splice(i + 1, 0, structuredClone(toRaw(effects.value[i]!)))
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

      <select :value="typeGroup(eff.type)" class="fx-ctl fx-type" @change="setType(i, $event)">
        <option v-for="t in EFFECT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        <option v-if="LEGACY[eff.type]" :value="eff.type">{{ LEGACY[eff.type] }}</option>
      </select>

      <label v-if="STATUS_TYPES.has(eff.type)" class="fx-field">
        <span>方式</span>
        <select :value="eff.type" class="fx-ctl" @change="setMode(i, $event)">
          <option v-for="m in STATUS_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>

      <template v-if="eff.type === 'addCard'">
        <label class="fx-field">
          <span>牌</span>
          <select v-model="eff.cardId" class="fx-ctl">
            <option v-for="c in INJECT_CARDS" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>数量</span>
          <input v-model.number="eff.count" type="number" min="1" class="fx-ctl fx-num" />
        </label>
        <label class="fx-field">
          <span>置入</span>
          <select v-model="eff.to" class="fx-ctl">
            <option value="discard">弃牌堆</option>
            <option value="draw">抽牌堆（随机位置）</option>
            <option value="hand">手牌</option>
          </select>
        </label>
      </template>

      <template v-else-if="eff.type === 'penalty'">
        <label class="fx-field">
          <span>代价</span>
          <select v-model="eff.stat" class="fx-ctl">
            <option value="energy">下回合能量减少</option>
            <option value="draw">下回合少抽牌</option>
            <option value="strength">临时失去力量</option>
            <option value="dexterity">临时失去敏捷</option>
          </select>
        </label>
        <label class="fx-field">
          <span>数值</span>
          <input v-model.number="eff.amount" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <label v-else-if="eff.type === 'draw' || eff.type === 'addWound'" class="fx-field">
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
          <span>方式</span>
          <select
            class="fx-ctl"
            :value="eff.stacks < 0 ? 'lose' : 'gain'"
            @change="eff.stacks = (($event.target as HTMLSelectElement).value === 'lose' ? -1 : 1) * Math.abs(eff.stacks || 1)"
          >
            <option value="gain">获得 / 给予</option>
            <option value="lose">失去</option>
          </select>
        </label>
        <label class="fx-field">
          <span>层数</span>
          <input
            :value="Math.abs(eff.stacks)"
            type="number"
            min="1"
            class="fx-ctl fx-num"
            @input="eff.stacks = (eff.stacks < 0 ? -1 : 1) * Math.abs(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label class="fx-field">
          <span>对象</span>
          <select v-model="eff.to" class="fx-ctl">
            <option value="self">自身</option>
            <option value="target">选中的敌人</option>
            <option value="allEnemies">全体敌人</option>
          </select>
        </label>
        <label v-if="eff.to === 'self' && eff.stacks > 0" class="fx-check" title="层数在玩家回合结束时失去">
          <input v-model="eff.temp" type="checkbox" /> 临时（回合结束失去）
        </label>
      </template>

      <template v-else-if="eff.type === 'woundStatus'">
        <label class="fx-field">
          <span>状态</span>
          <select v-model="eff.status" class="fx-ctl">
            <option v-for="st in STATUSES" :key="st.id" :value="st.id">{{ st.icon }} {{ st.name }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>每张伤口</span>
          <input v-model.number="eff.per" type="number" min="0" class="fx-ctl fx-num" />
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

      <template v-else-if="eff.type === 'fetch'">
        <label class="fx-field">
          <span>来源</span>
          <select v-model="eff.from" class="fx-ctl">
            <option value="discard">弃牌堆（最近的）</option>
            <option value="draw">抽牌堆（顶部的）</option>
          </select>
        </label>
        <label class="fx-field">
          <span>数量</span>
          <input v-model.number="eff.count" type="number" min="0" class="fx-ctl fx-num" />
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

      <template v-else-if="eff.type === 'choose'">
        <label class="fx-field">
          <span>方式</span>
          <select v-model="eff.mode" class="fx-ctl">
            <option value="exhaust">选手牌消耗</option>
            <option value="copy">复制一张手牌</option>
            <option value="scry">查看抽牌堆顶</option>
            <option value="retrieve">从弃牌堆选牌放回手牌</option>
            <option value="discover">发现（3 选 1）</option>
          </select>
        </label>
        <label class="fx-field">
          <span>数量</span>
          <input v-model.number="eff.count" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>
      <template v-else-if="eff.type === 'exhaustCards'">
        <label class="fx-field">
          <span>牌堆</span>
          <select v-model="eff.from" class="fx-ctl">
            <option value="hand">手牌</option>
            <option value="draw">抽牌堆</option>
            <option value="discard">弃牌堆</option>
            <option value="all">所有（手牌 + 抽牌堆 + 弃牌堆）</option>
          </select>
        </label>
        <label class="fx-field">
          <span>牌的类型</span>
          <select v-model="eff.kind" class="fx-ctl">
            <option value="status">状态牌（含伤口）</option>
            <option value="wound">仅伤口</option>
            <option value="curse">诅咒牌</option>
            <option value="other">其他牌（非状态 / 诅咒）</option>
            <option value="any">任意牌</option>
          </select>
        </label>
        <label class="fx-field" title="留空 = 符合条件的全部">
          <span>数量（留空 = 全部）</span>
          <input :value="eff.count ?? ''" type="number" min="1" placeholder="全部" class="fx-ctl fx-num" @input="setCount(eff, ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="fx-check" title="每消耗一张牌，就结算一遍下面的效果">
          <input :checked="!!eff.perCard" type="checkbox" @change="togglePerCard(eff, ($event.target as HTMLInputElement).checked)" /> 每消耗一张触发效果
        </label>
        <div v-if="eff.perCard" class="fx-sub">
          <span class="fx-sub-label">每消耗 1 张牌：</span>
          <CardEffectsEditor v-model="eff.perCard" />
        </div>
      </template>
      <label v-else-if="eff.type === 'sensoryOverload'" class="fx-field">
        <span>每张自己生成的状态牌，裂伤和易伤各增加</span>
        <input v-model.number="eff.per" type="number" min="0" class="fx-ctl fx-num" />
      </label>
      <label v-else-if="eff.type === 'redraw'" class="fx-field">
        <span>额外多抽</span>
        <input v-model.number="eff.extra" type="number" min="0" class="fx-ctl fx-num" />
      </label>
      <label v-else-if="eff.type === 'goldIfKill'" class="fx-field">
        <span>金币</span>
        <input v-model.number="eff.gold" type="number" min="0" class="fx-ctl fx-num" />
      </label>

      <span v-else-if="eff.type === 'reshuffle' || eff.type === 'blockByIntent' || eff.type === 'lifeOverload' || eff.type === 'mentalOverload' || eff.type === 'gainPotion' || eff.type === 'playTop' || eff.type === 'convertCorpse' || eff.type === 'exhaustStatusCard' || eff.type === 'parasiteBurst' || eff.type === 'spreadParasite' || eff.type === 'purgeSelfBuff' || eff.type === 'meltBlock' || eff.type === 'blockFromDamage'" class="fx-empty">无参数</span>

      <template v-else-if="eff.type === 'devourParasite'">
        <label class="fx-field">
          <span>至多消耗层数</span>
          <input v-model.number="eff.max" type="number" min="1" class="fx-ctl fx-num" />
        </label>
        <label class="fx-field">
          <span>每层伤害</span>
          <input v-model.number="eff.per" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else-if="eff.type === 'drawIfParasite'">
        <label class="fx-field">
          <span>寄生总层数 ≥</span>
          <input v-model.number="eff.min" type="number" min="1" class="fx-ctl fx-num" />
        </label>
        <label class="fx-field">
          <span>抽牌数</span>
          <input v-model.number="eff.count" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else-if="eff.type === 'parasiteStatus'">
        <label class="fx-field">
          <span>状态</span>
          <select v-model="eff.status" class="fx-ctl">
            <option v-for="d in STATUSES" :key="d.id" :value="d.id">{{ d.icon }} {{ d.name }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>层数 ÷</span>
          <input v-model.number="eff.divisor" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else-if="eff.type === 'drawIfAttacks'">
        <label class="fx-field">
          <span>攻击牌 ≥</span>
          <input v-model.number="eff.min" type="number" min="1" class="fx-ctl fx-num" />
        </label>
        <label class="fx-field">
          <span>抽牌数</span>
          <input v-model.number="eff.count" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else-if="eff.type === 'multiplyStatus'">
        <label class="fx-field">
          <span>目标状态</span>
          <select v-model="eff.status" class="fx-ctl">
            <option v-for="d in STATUSES" :key="d.id" :value="d.id">{{ d.icon }} {{ d.name }}</option>
          </select>
        </label>
        <label class="fx-field">
          <span>层数 ×</span>
          <input v-model.number="eff.factor" type="number" min="1" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else-if="eff.type === 'damage'">
        <label class="fx-field" title="决定伤害怎么算；同一条伤害只能选一种">
          <span>伤害方式</span>
          <select :value="damageMode(eff)" class="fx-ctl" @change="setDamageMode(eff, ($event.target as HTMLSelectElement).value as DamageMode)">
            <option v-for="m in DAMAGE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </label>

        <label v-if="eff.maxHpPct === undefined" class="fx-field">
          <span>{{ amountLabel(eff) }}</span>
          <input v-model.number="eff.amount" type="number" class="fx-ctl fx-num" />
        </label>

        <template v-if="damageMode(eff) === 'normal'">
          <label class="fx-check" title="数值乘以消耗的能量 X">
            <input v-model="eff.perX" type="checkbox" /> × X（按能量倍乘）
          </label>
          <label v-if="!eff.perX" class="fx-field" title="同一数值连续打几次，每段单独结算力量 / 易伤 / 格挡（卡面写作「N 点伤害 ×M」）">
            <span>多段 ×</span>
            <input :value="eff.hits ?? 1" type="number" min="1" class="fx-ctl fx-num" @input="setHits(eff, ($event.target as HTMLInputElement).value)" />
          </label>
          <span v-if="(eff.hits ?? 1) > 1 && !eff.perX" class="fx-sum">合计 {{ eff.amount * (eff.hits ?? 1) }}（未计力量等）</span>
        </template>

        <label v-if="eff.perStack" class="fx-field">
          <span>自身状态（打完清零）</span>
          <select v-model="eff.perStack.status" class="fx-ctl">
            <option v-for="st in STATUSES" :key="st.id" :value="st.id">{{ st.icon }} {{ st.name }}</option>
          </select>
        </label>
        <label v-if="eff.perStack" class="fx-field">
          <span>每层 +</span>
          <input v-model.number="eff.perStack.per" type="number" class="fx-ctl fx-num" />
        </label>

        <label v-if="eff.perTargetStatus" class="fx-field">
          <span>目标状态</span>
          <select v-model="eff.perTargetStatus.status" class="fx-ctl">
            <option v-for="st in STATUSES" :key="st.id" :value="st.id">{{ st.icon }} {{ st.name }}</option>
          </select>
        </label>
        <label v-if="eff.perTargetStatus" class="fx-field">
          <span>每层 +</span>
          <input v-model.number="eff.perTargetStatus.per" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.perTargetStatus" class="fx-field">
          <span>结算后</span>
          <select v-model="eff.perTargetStatus.after" class="fx-ctl">
            <option :value="undefined">层数翻倍</option>
            <option value="clear">清除该状态</option>
            <option value="keep">保持不变</option>
          </select>
        </label>

        <label v-if="eff.maxHpPct !== undefined" class="fx-field">
          <span>最大生命的 %</span>
          <input v-model.number="eff.maxHpPct" type="number" min="1" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.ifTargetBlock" class="fx-field">
          <span>目标有格挡时 +</span>
          <input v-model.number="eff.ifTargetBlock.bonus" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.perAttackPlayed" class="fx-field">
          <span>每张攻击牌 +</span>
          <input v-model.number="eff.perAttackPlayed.per" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.lowHp" class="fx-field">
          <span>生命 ≤ 一半时伤害</span>
          <input v-model.number="eff.lowHp.amount" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.woundBonus !== undefined" class="fx-field">
          <span>每张伤口 +</span>
          <input v-model.number="eff.woundBonus" type="number" min="0" class="fx-ctl fx-num" />
        </label>
      </template>

      <template v-else>
        <label class="fx-field">
          <span>数值</span>
          <input v-model.number="eff.amount" type="number" class="fx-ctl fx-num" />
        </label>
        <label v-if="eff.type === 'block'" class="fx-check" title="数值乘以消耗的能量 X">
          <input v-model="eff.perX" type="checkbox" /> × X（按能量倍乘）
        </label>
      </template>

      <span class="fx-actions">
        <button class="fx-btn" title="上移" @click="move(i, -1)">▲</button>
        <button class="fx-btn" title="下移" @click="move(i, 1)">▼</button>
        <button class="fx-btn" title="复制这条效果" @click="duplicate(i)">⧉</button>
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
  align-self: flex-end;
  margin-bottom: 5px;
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
  align-self: flex-end;
  height: 30px;
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
  align-self: flex-end;
  min-width: 150px;
  font-weight: 600;
}
.fx-num {
  width: 72px;
}
.fx-sum {
  display: flex;
  align-items: center;
  align-self: flex-end;
  height: 30px;
  font-size: 12px;
  color: #fbbf24;
}
.fx-sub {
  flex-basis: 100%;
  padding: 8px 10px;
  background: #162033;
  border-left: 3px solid #92710f;
  border-radius: 6px;
}
.fx-sub-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #fbbf24;
}
.fx-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
  align-self: flex-end;
}
.fx-row > .fx-empty {
  display: flex;
  align-items: center;
  align-self: flex-end;
  height: 30px;
  padding: 0 4px;
  border: 0;
}
.fx-btn {
  width: 30px;
  height: 30px;
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
