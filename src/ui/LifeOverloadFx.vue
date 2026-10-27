<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { CardDef } from '@/engine/types'
import { playLifeOverloadSfx } from '@/composables/useSfx'
import CardView from './CardView.vue'

defineProps<{ card: CardDef }>()
const emit = defineEmits<{ done: [] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let doneTimer: ReturnType<typeof setTimeout> | undefined
const sound = new AbortController()

onMounted(() => {
  void playLifeOverloadSfx(sound.signal)
  doneTimer = setTimeout(() => emit('done'), 1500)
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const width = el.clientWidth
  const height = el.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  el.width = width * dpr
  el.height = height * dpr
  ctx.scale(dpr, dpr)
  const particles = Array.from({ length: reduced ? 35 : 240 }, () => {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.hypot(width, height) * (0.15 + Math.random() * 0.55)
    return {
      vx: Math.cos(angle) * distance,
      vy: Math.sin(angle) * distance,
      size: 2 + Math.random() * 7,
      life: 0.65 + Math.random() * 0.65,
      seed: Math.random() * Math.PI * 2,
      hue: 12 + Math.random() * 35,
    }
  })
  const start = performance.now()
  const draw = (now: number) => {
    const elapsed = (now - start) / 1000
    const t = (elapsed - 0.6) * 1.4
    ctx.clearRect(0, 0, width, height)
    if (t >= 0) {
      const flash = Math.max(0, 1 - t / 0.22) * (reduced ? 0.12 : 0.65)
      ctx.fillStyle = `rgba(255, 205, 115, ${flash})`
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      if (!reduced && t < 0.6) {
        const radius = 20 + t * Math.hypot(width, height) * 1.4
        ctx.beginPath()
        ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 147, 48, ${Math.max(0, 0.8 - t * 1.4)})`
        ctx.lineWidth = 18 * (1 - t / 0.6)
        ctx.stroke()
      }
      for (const p of particles) {
        const age = t / p.life
        if (age >= 1) continue
        const travel = reduced ? t * 0.12 : 1 - Math.exp(-t * 3)
        const x = width / 2 + p.vx * travel + Math.sin(p.seed + t * 8) * t * 15
        const y = height / 2 + p.vy * travel - t * t * 65
        const size = p.size * (1 - age * 0.75)
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 4)
        glow.addColorStop(0, `hsla(48, 100%, 88%, ${1 - age})`)
        glow.addColorStop(0.22, `hsla(${p.hue}, 100%, 60%, ${0.9 * (1 - age)})`)
        glow.addColorStop(1, `hsla(10, 100%, 40%, 0)`)
        ctx.fillStyle = glow
        ctx.fillRect(x - size * 4, y - size * 4, size * 8, size * 8)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - p.vx * 0.025 * (1 - age), y - p.vy * 0.025 * (1 - age) + size * 3)
        ctx.strokeStyle = `hsla(${p.hue}, 100%, 65%, ${0.6 * (1 - age)})`
        ctx.lineWidth = size * 0.6
        ctx.stroke()
      }
      const burn = Math.max(0, 1 - (elapsed - 0.6) / 0.9)
      for (let i = 0; i < (reduced ? 6 : 24); i++) {
        const phase = (elapsed * 2.5 + i * 0.137) % 1
        const spread = (i / 23 - 0.5) * 220
        const x = width / 2 + spread + Math.sin(i * 2.4 + elapsed * 9) * 15
        const y = height / 2 + 65 - phase * (100 + (i % 5) * 22)
        const radius = (12 + (i % 4) * 5) * (1 - phase * 0.7)
        const flame = ctx.createRadialGradient(x, y, 0, x, y, radius * 2)
        flame.addColorStop(0, `rgba(255, 238, 155, ${burn * (1 - phase)})`)
        flame.addColorStop(0.3, `rgba(255, 110, 20, ${burn * (1 - phase) * 0.8})`)
        flame.addColorStop(1, 'rgba(180, 25, 0, 0)')
        ctx.fillStyle = flame
        ctx.beginPath()
        ctx.ellipse(x, y, radius, radius * 2, Math.sin(i) * 0.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    if (elapsed < 1.5) frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {
  sound.abort()
  cancelAnimationFrame(frame)
  clearTimeout(doneTimer)
})
</script>

<template>
  <div class="life-overload" aria-hidden="true">
    <div class="overload-shade" />
    <div class="overload-card">
      <CardView :card="card" :playable="true" />
      <div class="overload-core" />
    </div>
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.life-overload {
  position: absolute;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  overflow: hidden;
}
.overload-shade {
  position: absolute;
  inset: 0;
  background: rgba(12, 3, 0, 0.7);
  animation: overload-shade 1.5s ease-out both;
}
.overload-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9rem;
  transform-origin: center;
  animation: overload-expand 600ms ease-in both;
}
.overload-core {
  position: absolute;
  inset: -15px;
  border-radius: 50%;
  background: radial-gradient(ellipse, #fff8d9 0%, #ffca69 18%, #f65a15 40%, transparent 68%);
  mix-blend-mode: screen;
  animation: overload-core 600ms ease-in both;
}
canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
@keyframes overload-expand {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.65); filter: brightness(1); }
  18% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
  55% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); filter: brightness(1.4) drop-shadow(0 0 18px #f85c17); }
  82% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); filter: brightness(2) drop-shadow(0 0 35px #ff9a30); }
  99% { opacity: 1; transform: translate(-50%, -50%) scale(2.1); filter: brightness(4) drop-shadow(0 0 60px #ffcb75); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.3); }
}
@keyframes overload-core {
  0%, 25% { opacity: 0; transform: scale(0.05); }
  65% { opacity: 0.6; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(1.8); }
}
@keyframes overload-shade {
  0%, 100% { opacity: 0; }
  12%, 65% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .overload-card { animation: overload-still 600ms linear both; }
  .overload-core { display: none; }
  @keyframes overload-still {
    0%, 100% { opacity: 0; transform: translate(-50%, -50%); }
    20%, 85% { opacity: 1; transform: translate(-50%, -50%); }
  }
}
</style>
