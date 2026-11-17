<script lang="ts">
import type { GameMap } from '@/engine/map'

/** 已播过开箱动画的节点：遗物选牌回来时重新挂载不再重播；按地图对象区分，新开的局或音效场景重播仍会播放 */
const opened = new WeakMap<GameMap, string>()
</script>

<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { playSfx } from '@/composables/useSfx'
import { relics as relicDefs } from '@/data/items'
import type { RunState } from '@/engine/run'
import HoverTip from './HoverTip.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{ claim: [index: number]; finish: [] }>()

/** 晃动 → 翻盖 → 遗物与金币升起；与下方 CSS 动画时长保持一致 */
const SHAKE_MS = 600
const OPEN_MS = 1500
/** 领完最后一件后，等飞走动画播完再离开 */
const LEAVE_MS = 500

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

type Phase = 'closed' | 'opening' | 'open'
const phase = ref<Phase>(reduced || opened.get(props.run.map) === props.run.current ? 'open' : 'closed')
const timers: ReturnType<typeof setTimeout>[] = []
const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))

onMounted(() => {
  if (phase.value === 'open') return
  if (props.run.current) opened.set(props.run.map, props.run.current)
  later(SHAKE_MS, () => {
    phase.value = 'opening'
    void playSfx('run.treasure.open')
    later(OPEN_MS, () => (phase.value = 'open'))
  })
})
onBeforeUnmount(() => timers.forEach(clearTimeout))

const relic = computed(() => {
  const index = props.run.rewards.findIndex((r) => r.type === 'relic')
  const r = props.run.rewards[index]
  return r?.type === 'relic' && relicDefs[r.id] ? { index, def: relicDefs[r.id]! } : null
})
const gold = computed(() => {
  const index = props.run.rewards.findIndex((r) => r.type === 'gold')
  const r = props.run.rewards[index]
  return r?.type === 'gold' ? { index, amount: r.amount } : null
})

/** 遗物与金币并排悬在箱口上方：两件时左右分开，只剩一件时居中 */
const SPREAD = 120
const items = computed(() => {
  if (phase.value === 'closed') return []
  const both = !!relic.value && !!gold.value
  return [
    ...(relic.value ? [{ kind: 'relic' as const, dx: both ? -SPREAD : 0 }] : []),
    ...(gold.value ? [{ kind: 'gold' as const, dx: both ? SPREAD : 0 }] : []),
  ]
})

/** 金币摞：50 金 5 枚，200 金封顶 12 枚；底层宽、上层窄，堆成小丘 */
const coins = computed(() => {
  const total = Math.min(12, Math.max(5, Math.round((gold.value?.amount ?? 0) / 16)))
  const out: { x: number; y: number; tilt: number }[] = []
  let left = total
  for (let row = 0; left > 0; row++) {
    const n = Math.min(left, Math.max(1, 4 - row))
    for (let i = 0; i < n; i++) {
      const k = out.length
      out.push({
        x: (i - (n - 1) / 2) * 22 + (row % 2 ? 5 : 0) + ((k * 7) % 5) - 2,
        y: row * 8,
        tilt: ((k * 11) % 12) - 6,
      })
    }
    left -= n
  }
  return out
})

/** 光晕里的光芒：角度、长短、粗细都错开，避免规整的图案感 */
const RAYS = Array.from({ length: 22 }, (_, i) => ({
  angle: (360 / 22) * i + ((i * 7) % 5) - 2,
  len: 62 + ((i * 29) % 37),
  width: 1.2 + ((i * 13) % 4) * 0.7,
}))
/** 箱口飘起的微尘 */
const MOTES = Array.from({ length: 9 }, (_, i) => ({
  x: ((i * 37) % 120) - 60,
  delay: (i * 0.47) % 3,
  dur: 3 + ((i * 0.7) % 2),
}))

function claim(index: number) {
  if (phase.value !== 'open') return
  emit('claim', index)
}

/** 离开宝箱房时清掉记录：之后再进同一节点（上帝模式）重新播放开箱 */
function leave() {
  opened.delete(props.run.map)
  emit('finish')
}

