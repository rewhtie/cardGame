<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { cards } from '@/data/cards'
import { pushFx } from '@/composables/useFx'
import { DEFAULT_TEST_TURNS, traceCard, type Trace } from '@/testing/autoRun'
import type { CardDef } from '@/engine/types'
import BattleView from './BattleView.vue'
import CardView from './CardView.vue'

defineEmits<{ close: [] }>()

type Kind = CardDef['kind'] | 'all'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'attack', label: '攻击' },
  { value: 'skill', label: '技能' },
  { value: 'power', label: '能力' },
]
const SPEEDS = [
  { label: '慢', ms: 1200 },
  { label: '中', ms: 600 },
  { label: '快', ms: 250 },
]

const kind = ref<Kind>('all')
const list = computed(() =>
  Object.values(cards).filter((c) => kind.value === 'all' || c.kind === kind.value),
)

const turns = ref(DEFAULT_TEST_TURNS)
const speedMs = ref(SPEEDS[1]!.ms)
const selectedId = ref<string | null>(null)
const trace = ref<Trace | null>(null)
const cursor = ref(0)
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

const step = computed(() => trace.value?.steps[cursor.value] ?? null)
const atEnd = computed(() => !!trace.value && cursor.value >= trace.value.steps.length - 1)
const logLines = computed(() =>
  (trace.value?.steps.slice(0, cursor.value + 1) ?? []).flatMap((s) => [
    `▶ ${s.label}`,
    ...s.lines.map((l) => `    ${l}`),
  ]),
)
const clampedTurns = computed(() => Math.min(20, Math.max(1, Math.floor(turns.value) || 1)))

function stop() {
  playing.value = false
  clearInterval(timer)
}
function start() {
  stop()
  if (!trace.value) return
  if (atEnd.value) cursor.value = 0
  playing.value = true
  timer = setInterval(() => {
    if (atEnd.value) stop()
    else cursor.value += 1
  }, speedMs.value)
}
/** 点击卡面：生成轨迹并立刻自动回放 */
function run(id: string) {
  selectedId.value = id
  trace.value = traceCard(id, { turns: clampedTurns.value })
  cursor.value = 0
  start()
}
const rerun = () => selectedId.value && run(selectedId.value)

watch(speedMs, () => playing.value && start())

// 回放每走到新的一步，就把这一步的事件交给战斗画面播动画
watch(step, (s) => s && pushFx(s.events))

const logEl = ref<HTMLElement | null>(null)
watch(logLines, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})
onBeforeUnmount(stop)
</script>

<template>
  <div class="absolute inset-0 z-30 bg-slate-950 text-slate-100 flex">
    <!-- 左侧图鉴：点卡面即开始自动测试 -->
    <aside class="w-80 flex-none flex flex-col border-r border-slate-700 bg-slate-900">
      <div class="px-4 pt-3 pb-2 text-lg font-bold text-amber-400">🧪 卡牌测试台</div>
      <div class="flex gap-1 px-3 pb-2">
        <button
          v-for="k in KINDS"
          :key="k.value"
          class="flex-1 py-1 rounded text-sm"
          :class="
            kind === k.value
              ? 'bg-amber-500 text-slate-900 font-bold'
              : 'bg-slate-700 hover:bg-slate-600'
          "
          @click="kind = k.value"
        >
          {{ k.label }}
        </button>
      </div>
      <div
        class="flex-1 overflow-y-auto grid grid-cols-2 content-start gap-x-3 gap-y-5 px-5 pt-4 pb-4"
      >
        <div
          v-for="card in list"
          :key="card.id"
          class="rounded"
          :class="
            selectedId === card.id ? 'outline outline-3 outline-amber-400 outline-offset-4' : ''
          "
          :data-card-id="card.id"
          @click="run(card.id)"
        >
          <CardView :card="card" :playable="true" />
        </div>
      </div>
      <button class="m-3 btn-primary" @click="$emit('close')">返回</button>
    </aside>

    <!-- 右侧：控制条 + 战斗回放 + 日志 -->
    <section class="flex-1 min-w-0 flex flex-col">
      <div class="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 text-sm">
        <span class="font-bold">{{
          selectedId ? `${cards[selectedId]!.name}（${selectedId}）` : '点击左侧卡面开始测试'
        }}</span>
        <label class="ml-auto flex items-center gap-1">
          回合数
          <input
            v-model.number="turns"
            type="number"
            min="1"
            max="20"
            class="w-14 px-1 rounded bg-slate-700 text-slate-100"
          />
        </label>
        <select v-model.number="speedMs" class="px-1 rounded bg-slate-700 text-slate-100">
          <option v-for="s in SPEEDS" :key="s.ms" :value="s.ms">速度：{{ s.label }}</option>
        </select>
        <button
          class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
          :disabled="!trace"
          @click="playing ? stop() : start()"
        >
          {{ playing ? '暂停' : atEnd ? '重播' : '继续' }}
        </button>
        <button
          class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
          :disabled="!trace || atEnd"
          @click="(stop(), (cursor = trace!.steps.length - 1))"
        >
          跳到结尾
        </button>
        <button
          class="px-3 py-1 rounded bg-amber-500 text-slate-900 font-bold disabled:opacity-40"
          :disabled="!selectedId"
          @click="rerun"
        >
          重新运行
        </button>
      </div>

      <div
        v-if="trace && atEnd"
        class="px-4 py-1 text-sm"
        :class="trace.problems.length ? 'bg-red-900' : 'bg-emerald-900'"
      >
        <template v-if="!trace.problems.length">
          ✓ 通过：{{ trace.turns }} 回合内打出 {{ trace.played }} 次，效果与定义一致
        </template>
        <template v-else>
          <div v-for="p in trace.problems" :key="p">✗ {{ p }}</div>
        </template>
      </div>

      <div class="flex-1 min-h-0 relative overflow-hidden">
        <!-- 战斗画面按 1230×640 排版后等比缩小，放进右侧剩余空间 -->
        <div
          v-if="step"
          class="absolute top-0 left-0 pointer-events-none origin-top-left"
          :style="{ width: '1230px', height: '640px', transform: 'scale(0.78)' }"
        >
          <BattleView :state="step.state" readonly />
        </div>
        <div v-else class="w-full h-full flex items-center justify-center text-slate-500 text-xl">
          ← 在左侧图鉴里点击一张卡牌，自动跑 {{ clampedTurns }} 个回合
        </div>
      </div>

      <div
        ref="logEl"
        class="h-28 flex-none overflow-y-auto px-4 py-2 bg-black/60 border-t border-slate-700 font-mono text-xs leading-5 whitespace-pre"
      >
        <div
          v-for="(line, i) in logLines"
          :key="i"
          :class="line.startsWith('▶') ? 'text-amber-300' : 'text-slate-300'"
        >
          {{ line }}
        </div>
      </div>
    </section>
  </div>
</template>
