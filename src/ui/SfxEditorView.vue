<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { useDevHotState } from '@/composables/useDevHotState'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { sfxMap } from '@/data/sfxMap'
import { SFX_SLOTS } from '@/data/sfxSlots'
import { slotStatus, type SfxMap, type SlotConfig, type SlotStatus } from '@/composables/sfxResolve'
import {
  playSfx,
  registerSfxPreview,
  setSfxDraft,
  sfxLibrary,
  sfxUrl,
  sfxVolume,
  unregisterSfxPreview,
} from '@/composables/useSfx'
import SfxScene from './SfxScene.vue'

const emit = defineEmits<{ close: [] }>()

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const draft = ref<SfxMap>(clone(sfxMap))
/** 上次保存 / 载入时的快照，用于判断每个槽位是否有未保存改动 */
const saved = ref<SfxMap>(clone(sfxMap))
/** 已选但尚未写盘的导入文件：保存时才上传 */
const pending = ref<Record<string, { dataBase64: string; url: string }>>({})

const selected = ref(SFX_SLOTS[0]!.key)
const onlyMissing = ref(false)
const search = ref('')
const replayKey = ref(0)
const message = ref<{ ok: boolean; text: string } | null>(null)
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const STATUS_LABEL: Record<SlotStatus, string> = { configured: '已配', missing: '未配', silent: '静音' }
const status = (key: string) => slotStatus(draft.value, key)
const isDirty = (key: string) =>
  JSON.stringify(draft.value[key] ?? null) !== JSON.stringify(saved.value[key] ?? null)
const dirtyCount = computed(() => SFX_SLOTS.filter((s) => isDirty(s.key)).length)
const missingCount = computed(() => SFX_SLOTS.filter((s) => status(s.key) === 'missing').length)

const groups = computed(() => {
  const out: { group: string; slots: typeof SFX_SLOTS }[] = []
  for (const s of SFX_SLOTS) {
    if (onlyMissing.value && status(s.key) !== 'missing') continue
    if (search.value && !s.label.includes(search.value) && !s.key.includes(search.value)) continue
    let g = out.find((x) => x.group === s.group)
    if (!g) out.push((g = { group: s.group, slots: [] }))
    g.slots.push(s)
  }
  // 未配的排在组内前面
  for (const g of out)
    g.slots = [...g.slots].sort(
      (a, b) => Number(status(b.key) === 'missing') - Number(status(a.key) === 'missing'),
    )
  return out
})

const slotDef = computed(() => SFX_SLOTS.find((s) => s.key === selected.value)!)
const config = computed<SlotConfig>(() => draft.value[selected.value] ?? {})
/** 本次会话保存过的导入文件：sfxLibrary 是启动时算好的常量，没整页刷新时靠它让新文件留在列表里 */
const savedImports = ref<string[]>([])

if (useDevHotState(import.meta.hot, 'sfx-editor', {
  draft, saved, pending, selected, onlyMissing, search, savedImports, message,
})) {
  for (const [name, p] of Object.entries(pending.value)) {
    p.url = `data:audio/${name.endsWith('.mp3') ? 'mpeg' : name.endsWith('.wav') ? 'wav' : 'ogg'};base64,${p.dataBase64}`
    registerSfxPreview(name, p.url)
  }
}
const library = computed(() =>
  [...new Set([...sfxLibrary, ...savedImports.value, ...Object.keys(pending.value)])].sort(),
)

/** 每次改动同步给播放层：场景重播、试听用的都是草稿 */
watch(draft, (d) => setSfxDraft(clone(d)), { deep: true, immediate: true })

function patch(change: Partial<SlotConfig>) {
  const next: SlotConfig = { ...config.value, ...change }
  for (const k of Object.keys(next) as (keyof SlotConfig)[]) {
    const v = next[k]
    if (v === undefined || v === false || (Array.isArray(v) && !v.length)) delete next[k]
  }
  if (Object.keys(next).length) draft.value[selected.value] = next
  else delete draft.value[selected.value]
}

