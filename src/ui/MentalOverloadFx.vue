<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { CardDef } from '@/engine/types'
import { playMentalOverloadSfx } from '@/composables/useSfx'
import CardView from './CardView.vue'

defineProps<{ card: CardDef }>()
const emit = defineEmits<{ done: [] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const slashes = [35, -48, 88, -18, 62, -72, 12, -35, 76, -58, 24, -84]
const pieces = [
  { clip: 'polygon(-12% -12%, 50% -12%, 50% 50%)', x: -35, y: -45, turn: -16 },
  { clip: 'polygon(50% -12%, 112% -12%, 50% 50%)', x: 25, y: -55, turn: 13 },
  { clip: 'polygon(112% -12%, 112% 75%, 50% 50%)', x: 60, y: -5, turn: 20 },
  { clip: 'polygon(112% 75%, 112% 112%, -12% 112%, 50% 50%)', x: 15, y: 65, turn: -12 },
  { clip: 'polygon(-12% 112%, -12% 40%, 50% 50%)', x: -55, y: 40, turn: -23 },
  { clip: 'polygon(-12% 40%, -12% -12%, 50% 50%)', x: -65, y: -15, turn: 12 },
]
let frame = 0
let timer: ReturnType<typeof setTimeout> | undefined
const sound = new AbortController()
onMounted(() => {
  void playMentalOverloadSfx(sound.signal)
  timer = setTimeout(() => emit('done'), 1500)
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const w = el.clientWidth
  const h = el.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  el.width = w * dpr
  el.height = h * dpr
  ctx.scale(dpr, dpr)
  const cols = 16
  const rows = 10
  const points = Array.from({ length: rows + 1 }, (_, y) =>
    Array.from({ length: cols + 1 }, (_, x) => ({
      x: (x + (x > 0 && x < cols ? (Math.random() - 0.5) * 0.7 : 0)) * w / cols,
      y: (y + (y > 0 && y < rows ? (Math.random() - 0.5) * 0.7 : 0)) * h / rows,
    })),
  )
  const shards = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = points[y]![x]!
      const b = points[y]![x + 1]!
      const c = points[y + 1]![x]!
      const d = points[y + 1]![x + 1]!
      for (const vertices of [[a, b, c], [b, d, c]]) {
        const cx = vertices.reduce((sum, p) => sum + p.x, 0) / 3
        const cy = vertices.reduce((sum, p) => sum + p.y, 0) / 3
        shards.push({ vertices, cx, cy, spin: (Math.random() - 0.5) * 3, tint: Math.random(), speed: 0.5 + Math.random() })
      }
    }
  }
  const start = performance.now()
  const draw = (now: number) => {
    const t = (now - start) / 1000
    ctx.clearRect(0, 0, w, h)
    if (t > 0.58) {
      const breakAge = Math.max(0, (t - 0.84) / 0.66)
      const alpha = Math.min(1, (t - 0.58) / 0.06) * (1 - breakAge)
      for (const s of shards) {
        ctx.save()
        const travel = reduced ? 0 : breakAge * s.speed
        ctx.translate(s.cx + (s.cx - w / 2) * travel * 0.45, s.cy + (s.cy - h / 2) * travel * 0.3 + travel * travel * h * 0.3)
        ctx.rotate(reduced ? 0 : s.spin * breakAge)
        ctx.scale(1 - breakAge * 0.65, 1 - breakAge * 0.35)
        ctx.beginPath()
        s.vertices.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x - s.cx, p.y - s.cy)
          else ctx.lineTo(p.x - s.cx, p.y - s.cy)
        })
        ctx.closePath()
        const gradient = ctx.createLinearGradient(-w / cols, -h / rows, w / cols, h / rows)
        gradient.addColorStop(0, `rgba(218, 242, 255, ${alpha * (0.12 + s.tint * 0.15)})`)
        gradient.addColorStop(0.45, `rgba(57, 98, 145, ${alpha * 0.03})`)
        gradient.addColorStop(1, `rgba(235, 250, 255, ${alpha * (0.2 + s.tint * 0.25)})`)
        ctx.fillStyle = gradient
        ctx.fill()
        ctx.strokeStyle = `rgba(208, 237, 255, ${alpha * 0.65})`
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.restore()
      }
    }
    if (t < 1.5) frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {
  sound.abort()
  cancelAnimationFrame(frame)
  clearTimeout(timer)
})
</script>

<template>
  <div class="mental-overload" aria-hidden="true">
    <div class="shade" />
    <div class="cut-card">
      <div
        v-for="(piece, i) in pieces"
        :key="i"
        class="card-piece"
        :style="{
          clipPath: piece.clip,
          '--x': `${piece.x}px`,
          '--y': `${piece.y}px`,
          '--turn': `${piece.turn}deg`,
        }"
      ><CardView :card="card" :playable="true" /></div>
    </div>
    <div
      v-for="(angle, i) in slashes"
      :key="i"
      class="slash"
      :style="{ '--angle': `${angle}deg`, animationDelay: `${180 + Math.floor(i / 4) * 140 + (i % 4) * 16}ms` }"
    />
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.mental-overload { position: absolute; inset: 0; z-index: 90; pointer-events: none; overflow: hidden; }
.shade { position: absolute; inset: 0; background: rgba(0, 3, 12, 0.75); animation: shade 1.5s ease-out both; }
.cut-card { position: absolute; left: 50%; top: 50%; width: 9rem; transform: translate(-50%, -50%); animation: reveal 200ms ease-out both; }
.card-piece { grid-area: 1 / 1; animation: split-card 1.5s ease-out both; }
.cut-card { display: grid; }
.slash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 160vmax;
  height: 3px;
  background: linear-gradient(90deg, transparent, #8ebeff 25%, #fff 50%, #b6dcff 75%, transparent);
  box-shadow: 0 0 8px #fff, 0 0 24px #70acff, 0 0 45px #4084e9;
  transform-origin: center;
  animation: sword-flash 120ms ease-out both;
}
canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
@keyframes reveal {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes split-card {
  0%, 26% { opacity: 1; transform: translate(0, 0) rotate(0); }
  36%, 56% { opacity: 1; transform: translate(calc(var(--x) * 0.3), calc(var(--y) * 0.3)) rotate(calc(var(--turn) * 0.3)); }
  65%, 100% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--turn)); }
}
@keyframes sword-flash {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--angle)) scaleX(0.05); }
  18% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--angle)) scaleX(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--angle)) scaleX(1); }
}
@keyframes shade { 0%, 100% { opacity: 0; } 12%, 65% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .slash { display: none; }
  .cut-card { animation: none; }
  .card-piece { animation: still-piece 1.5s linear both; }
  @keyframes still-piece { 0%, 100% { opacity: 0; } 15%, 55% { opacity: 1; } }
}
</style>
