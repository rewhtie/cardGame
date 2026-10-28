<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGodMode } from '@/composables/useGodMode'
import { findNode, type MapNode, type NodeType } from '@/engine/map'
import { reachableIds, type RunState } from '@/engine/run'
import type { EnemyDef } from '@/engine/types'
import { enemyCatalog } from '@/data/enemies'

const props = defineProps<{
  run: RunState
  /** 只读：仅用于查看，不响应选点（如从状态栏打开的地图预览） */
  readonly?: boolean
}>()
const emit = defineEmits<{
  choose: [id: string, god: boolean]
  cheatGold: []
  cheatNext: [enemies: EnemyDef[]]
  cheatEvent: [id?: string]
}>()

const { cheatsEnabled, godMode } = useGodMode()

// ---- 作弊：指定下场战斗的敌人（一次性，不动种子） ----
const ROLE_LABELS = { boss: 'Boss', elite: '精英', monster: '普通', other: '其他' } as const
const ROLE_ORDER = ['monster', 'elite', 'boss', 'other'] as const
const enemyPickOpen = ref(false)
/** 已勾选的敌人 id，按点选顺序（同一只可重复添加） */
const pickedIds = ref<string[]>([])
const enemyGroups = ROLE_ORDER.map((role) => ({
  role,
  label: ROLE_LABELS[role],
  list: enemyCatalog.filter((e) => e.role === role).map((e) => e.def),
})).filter((g) => g.list.length)
const pickedEnemies = computed(() =>
  pickedIds.value.map((id) => enemyCatalog.find((e) => e.def.id === id)?.def).filter((d): d is EnemyDef => !!d),
)
const queuedText = computed(() => props.run.cheatNextEnemies?.map((e) => e.name).join('、'))
const eventPickOpen = ref(false)
const queuedEventText = computed(() =>
  props.run.content.events?.find((e) => e.id === props.run.cheatNextEventId)?.title,
)
function applyEventPick(id?: string) {
  emit('cheatEvent', id)
  eventPickOpen.value = false
}
function applyEnemyPick() {
  emit('cheatNext', pickedEnemies.value)
  pickedIds.value = []
  enemyPickOpen.value = false
}
function clearEnemyPick() {
  emit('cheatNext', [])
  pickedIds.value = []
}

const VIEW_W = 1280
const VIEW_H = 720
const LEGEND_W = 200
const CENTER_X = (VIEW_W - LEGEND_W) / 2
const COL_GAP = 100
const CENTER_COL = 3
const ROW_GAP = 120
const PAD_Y = 110
const NODE_R = 18
const DRAG_THRESHOLD = 5

const ICONS: Record<NodeType, string> = {
  ancient: '🏺',
  monster: '⚔️',
  elite: '💀',
  rest: '🔥',
  shop: '🛒',
  event: '❓',
  treasure: '🎁',
  boss: '👑',
}

const LABELS: Record<NodeType, string> = {
  ancient: '先古',
  monster: '战斗',
  elite: '精英',
  rest: '火堆',
  shop: '商店',
  event: '事件',
  treasure: '宝箱',
  boss: 'Boss',
}

const COLORS: Record<NodeType, string> = {
  ancient: '#38bdf8',
  monster: '#b09c86',
  elite: '#f87171',
  rest: '#fb923c',
  shop: '#facc15',
  event: '#a78bfa',
  treasure: '#34d399',
  boss: '#f43f5e',
}

const LEGEND_ORDER: NodeType[] = [
  'ancient',
  'monster',
  'elite',
  'rest',
  'shop',
  'event',
  'treasure',
  'boss',
]

const mapHeight = computed(() => props.run.map.boss.floor * ROW_GAP + PAD_Y * 2)
const maxScroll = computed(() => Math.max(0, mapHeight.value - VIEW_H))

/** 向上滚动的距离（设计像素），0 表示显示地图顶部 */
const scrollY = ref(0)
const hovered = ref<NodeType | null>(null)
const highlight = hovered
const viewport = ref<HTMLElement | null>(null)