// 奖励领完（且没有待处理的药水弹窗）后自动离开；遗物选牌返回时重新挂载也会触发
let finishing = false
watch(
  () => props.run.rewards.length === 0 && !props.run.potionOffer?.length,
  (done) => {
    if (!done || finishing) return
    finishing = true
    later(phase.value === 'open' ? LEAVE_MS : 0, leave)
  },
  { immediate: true },
)
</script>

<template>
  <div class="treasure theme-bg" :class="`is-${phase}`">
    <div class="stage">
      <div class="floor-shadow chest-shadow" />

      <!-- 箱口透出的烛光与微尘 -->
      <div class="light">
        <div class="beam" />
        <div class="mouth-glow" />
        <span
          v-for="(m, i) in MOTES"
          :key="i"
          class="mote"
          :style="{ left: `calc(50% + ${m.x}px)`, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }"
        />
      </div>

      <svg class="chest" viewBox="0 0 300 240" width="300" height="240" aria-hidden="true">
        <defs>
          <!-- 木料：深褐底色 + 顶部受光 -->
          <linearGradient id="tv-oak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#5e3b1e" />
            <stop offset="0.55" stop-color="#47290f" />
            <stop offset="1" stop-color="#2a1708" />
          </linearGradient>
          <linearGradient id="tv-oak-lid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#6e4724" />
            <stop offset="1" stop-color="#3c2310" />
          </linearGradient>
          <!-- 左上受光、右侧与底部压暗 -->
          <linearGradient id="tv-shade-x" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff2d6" stop-opacity="0.10" />
            <stop offset="0.45" stop-color="#000" stop-opacity="0" />
            <stop offset="1" stop-color="#000" stop-opacity="0.45" />
          </linearGradient>
          <linearGradient id="tv-shade-y" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#000" stop-opacity="0" />
            <stop offset="0.7" stop-color="#000" stop-opacity="0.15" />
            <stop offset="1" stop-color="#000" stop-opacity="0.6" />
          </linearGradient>
          <!-- 锻铁：中间一道冷光 -->
          <linearGradient id="tv-iron" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#18181a" />
            <stop offset="0.35" stop-color="#3b3a38" />
            <stop offset="0.55" stop-color="#4d4b47" />
            <stop offset="1" stop-color="#1c1b1a" />
          </linearGradient>
          <linearGradient id="tv-iron-h" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#4d4b47" />
            <stop offset="0.5" stop-color="#2e2d2b" />
            <stop offset="1" stop-color="#151414" />
          </linearGradient>
          <radialGradient id="tv-rivet" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stop-color="#b9b3a6" />
            <stop offset="0.4" stop-color="#5b5751" />
            <stop offset="1" stop-color="#141312" />
          </radialGradient>
          <!-- 旧黄铜锁板 -->
          <radialGradient id="tv-brass" cx="0.35" cy="0.25" r="0.9">
            <stop offset="0" stop-color="#e2c27a" />
            <stop offset="0.35" stop-color="#b08834" />
            <stop offset="0.8" stop-color="#6b4c17" />
            <stop offset="1" stop-color="#3a280b" />
          </radialGradient>
          <radialGradient id="tv-velvet" cx="0.5" cy="0.9" r="0.9">
            <stop offset="0" stop-color="#7a0f16" />
            <stop offset="0.6" stop-color="#4a080d" />
            <stop offset="1" stop-color="#1c0205" />
          </radialGradient>

          <!-- 木纹：横向拉长的分形噪声，叠成深色纹理 -->
          <filter id="tv-wood" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.28" numOctaves="4" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.04  0 0 0 0 0.01  1.9 0 0 0 -0.62" result="grain" />
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="f" />
            <feColorMatrix in="f" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.75" result="speck" />
            <feMerge result="tex">
              <feMergeNode in="grain" />
              <feMergeNode in="speck" />
            </feMerge>
            <feComposite in="tex" in2="SourceGraphic" operator="in" result="clip" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="clip" />
            </feMerge>
          </filter>
          <!-- 铁锈与麻点 -->
          <filter id="tv-rust" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="11" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.17  0 0 0 0 0.06  2.6 0 0 0 -1.25" result="rust" />
            <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="5" result="p" />
            <feColorMatrix in="p" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.25" result="pits" />
            <feMerge result="tex">
              <feMergeNode in="rust" />
              <feMergeNode in="pits" />
            </feMerge>
            <feComposite in="tex" in2="SourceGraphic" operator="in" result="clip" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="clip" />
            </feMerge>
          </filter>
          <!-- 铜锈斑驳 -->
          <filter id="tv-tarnish" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="3" seed="4" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.17  0 0 0 0 0.12  0 0 0 0 0.04  2.2 0 0 0 -0.95" result="t" />
            <feComposite in="t" in2="SourceGraphic" operator="in" result="clip" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="clip" />
            </feMerge>
          </filter>

          <!-- 遗物 / 金币背后的光晕（供下方光晕 svg 引用） -->
          <radialGradient id="tv-halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#fff1c9" stop-opacity="0.55" />
            <stop offset="0.35" stop-color="#f0c766" stop-opacity="0.28" />
            <stop offset="0.7" stop-color="#b8771f" stop-opacity="0.08" />
            <stop offset="1" stop-color="#b8771f" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="tv-ray" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="-98">
            <stop offset="0" stop-color="#ffe7a8" stop-opacity="0.55" />
            <stop offset="1" stop-color="#ffe7a8" stop-opacity="0" />
          </linearGradient>
          <!-- 金币 -->
          <radialGradient id="tv-coin" cx="0.38" cy="0.3" r="0.8">
            <stop offset="0" stop-color="#fff0b8" />
            <stop offset="0.3" stop-color="#e2b54a" />
            <stop offset="0.75" stop-color="#a5741c" />
            <stop offset="1" stop-color="#5e3d0a" />
          </radialGradient>
          <linearGradient id="tv-coin-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#5a3a0a" />
            <stop offset="0.4" stop-color="#9c6d1a" />
            <stop offset="1" stop-color="#3e2806" />
          </linearGradient>
        </defs>

        <!-- 翻开的箱盖：露出丝绒内衬，画在箱体之后 -->
        <g class="lid-open">
          <path d="M26 112 L40 26 Q150 10 260 26 L274 112 Z" fill="url(#tv-oak-lid)" filter="url(#tv-wood)" />
          <path d="M26 112 L40 26 Q150 10 260 26 L274 112 Z" fill="url(#tv-shade-x)" stroke="#120a04" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M40 104 L50 36 Q150 22 250 36 L260 104 Z" fill="url(#tv-velvet)" />
          <!-- 丝绒的褶与绒光 -->
          <path d="M95 104 Q92 70 98 32 M150 104 Q152 66 150 26 M205 104 Q208 70 202 32" stroke="#1a0204" stroke-width="5" opacity="0.45" fill="none" />
          <path d="M120 104 Q118 70 123 30 M178 104 Q180 70 176 30" stroke="#b8333a" stroke-width="2" opacity="0.25" fill="none" />
          <path d="M40 104 L50 36 Q150 22 250 36 L260 104 Z" fill="none" stroke="#0b0604" stroke-width="2" />
          <path d="M60 112 L72 26 L90 24 L80 112 Z M240 112 L228 26 L210 24 L220 112 Z" fill="url(#tv-iron)" filter="url(#tv-rust)" stroke="#0b0b0a" stroke-width="1.2" stroke-linejoin="round" />
          <circle v-for="y in [40, 70, 98]" :key="`ol${y}`" :cx="76 - (y - 40) / 8" :cy="y" r="2.6" fill="url(#tv-rivet)" />
          <circle v-for="y in [40, 70, 98]" :key="`or${y}`" :cx="224 + (y - 40) / 8" :cy="y" r="2.6" fill="url(#tv-rivet)" />
        </g>

        <!-- 箱体：三块横板 -->
        <path d="M18 112 L282 112 L274 228 L26 228 Z" fill="url(#tv-oak)" filter="url(#tv-wood)" />
        <path d="M21 150 L279 150 M23 190 L277 190" stroke="#140b04" stroke-width="2" />
        <path d="M21 152 L279 152 M23 192 L277 192" stroke="#8a6038" stroke-width="0.8" opacity="0.35" />
        <path d="M18 112 L282 112 L274 228 L26 228 Z" fill="url(#tv-shade-x)" />
        <path d="M18 112 L282 112 L274 228 L26 228 Z" fill="url(#tv-shade-y)" stroke="#0e0703" stroke-width="1.5" stroke-linejoin="round" />
        <!-- 箱口：开盖后是暗的内腔 -->
        <path class="mouth" d="M22 112 L278 112 L276 124 L24 124 Z" fill="#0a0502" />
        <!-- 铁箍、包角与铆钉 -->
        <g filter="url(#tv-rust)">
          <rect x="60" y="112" width="20" height="116" fill="url(#tv-iron)" />
          <rect x="220" y="112" width="20" height="116" fill="url(#tv-iron)" />
          <path d="M18 112 L38 112 L36 142 L20 142 Z M282 112 L262 112 L264 142 L280 142 Z" fill="url(#tv-iron)" />
          <path d="M26 228 L24 200 L42 200 L44 228 Z M274 228 L276 200 L258 200 L256 228 Z" fill="url(#tv-iron)" />
        </g>
        <path
          d="M60 112 V228 M80 112 V228 M220 112 V228 M240 112 V228"
          stroke="#0a0a09"
          stroke-width="1.2"
        />
        <path d="M61.5 112 V228 M221.5 112 V228" stroke="#8d877c" stroke-width="0.7" opacity="0.5" />
        <circle v-for="y in [126, 160, 196, 218]" :key="`l${y}`" cx="70" :cy="y" r="2.8" fill="url(#tv-rivet)" />
        <circle v-for="y in [126, 160, 196, 218]" :key="`r${y}`" cx="230" :cy="y" r="2.8" fill="url(#tv-rivet)" />
        <circle v-for="p in [[27, 127], [273, 127], [33, 214], [267, 214]]" :key="`c${p[0]}${p[1]}`" :cx="p[0]" :cy="p[1]" r="2.4" fill="url(#tv-rivet)" />

        <!-- 闭合的箱盖：拱顶 + 铁箍 + 搭扣 -->
        <g class="lid-closed">
          <path d="M18 114 L18 80 Q18 40 150 40 Q282 40 282 80 L282 114 Z" fill="url(#tv-oak-lid)" filter="url(#tv-wood)" />
          <path d="M22 76 Q24 52 150 52 Q276 52 278 76" fill="none" stroke="#140b04" stroke-width="1.6" />
          <path d="M22 78 Q24 54 150 54 Q276 54 278 78" fill="none" stroke="#8a6038" stroke-width="0.7" opacity="0.35" />
          <!-- 拱顶受光：上沿一道暖色高光，下部压暗 -->
          <path d="M18 114 L18 80 Q18 40 150 40 Q282 40 282 80 L282 114 Z" fill="url(#tv-shade-x)" />
          <path d="M30 62 Q60 44 150 43" fill="none" stroke="#e8c79a" stroke-width="2" opacity="0.25" stroke-linecap="round" />
          <path d="M18 114 L18 80 Q18 40 150 40 Q282 40 282 80 L282 114 Z" fill="none" stroke="#0e0703" stroke-width="1.5" stroke-linejoin="round" />
          <g filter="url(#tv-rust)">
            <path d="M60 114 L60 44 Q70 42 80 42 L80 114 Z M220 114 L220 42 Q230 42 240 44 L240 114 Z" fill="url(#tv-iron)" />
            <rect x="18" y="103" width="264" height="11" fill="url(#tv-iron-h)" />
          </g>
          <path d="M60 114 L60 44 M80 114 L80 42 M220 114 L220 42 M240 114 L240 44 M18 103 H282 M18 114 H282" stroke="#0a0a09" stroke-width="1.2" />
          <circle v-for="x in [40, 70, 110, 190, 230, 260]" :key="x" :cx="x" cy="108.5" r="2.4" fill="url(#tv-rivet)" />
          <circle v-for="y in [56, 80]" :key="`la${y}`" cx="70" :cy="y" r="2.6" fill="url(#tv-rivet)" />
          <circle v-for="y in [56, 80]" :key="`ra${y}`" cx="230" :cy="y" r="2.6" fill="url(#tv-rivet)" />
          <path d="M141 94 L159 94 L159 122 L150 129 L141 122 Z" fill="url(#tv-iron)" filter="url(#tv-rust)" stroke="#0a0a09" stroke-width="1.2" />
          <circle cx="150" cy="100" r="2.2" fill="url(#tv-rivet)" />
        </g>

        <!-- 黄铜锁板：盾形，刻一道内框 -->
        <g class="lock">
          <path d="M127 119 L173 119 L173 147 Q173 166 150 175 Q127 166 127 147 Z" fill="url(#tv-brass)" filter="url(#tv-tarnish)" />
          <path d="M127 119 L173 119 L173 147 Q173 166 150 175 Q127 166 127 147 Z" fill="none" stroke="#2a1b05" stroke-width="1.5" />
          <path d="M133 125 L167 125 L167 146 Q167 160 150 167 Q133 160 133 146 Z" fill="none" stroke="#3d2a08" stroke-width="1.2" opacity="0.8" />
          <path d="M133.6 126 L166.4 126" stroke="#f3dc9e" stroke-width="0.8" opacity="0.6" />
          <circle cx="150" cy="142" r="4.6" fill="#0b0703" />
          <path d="M147.8 144 L152.2 144 L153.6 157 L146.4 157 Z" fill="#0b0703" />
          <circle v-for="p in [[131, 123], [169, 123], [150, 171]]" :key="`b${p[0]}`" :cx="p[0]" :cy="p[1]" r="1.6" fill="url(#tv-rivet)" />
        </g>
      </svg>

      <!-- 遗物与金币：从箱口升起，悬在上方，背后各有一圈光晕 -->
      <TransitionGroup name="take">
        <div
          v-for="it in items"
          :key="it.kind"
          class="prize"
          :style="{ '--dx': `${it.dx}px` }"
        >
          <HoverTip
            v-if="it.kind === 'relic' && relic"
            :icon="relic.def.icon"
            :name="relic.def.name"
            :text="relic.def.text"
            :lore="relic.def.lore"
            tag="遗物"
            color="#d9a93a"
          >
            <button class="prize-btn" :aria-label="`拿走 ${relic.def.name}`" @click="claim(relic.index)">
              <svg class="nimbus" viewBox="-100 -100 200 200" aria-hidden="true">
                <circle r="98" fill="url(#tv-halo)" />
                <line
                  v-for="r in RAYS"
                  :key="r.angle"
                  y1="-28"
                  :y2="-r.len"
                  :stroke-width="r.width"
                  stroke="url(#tv-ray)"
                  stroke-linecap="round"
                  :transform="`rotate(${r.angle})`"
                />
              </svg>
              <span class="relic-icon"><Emoji :e="relic.def.icon" /></span>
            </button>
          </HoverTip>

          <button
            v-else-if="it.kind === 'gold' && gold"
            class="prize-btn"
            :aria-label="`拿走 ${gold.amount} 金币`"
            @click="claim(gold.index)"
          >
            <svg class="nimbus" viewBox="-100 -100 200 200" aria-hidden="true">
              <circle r="98" fill="url(#tv-halo)" />
              <line
                v-for="r in RAYS"
                :key="r.angle"
                y1="-28"
                :y2="-r.len"
                :stroke-width="r.width"
                stroke="url(#tv-ray)"
                stroke-linecap="round"
                :transform="`rotate(${r.angle})`"
              />
            </svg>
            <span class="stack">
              <span
                v-for="(c, i) in coins"
                :key="i"
                class="coin"
                :style="{ left: `${c.x}px`, bottom: `${c.y}px`, zIndex: Math.round(c.y) }"
              >
                <svg viewBox="0 0 30 16" width="30" height="16" :style="{ transform: `rotate(${c.tilt}deg)` }">
                  <ellipse cx="15" cy="9.5" rx="13" ry="5.5" fill="url(#tv-coin-edge)" />
                  <ellipse cx="15" cy="7" rx="13" ry="5.5" fill="url(#tv-coin)" stroke="#4a3006" stroke-width="0.6" />
                  <ellipse cx="15" cy="7" rx="9.5" ry="3.8" fill="none" stroke="#7a5212" stroke-width="0.7" opacity="0.7" />
                  <ellipse cx="15" cy="7.5" rx="9.5" ry="3.8" fill="none" stroke="#fff0b8" stroke-width="0.5" opacity="0.4" />
                  <path d="M15 4.8 V9.2 M12 7 H18" stroke="#6b4610" stroke-width="0.9" opacity="0.75" />
                </svg>
              </span>
            </span>
            <span class="ribbon">{{ gold.amount }} 金币</span>
          </button>
        </div>
      </TransitionGroup>
    </div>

    <div class="footer">
      <button v-if="phase === 'open'" class="leave" @click="leave">离开</button>
    </div>
  </div>
</template>

<style scoped>
.treasure {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #e9d8b0;
}

/* 舞台：宝箱底边即地面，遗物与金币堆都相对它定位 */
.stage {
  position: relative;
  width: 720px;
  height: 500px;
}
.chest {
  position: absolute;
  left: 210px;
  bottom: 40px;
  overflow: visible;
}
.floor-shadow {
  position: absolute;
  bottom: 26px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.75), transparent 70%);
}
.chest-shadow {
  left: 190px;
  width: 340px;
}