const has = (f: string) => config.value.files?.includes(f) ?? false
function toggleFile(f: string) {
  const files = config.value.files ?? []
  patch({ files: has(f) ? files.filter((x) => x !== f) : [...files, f] })
}
function onNumber(field: 'volume' | 'maxSeconds', e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  const n = Number(raw)
  patch({ [field]: raw === '' || !Number.isFinite(n) ? undefined : n })
}
const toggleSilent = () => patch({ silent: !config.value.silent })
/** 有内置合成音的槽位 */
const SYNTH_SLOTS: Record<string, 'split' | 'evolve' | 'train' | 'burn'> = {
  'battle.enemy.split': 'split',
  'run.evolve': 'evolve',
  'run.train': 'train',
  'run.cardRemoved': 'burn',
}
const restoreSynth = () => patch({ files: undefined, synth: SYNTH_SLOTS[selected.value], silent: undefined })

function audition(name: string) {
  const url = sfxUrl(name)
  if (!url) return
  const a = new Audio(url)
  a.volume = sfxVolume.value
  void a.play()
}
const replay = () => replayKey.value++
const playSlot = () => void playSfx(selected.value)

function cleanName(raw: string): string {
  const dot = raw.lastIndexOf('.')
  const ext = raw.slice(dot).toLowerCase()
  const stem = raw.slice(0, dot).replace(/[^A-Za-z0-9_-]/g, '') || 'sfx'
  let name = `${stem}${ext}`
  for (let n = 2; library.value.some((l) => l.toLowerCase() === name.toLowerCase()); n++) name = `${stem}-${n}${ext}`
  return name
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  for (const file of Array.from(input.files ?? [])) {
    if (!/\.(ogg|mp3|wav)$/i.test(file.name)) {
      message.value = { ok: false, text: `不支持的格式：${file.name}（仅 ogg / mp3 / wav）` }
      continue
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const name = cleanName(file.name)
    const url = URL.createObjectURL(file)
    registerSfxPreview(name, url)
    pending.value[name] = { dataBase64: btoa(bin), url }
    // 导入后直接加入当前槽位，省一步点选
    patch({ files: [...(config.value.files ?? []), name], silent: undefined })
  }
  input.value = ''
}

async function save() {
  saving.value = true
  message.value = null
  try {
    const used = new Set(Object.values(draft.value).flatMap((c) => c.files ?? []))
    const imports = Object.entries(pending.value)
      .filter(([name]) => used.has(name))
      .map(([name, p]) => ({ name, dataBase64: p.dataBase64 }))
    const res = await fetch('/__dev/sfx', {
      method: 'POST',
      headers: { 'x-sfx-editor': '1' },
      body: JSON.stringify({ map: draft.value, imports }),
    })
    const json = (await res.json()) as { ok: boolean; error?: string; renamed?: Record<string, string> }
    if (!res.ok || !json.ok) throw new Error(json.error ?? `保存失败（${res.status}）`)
    const renamed = json.renamed ?? {}
    for (const c of Object.values(draft.value)) if (c.files) c.files = c.files.map((f) => renamed[f] ?? f)
    // 保存后文件还没被 glob 收录前，用原来的 blob 地址继续试听
    for (const [old, final] of Object.entries(renamed)) {
      const p = pending.value[old]
      if (p) {
        registerSfxPreview(final, p.url)
        savedImports.value.push(final)
      }
    }
    pending.value = {}
    saved.value = clone(draft.value)
    message.value = { ok: true, text: '已保存，写入 src/data/sfxMap.ts' }
  } catch (err) {
    message.value = { ok: false, text: (err as Error).message }
  } finally {
    saving.value = false
  }
}

function discard() {
  if (!dirtyCount.value || !confirm('放弃所有未保存的改动？')) return
  for (const name of Object.keys(pending.value)) unregisterSfxPreview(name)
  pending.value = {}
  draft.value = clone(saved.value)
}

function close() {
  if (dirtyCount.value && !confirm(`还有 ${dirtyCount.value} 个槽位未保存，确定关闭？`)) return
  emit('close')
}

onBeforeUnmount(() => {
  setSfxDraft(null)
  for (const name of Object.keys(pending.value)) unregisterSfxPreview(name)
})
</script>

<template>
  <div class="ed">
    <header class="ed-head">
      <span class="ed-title"><Emoji e="🔊" /> 音效编辑器</span>
      <span class="ed-tag">仅开发模式</span>
      <span class="ed-hint">保存后改写 src/data/sfxMap.ts 并把导入文件放进 src/assets/sfx</span>
      <span v-if="message" class="ed-msg" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</span>
      <span class="ed-spacer" />
      <span v-if="missingCount" class="ed-miss">{{ missingCount }} 个未配</span>
      <span v-if="dirtyCount" class="ed-dirty">{{ dirtyCount }} 个未保存</span>
      <button class="ed-btn" :disabled="!dirtyCount" @click="discard">放弃</button>
      <button class="ed-btn primary" :disabled="!dirtyCount || saving" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <button class="ed-btn" @click="close">关闭</button>
    </header>

    <div class="ed-body">
      <aside class="ed-list">
        <input v-model="search" class="ed-input" placeholder="搜索槽位" />
        <label class="ed-check"><input v-model="onlyMissing" type="checkbox" /> 只看未配</label>
        <div v-for="g in groups" :key="g.group" class="ed-group">
          <div class="ed-group-name">{{ g.group }}</div>
          <button
            v-for="s in g.slots"
            :key="s.key"
            class="ed-item"
            :class="{ on: s.key === selected }"
            @click="selected = s.key"
          >
            <span class="dot" :class="status(s.key)" :title="STATUS_LABEL[status(s.key)]" />
            <span class="ed-item-name">{{ s.label }}</span>
            <span v-if="isDirty(s.key)" class="ed-mark" title="未保存">●</span>
          </button>
        </div>
      </aside>

      <main class="ed-main">
        <div class="ed-slot-head">
          <b>{{ slotDef.label }}</b>
          <code>{{ slotDef.key }}</code>
          <span class="badge" :class="status(slotDef.key)">{{ STATUS_LABEL[status(slotDef.key)] }}</span>
          <span class="ed-spacer" />
          <button class="ed-btn primary" @click="replay">▶ 重播动画</button>
          <button class="ed-btn" @click="playSlot">只听声音</button>
        </div>

        <SfxScene :slot-key="selected" :replay-key="replayKey" />

        <section class="ed-card">
          <h4>当前槽位用的文件</h4>
          <p v-if="config.synth && !config.files?.length" class="ed-note">
            现在用的是内置合成音；选了文件后会改用文件。
          </p>
          <p v-if="!config.files?.length && !config.synth" class="ed-note">还没有文件，从下面的音效库里勾选或导入。</p>
          <div v-for="f in config.files ?? []" :key="f" class="ed-file">
            <button class="ed-btn sm" @click="audition(f)">▶</button>
            <span class="ed-file-name">{{ f }}</span>
            <span v-if="pending[f]" class="ed-new">新导入</span>
            <button class="ed-btn sm" @click="toggleFile(f)">移除</button>
          </div>
          <div class="ed-row">
            <label>音量 <input class="ed-num" :value="config.volume ?? ''" placeholder="1" @change="onNumber('volume', $event)" /></label>
            <label>最长秒数 <input class="ed-num" :value="config.maxSeconds ?? ''" placeholder="不截取" @change="onNumber('maxSeconds', $event)" /></label>
            <label class="ed-check"><input type="checkbox" :checked="config.silent" @change="toggleSilent" /> 设为静音</label>
            <button v-if="slotDef.key in SYNTH_SLOTS" class="ed-btn sm" @click="restoreSynth">恢复合成音</button>
          </div>
        </section>

        <section class="ed-card">
          <h4>
            音效库
            <button class="ed-btn sm" @click="fileInput?.click()">导入文件…</button>
            <input ref="fileInput" type="file" accept=".ogg,.mp3,.wav,audio/*" multiple hidden @change="onImport" />
          </h4>
          <div class="ed-lib">
            <div v-for="f in library" :key="f" class="ed-file">
              <button class="ed-btn sm" @click="audition(f)">▶</button>
              <label class="ed-file-name"><input type="checkbox" :checked="has(f)" @change="toggleFile(f)" /> {{ f }}</label>
              <span v-if="pending[f]" class="ed-new">新导入</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.ed { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; color: #e2e8f0; font-size: 14px; background: #0f172a; }
.ed-head { display: flex; align-items: center; gap: 12px; padding: 10px 18px; background: #1e293b; border-bottom: 1px solid #334155; }
.ed-title { font-size: 18px; font-weight: 700; }
.ed-tag { padding: 1px 8px; border-radius: 999px; background: #78350f; color: #fde68a; font-size: 12px; }
.ed-hint { color: #94a3b8; font-size: 12px; }
.ed-msg.ok { color: #4ade80; }
.ed-msg.err { color: #f87171; }
.ed-spacer { flex: 1; }
.ed-miss { color: #f87171; }
.ed-dirty { color: #fbbf24; }
.ed-btn { padding: 5px 12px; border: 1px solid #475569; border-radius: 6px; background: #334155; color: inherit; cursor: pointer; }
.ed-btn:hover:not(:disabled) { background: #475569; }
.ed-btn:disabled { opacity: 0.4; cursor: default; }
.ed-btn.primary { background: #059669; border-color: #059669; }
.ed-btn.sm { padding: 1px 8px; font-size: 12px; }
.ed-body { flex: 1; display: flex; min-height: 0; }
.ed-list { width: 230px; overflow-y: auto; padding: 8px; border-right: 1px solid #334155; display: flex; flex-direction: column; gap: 4px; }
.ed-input, .ed-num { padding: 4px 8px; border: 1px solid #475569; border-radius: 6px; background: #0f172a; color: inherit; }
.ed-num { width: 80px; }
.ed-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #cbd5e1; }
.ed-group-name { margin-top: 8px; font-size: 12px; color: #94a3b8; }
.ed-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 6px; border: 0; border-radius: 4px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.ed-item:hover { background: #1e293b; }
.ed-item.on { background: #334155; }
.ed-item-name { flex: 1; }
.ed-mark { color: #fbbf24; font-size: 10px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.configured, .badge.configured { background: #22c55e; }
.dot.missing, .badge.missing { background: #ef4444; }
.dot.silent, .badge.silent { background: #64748b; }
.ed-main { flex: 1; overflow-y: auto; padding: 8px 8px 24px; display: flex; flex-direction: column; gap: 10px; }
.ed-slot-head { display: flex; align-items: center; gap: 10px; }
.ed-slot-head code { color: #94a3b8; font-size: 12px; }
.badge { padding: 0 8px; border-radius: 999px; font-size: 12px; color: #0f172a; }
.ed-card { padding: 10px 12px; border: 1px solid #334155; border-radius: 8px; background: #111c33; }
.ed-card h4 { margin: 0 0 8px; display: flex; align-items: center; gap: 10px; }
.ed-note { margin: 0 0 6px; color: #94a3b8; font-size: 12px; }
.ed-row { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
.ed-file { display: flex; align-items: center; gap: 8px; padding: 1px 0; }
.ed-file-name { flex: 1; font-size: 13px; }
.ed-new { color: #38bdf8; font-size: 12px; }
.ed-lib { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 16px; max-height: 220px; overflow-y: auto; }
</style>