function clamp(v: number) {
  return Math.min(maxScroll.value, Math.max(0, v))
}

function pos(node: MapNode) {
  return {
    x: CENTER_X + (node.col - CENTER_COL) * COL_GAP,
    y: mapHeight.value - PAD_Y - node.floor * ROW_GAP,
  }
}

const reachable = computed(() => new Set(reachableIds(props.run)))
const visited = computed(() => new Set(props.run.visited))

const nodes = computed(() =>
  [...props.run.map.floors.flat(), props.run.map.boss].map((node) => ({
    node,
    ...pos(node),
    reachable: reachable.value.has(node.id),
    visited: visited.value.has(node.id),
    current: props.run.current === node.id,
  })),
)

const counts = computed(() => {
  const result = {} as Record<NodeType, number>
  for (const t of LEGEND_ORDER) result[t] = 0
  for (const n of nodes.value) result[n.node.type] += 1
  return result
})

const edges = computed(() =>
  props.run.map.floors.flat().flatMap((from) =>
    from.next.map((id) => {
      const to = findNode(props.run.map, id) as MapNode
      const a = pos(from)
      const b = pos(to)
      return {
        key: `${from.id}>${id}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        walked: visited.value.has(from.id) && visited.value.has(id),
      }
    }),
  ),
)

function focusNode(id: string | null) {
  const node = id ? findNode(props.run.map, id) : props.run.map.floors[0]?.[0]
  if (!node) return
  scrollY.value = clamp(pos(node).y - VIEW_H / 2)
}

onMounted(() => focusNode(props.run.current))
watch(() => props.run.current, focusNode)

// ---- 拖拽 / 滚轮 ----
let dragging = false
let moved = false
let lastY = 0
let startY = 0

/** 舞台被 CSS 整体缩放，屏幕像素需换算回设计像素 */
function pxScale() {
  const el = viewport.value
  return el && el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  moved = false
  lastY = startY = e.clientY
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  if (Math.abs(e.clientY - startY) > DRAG_THRESHOLD) moved = true
  if (moved) scrollY.value = clamp(scrollY.value - (e.clientY - lastY) / pxScale())
  lastY = e.clientY
}

function onPointerUp() {
  dragging = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function onWheel(e: WheelEvent) {
  scrollY.value = clamp(scrollY.value + e.deltaY / pxScale())
}

onBeforeUnmount(onPointerUp)

function onClick(id: string, canChoose: boolean) {
  if (props.readonly || moved) return
  if (canChoose) emit('choose', id, false)
  else if (godMode.value) emit('choose', id, true)
}
</script>

<template>
  <div
    ref="viewport"
    class="relative w-full h-full overflow-hidden theme-bg cursor-grab active:cursor-grabbing touch-none"
    @pointerdown="onPointerDown"
    @wheel.prevent="onWheel"
  >
    <div class="absolute left-6 top-6 z-10 theme-text font-bold pointer-events-none">
      第 {{ run.stage ?? 1 }} 阶段<span v-if="(run.stage ?? 1) > 1" class="ml-3 text-sm">敌人强化</span>
    </div>
    <svg
      :viewBox="`0 0 ${VIEW_W} ${mapHeight}`"
      :width="VIEW_W"
      :height="mapHeight"
      class="absolute left-0 top-0 block"
      :style="{ transform: `translateY(${-scrollY}px)` }"
    >
      <line
        v-for="e in edges"
        :key="e.key"
        :x1="e.x1"
        :y1="e.y1"
        :x2="e.x2"
        :y2="e.y2"
        :stroke="e.walked ? '#fbbf24' : '#6b5a4c'"
        :stroke-width="e.walked ? 4 : 2"
        stroke-dasharray="6 6"
      />

      <g
        v-for="n in nodes"
        :key="n.node.id"
        :transform="`translate(${n.x}, ${n.y})`"
        class="cursor-pointer"
        :opacity="
          highlight ? (n.node.type === highlight ? 1 : 0.25) : n.visited && !n.current ? 0.4 : 1
        "
        @click="onClick(n.node.id, n.reachable)"
      >
        <circle
          v-if="highlight && n.node.type === highlight"
          :r="NODE_R + 14"
          :fill="COLORS[n.node.type]"
          fill-opacity="0.25"
          :stroke="COLORS[n.node.type]"
          stroke-width="3"
          class="animate-pulse"
        />
        <circle v-if="n.reachable" :r="NODE_R + 8" fill="none" stroke="#fbbf24" stroke-width="2" />
        <circle v-if="n.current" :r="NODE_R + 6" fill="none" stroke="#38bdf8" stroke-width="3" />
        <circle
          :r="n.node.type === 'boss' ? NODE_R + 10 : NODE_R"
          :fill="n.reachable ? '#92400e' : '#2d221c'"
          :stroke="n.reachable ? '#fbbf24' : COLORS[n.node.type]"
          stroke-width="2"
        />
        <foreignObject
          :x="-NODE_R - 10"
          :y="-NODE_R - 10"
          :width="(NODE_R + 10) * 2"
          :height="(NODE_R + 10) * 2"
          pointer-events="none"
        >
          <div
            class="w-full h-full flex items-center justify-center leading-none"
            :style="{ fontSize: `${n.node.type === 'boss' ? 28 : 18}px` }"
          >
            <Emoji :e="ICONS[n.node.type]" />
          </div>
        </foreignObject>
      </g>
    </svg>

    <!-- 右侧图例：悬停某类型，地图上对应节点高亮；滚轮穿透到地图 -->
    <div
      class="absolute right-3 top-16 bottom-3 z-10 flex flex-col justify-center"
      :style="{ width: `${LEGEND_W - 24}px` }"
      @pointerdown.stop
    >
      <div class="legend text-slate-100">
        <header class="legend-head">
          <span class="legend-line" />
          <span class="legend-title">图例</span>
          <span class="legend-line" />
        </header>
        <div class="flex flex-col gap-1">
          <button
            v-for="t in LEGEND_ORDER"
            :key="t"
            class="legend-item"
            :class="highlight === t ? 'is-on' : ''"
            :style="{ '--c': COLORS[t] }"
            @mouseenter="hovered = t"
            @mouseleave="hovered = null"
          >
            <span class="legend-icon"><Emoji :e="ICONS[t]" /></span>
            <span class="legend-label">{{ LABELS[t] }}</span>
            <span class="legend-count">{{ counts[t] }}</span>
          </button>
        </div>
        <p class="legend-tip">悬停可高亮对应房间</p>
      </div>
    </div>

    <div
      v-if="cheatsEnabled && !readonly"
      class="absolute left-3 z-50"
      :class="run.relics.length ? 'top-28' : 'top-16'"
      @pointerdown.stop
    >
      <button
        class="px-3 py-1.5 rounded text-sm border"
        :class="
          godMode
            ? 'bg-amber-500 text-slate-900 border-amber-300'
            : 'bg-slate-800/90 text-slate-300 border-slate-600'
        "
        @click="godMode = !godMode"
      >
        上帝模式：{{ godMode ? '开' : '关' }}
      </button>
      <button
        class="mt-1.5 block px-3 py-1.5 rounded text-sm border bg-slate-800/90 text-amber-300 border-slate-600 hover:bg-slate-700"
        @click="emit('cheatGold')"
      >
        999金币
      </button>
      <button
        class="mt-1.5 block px-3 py-1.5 rounded text-sm border"
        :class="
          queuedText
            ? 'bg-rose-600 text-white border-rose-300'
            : 'bg-slate-800/90 text-slate-300 border-slate-600'
        "
        @click="enemyPickOpen = !enemyPickOpen"
      >
        下场敌人：{{ queuedText ?? '默认' }}
      </button>
      <div
        v-if="enemyPickOpen"
        class="mt-1.5 w-72 max-h-96 overflow-y-auto rounded border border-slate-600 bg-slate-900/95 p-2 text-sm text-slate-100"
      >
        <div v-for="g in enemyGroups" :key="g.role" class="mb-2">
          <div class="mb-1 text-xs text-amber-300">{{ g.label }}</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="d in g.list"
              :key="d.id"
              class="px-2 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
              @click="pickedIds.push(d.id)"
            >
              {{ d.name }}
            </button>
          </div>
        </div>
        <div class="mb-2 text-xs text-slate-300">
          已选：{{ pickedEnemies.map((e) => e.name).join('、') || '（点上方敌人添加，可重复）' }}
        </div>
        <div class="flex gap-1.5">
          <button
            class="px-2 py-1 rounded bg-rose-600 text-white disabled:(opacity-40)"
            :disabled="!pickedIds.length"
            @click="applyEnemyPick"
          >
            设为下场敌人
          </button>
          <button class="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" @click="pickedIds = []">清空选择</button>
          <button class="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" @click="clearEnemyPick">取消指定</button>
        </div>
        <p class="mt-1.5 text-xs text-slate-400">只影响下一场战斗，种子不变；打完恢复默认。</p>
      </div>
      <button
        class="mt-1.5 block px-3 py-1.5 rounded text-sm border"
        :class="
          queuedEventText
            ? 'bg-violet-600 text-white border-violet-300'
            : 'bg-slate-800/90 text-slate-300 border-slate-600'
        "
        @click="eventPickOpen = !eventPickOpen"
      >
        下次事件：{{ queuedEventText ?? '默认' }}
      </button>
      <div
        v-if="eventPickOpen"
        class="mt-1.5 w-72 max-h-96 overflow-y-auto rounded border border-slate-600 bg-slate-900/95 p-2 text-sm text-slate-100"
      >
        <div class="flex flex-wrap gap-1">
          <button
            v-for="event in run.content.events ?? []"
            :key="event.id"
            class="px-2 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
            @click="applyEventPick(event.id)"
          >
            {{ event.title }}
          </button>
        </div>
        <button class="mt-2 px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" @click="applyEventPick()">
          取消指定
        </button>
        <p class="mt-1.5 text-xs text-slate-400">点击事件即可指定；只影响下一个问号房，进入后恢复随机。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 图例：与弹框同源的金属外框 + 深色底 */
.legend {
  padding: 0.7rem 0.6rem 0.6rem;
  border-radius: 12px;
  background:
    radial-gradient(ellipse 80% 30% at 50% 0%, rgba(99, 102, 241, 0.18), transparent 70%),
    linear-gradient(180deg, rgba(19, 26, 51, 0.94), rgba(13, 18, 36, 0.94));
  border: 2px solid #b45309;
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.7),
    inset 0 0 0 3px rgba(251, 191, 36, 0.14),
    0 6px 20px rgba(0, 0, 0, 0.6);
}
.legend-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}
.legend-title {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #fde68a;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.35);
}
.legend-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.7), transparent);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.25rem 0.5rem 0.25rem 0.3rem;
  text-align: left;
  cursor: default;
  color: #f8fafc;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;
}
.legend-item:hover,
.legend-item.is-on {
  background: color-mix(in srgb, var(--c) 18%, transparent);
  border-color: color-mix(in srgb, var(--c) 70%, transparent);
  transform: translateX(-2px);
}
.legend-label {
  flex: 1;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #fef3c7;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.legend-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  font-size: 1.05rem;
  background: radial-gradient(circle at 50% 35%, #2a3350, #0f172a 85%);
  border: 2px solid var(--c);
  border-radius: 50%;
  box-shadow: 0 0 8px color-mix(in srgb, var(--c) 40%, transparent);
}
.legend-count {
  min-width: 1.4rem;
  padding: 0 0.35rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: #f1f5f9;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 999px;
}
.legend-tip {
  margin: 0.55rem 0 0;
  text-align: center;
  font-size: 0.8rem;
  color: #b09c86;
}
</style>