/* ---- 开箱 ---- */
.is-closed .chest {
  transform-origin: 50% 100%;
  animation: rattle 0.6s ease-in-out;
}
@keyframes rattle {
  0%, 100% { transform: rotate(0); }
  15% { transform: rotate(-2.5deg) translateY(-3px); }
  35% { transform: rotate(2.5deg) translateY(-5px); }
  55% { transform: rotate(-1.5deg) translateY(-2px); }
  75% { transform: rotate(1deg); }
}
.lid-closed,
.lid-open {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}
.lid-open {
  transform: scaleY(0);
}
.mouth {
  opacity: 0;
}
.is-opening .lid-closed {
  animation: lid-up 0.16s ease-in forwards;
}
.is-opening .lid-open {
  animation: lid-back 0.42s 0.16s cubic-bezier(0.25, 1.5, 0.5, 1) forwards;
}
.is-open .lid-closed {
  transform: scaleY(0);
}
.is-open .lid-open {
  transform: scaleY(1);
}
.is-opening .mouth,
.is-open .mouth {
  opacity: 1;
}
@keyframes lid-up {
  to { transform: scaleY(0); }
}
@keyframes lid-back {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
.lock {
  transform-box: fill-box;
  transform-origin: 50% 0;
}
.is-opening .lock {
  animation: lock-jolt 0.3s ease-out;
}
@keyframes lock-jolt {
  30% { transform: rotate(8deg) translateY(2px); }
  70% { transform: rotate(-4deg); }
}

/* 箱口的烛光：一道向上散开的光柱 + 箱口的暖晕 + 缓缓上飘的微尘 */
.light {
  position: absolute;
  left: 210px;
  width: 300px;
  bottom: 152px;
  height: 340px;
  pointer-events: none;
  opacity: 0;
  mix-blend-mode: screen;
}
.is-opening .light {
  animation: light-in 0.8s 0.2s ease-out forwards;
}
.is-open .light {
  opacity: 1;
}
@keyframes light-in {
  0% { opacity: 0; }
  40% { opacity: 1; filter: brightness(1.6); }
  100% { opacity: 1; filter: brightness(1); }
}
.beam {
  position: absolute;
  inset: 0;
  clip-path: polygon(18% 100%, 82% 100%, 100% 0, 0 0);
  background: linear-gradient(0deg, rgba(255, 207, 122, 0.42), rgba(255, 207, 122, 0.08) 60%, transparent);
}
.mouth-glow {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: -30px;
  height: 70px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 214, 140, 0.75), rgba(255, 170, 60, 0.2) 50%, transparent 72%);
}
.mote {
  position: absolute;
  bottom: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffe39a;
  box-shadow: 0 0 6px #ffcf7a;
  opacity: 0;
  animation: mote-rise linear infinite;
}
@keyframes mote-rise {
  0% { opacity: 0; transform: translate(0, 0); }
  20% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(14px, -260px); }
}

