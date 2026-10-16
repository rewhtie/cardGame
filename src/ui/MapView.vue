<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGodMode } from '@/composables/useGodMode'
import { findNode, type MapNode, type NodeType } from '@/engine/map'
import { reachableIds, type RunState } from '@/engine/run'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ choose: [id: string, god: boolean] }>()

const { isDev, godMode } = useGodMode()

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
  monster: '#94a3b8',
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
  if (moved) return
  if (canChoose) emit('choose', id, false)
  else if (godMode.value) emit('choose', id, true)
}
</script>

<template>
  <div
    ref="viewport"
    class="relative w-full h-full overflow-hidden theme-bg cursor-grab active:cursor-grabbing"
    @pointerdown="onPointerDown"
    @wheel.prevent="onWheel"
  >
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
        :stroke="e.walked ? '#fbbf24' : '#475569'"
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
          :fill="n.reachable ? '#92400e' : '#1e293b'"
          :stroke="n.reachable ? '#fbbf24' : COLORS[n.node.type]"
          stroke-width="2"
        />
        <text
          text-anchor="middle"
          dominant-baseline="central"
          :font-size="n.node.type === 'boss' ? 28 : 18"
          pointer-events="none"
        >
          {{ ICONS[n.node.type] }}
        </text>
      </g>
    </svg>

    <!-- 右侧图例：悬停某类型，地图上对应节点高亮；滚轮穿透到地图 -->
    <div
      class="absolute right-3 top-16 bottom-3 z-10 flex flex-col justify-center"
      :style="{ width: `${LEGEND_W - 24}px` }"
      @pointerdown.stop
    >
      <div class="rounded bg-slate-800/90 p-3 space-y-1 text-slate-100">
        <div class="text-xs text-slate-400 mb-1">图例（悬停高亮）</div>
        <button
          v-for="t in LEGEND_ORDER"
          :key="t"
          class="w-full flex items-center gap-3 px-2 py-1.5 rounded text-left hover:bg-slate-700"
          :class="highlight === t ? 'bg-slate-600' : ''"
          @mouseenter="hovered = t"
          @mouseleave="hovered = null"
        >
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-slate-900 border-2"
            :style="{ borderColor: COLORS[t] }"
            >{{ ICONS[t] }}</span
          >
          <span class="flex-1">{{ LABELS[t] }}</span>
          <span class="text-xs text-slate-400">{{ counts[t] }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="isDev"
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
    </div>
  </div>
</template>