/* ---- 遗物与金币 ---- */
.prize {
  position: absolute;
  left: calc(360px + var(--dx));
  bottom: 270px;
  translate: -50% 0;
  z-index: 2;
  /* 领走一件后，剩下的一件滑回正中 */
  transition: left 0.4s ease-in-out;
}
/* 从箱口中央升起，再向两侧分开；金币比遗物晚一拍 */
.is-opening .prize {
  animation: prize-rise 0.9s 0.3s cubic-bezier(0.2, 1.2, 0.4, 1) both;
}
.is-opening .prize:nth-child(2) {
  animation-delay: 0.5s;
}
@keyframes prize-rise {
  0% { opacity: 0; transform: translate(calc(var(--dx) * -1), 120px) scale(0.3); }
  50% { opacity: 1; }
  100% { opacity: 1; transform: translate(0, 0) scale(1); }
}
.prize-btn {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.prize-btn:focus-visible {
  outline: 2px solid #e8c25a;
  outline-offset: 4px;
  border-radius: 50%;
}
.nimbus {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: blur(0.6px);
  mix-blend-mode: screen;
  animation: nimbus-turn 90s linear infinite;
  transition: filter 0.2s, opacity 0.2s;
  opacity: 0.85;
}
.prize-btn:hover .nimbus {
  filter: blur(0.6px) brightness(1.35);
  opacity: 1;
}
@keyframes nimbus-turn {
  to { transform: rotate(360deg); }
}
.relic-icon {
  position: relative;
  font-size: 3.4rem;
  line-height: 1;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.7));
  transition: transform 0.2s;
}
.prize-btn:hover .relic-icon,
.prize-btn:hover .stack {
  transform: translateY(-4px) scale(1.06);
}

/* 金币摞：坐在光晕中央 */
.stack {
  position: relative;
  width: 100px;
  height: 56px;
  margin-top: 6px;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.7));
  transition: transform 0.2s;
}
.coin {
  position: absolute;
  margin-left: 35px;
  width: 30px;
  height: 16px;
}
.coin svg {
  display: block;
  overflow: visible;
}

/* 悬停时在光晕下方浮出的羊皮纸飘带 */
.ribbon {
  position: absolute;
  left: 50%;
  top: calc(100% - 6px);
  padding: 0.3rem 1.4rem;
  white-space: nowrap;
  font-weight: 700;
  font-size: 0.95rem;
  color: #3b2410;
  background: linear-gradient(180deg, #f1e3bf, #dcc596);
  box-shadow: inset 0 0 8px rgba(120, 80, 30, 0.45);
  clip-path: polygon(0 0, 100% 0, 92% 50%, 100% 100%, 0 100%, 8% 50%);
  opacity: 0;
  transform: translate(-50%, -6px);
  transition: opacity 0.18s, transform 0.18s;
  pointer-events: none;
}
.prize-btn:hover .ribbon,
.prize-btn:focus-visible .ribbon {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* 领走：向上飘散 */
.take-leave-active {
  transition: opacity 0.45s ease-in, transform 0.45s ease-in;
}
.take-leave-to {
  opacity: 0;
  transform: translateY(-60px) scale(0.7);
}

/* ---- 离开 ---- */
.footer {
  height: 2.75rem;
}
.leave {
  padding: 0.45rem 2.2rem;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #e9d8b0;
  background: linear-gradient(180deg, #6b3e1d, #3e2210);
  border: 2px solid #0d0a08;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px #8a5629, 0 3px 0 #0d0a08;
  cursor: pointer;
  transition: filter 0.15s, transform 0.15s;
}
.leave:hover {
  filter: brightness(1.2);
  transform: translateY(-1px);
}
.leave:focus-visible {
  outline: 2px solid #e8c25a;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .chest,
  .prize,
  .nimbus,
  .mote,
  .lock {
    animation: none !important;
  }
}
</style>
