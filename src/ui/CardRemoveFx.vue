<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { playSfx } from '@/composables/useSfx'
import type { CardDef } from '@/engine/types'
import CardView from './CardView.vue'

const props = defineProps<{
  card: CardDef
  delay: number
  index: number
  total: number
}>()
const emit = defineEmits<{ done: [] }>()
let soundTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  soundTimer = setTimeout(() => void playSfx('run.cardRemoved'), props.delay + 210)
})
onBeforeUnmount(() => clearTimeout(soundTimer))
const style = computed(() => ({
  '--delay': `${props.delay}ms`,
  '--dx': `${(props.index - (props.total - 1) / 2) * 156}px`,
}))
const particles = Array.from({ length: 34 }, (_, i) => ({
  '--x': `${8 + ((i * 29) % 84)}%`,
  '--drift': `${25 + ((i * 47) % 95)}px`,
  '--rise': `${70 + ((i * 31) % 140)}px`,
  '--size': `${2 + (i % 4)}px`,
  '--start': `${288 + ((i * 71) % 630)}ms`,
  '--turn': `${((i * 67) % 360) - 180}deg`,
}))
</script>

<template>
  <div class="card-remove" :style="style" aria-hidden="true" @animationend.self="emit('done')">
    <div class="burning-card">
      <CardView :card="card" :playable="true" />
      <div class="char" />
    </div>
    <div class="fire-front"><span /><span /><span /></div>
    <i
      v-for="(particle, i) in particles"
      :key="i"
      class="particle"
      :class="{ ash: i % 3 === 0 }"
      :style="particle"
    />
  </div>
</template>

<style scoped>
.card-remove {
  position: absolute;
  z-index: 75;
  left: calc(50% + var(--dx));
  top: 50%;
  width: 9rem;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: remove-card 1.5s ease-out var(--delay) both;
}
.burning-card {
  position: relative;
  padding: 14px;
  margin: -14px;
  animation: burn-away 810ms linear calc(var(--delay) + 210ms) both;
}
.char {
  position: absolute;
  inset: 14px;
  border-radius: 0.75rem;
  background: linear-gradient(0deg, #171311 8%, #39312b 38%, transparent 80%);
  mix-blend-mode: multiply;
  animation: char-card 720ms ease-in calc(var(--delay) + 150ms) both;
}
.fire-front {
  position: absolute;
  left: -5%;
  width: 110%;
  height: 28px;
  bottom: 0;
  opacity: 0;
  background: radial-gradient(ellipse, #fff2bf 0%, #ffbd55 22%, #ef601b 42%, transparent 70%);
  filter: drop-shadow(0 0 9px #ed4d13);
  animation: fire-rise 810ms linear calc(var(--delay) + 210ms) both;
}
.fire-front span {
  position: absolute;
  bottom: 8px;
  width: 25%;
  height: 38px;
  border-radius: 70% 20% 55% 30%;
  background: linear-gradient(0deg, #ffe6a1, #f78022 45%, transparent);
  transform-origin: bottom;
  animation: flame-flicker 160ms ease-in-out infinite alternate;
}
.fire-front span:nth-child(1) { left: 10%; }
.fire-front span:nth-child(2) { left: 40%; height: 48px; animation-delay: -70ms; }
.fire-front span:nth-child(3) { left: 70%; animation-delay: -110ms; }
.particle {
  position: absolute;
  left: var(--x);
  top: 60%;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: #ffd28a;
  box-shadow: 0 0 5px #ff8a32, 0 0 11px #df4a18;
  opacity: 0;
  animation: ember-drift 570ms ease-out calc(var(--delay) + var(--start)) both;
}
.particle.ash {
  border-radius: 1px;
  background: #8e8981;
  box-shadow: none;
}
@keyframes remove-card {
  0% { opacity: 0; transform: translate(-50%, -45%) scale(0.85); }
  10%, 84% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -53%) scale(1); }
}
@keyframes char-card {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes burn-away {
  0% { filter: grayscale(0); clip-path: polygon(0 0, 100% 0, 100% 100%, 80% 100%, 60% 100%, 40% 100%, 20% 100%, 0 100%); }
  25% { filter: grayscale(0.6) brightness(0.8); clip-path: polygon(0 0, 100% 0, 100% 74%, 80% 79%, 60% 70%, 40% 76%, 20% 69%, 0 77%); }
  60% { filter: grayscale(1) brightness(0.5); clip-path: polygon(0 0, 100% 0, 100% 37%, 80% 43%, 60% 34%, 40% 39%, 20% 32%, 0 40%); }
  90% { filter: grayscale(1) brightness(0.3); clip-path: polygon(0 0, 100% 0, 100% 8%, 80% 12%, 60% 5%, 40% 9%, 20% 3%, 0 10%); }
  100% { filter: grayscale(1) brightness(0.2); clip-path: polygon(0 0, 100% 0, 100% 0, 80% 0, 60% 0, 40% 0, 20% 0, 0 0); }
}
@keyframes fire-rise {
  0% { bottom: -5px; opacity: 0; }
  8% { opacity: 1; }
  85% { opacity: 1; }
  100% { bottom: 100%; opacity: 0; }
}
@keyframes flame-flicker {
  from { transform: rotate(16deg) scaleX(0.8) scaleY(0.75) skewX(-8deg); }
  to { transform: rotate(28deg) scaleX(1.05) scaleY(1.15) skewX(-14deg); }
}
@keyframes ember-drift {
  0% { opacity: 0; transform: translate(0, 0) scale(1); }
  15% { opacity: 1; }
  60% { opacity: 0.7; }
  100% { opacity: 0; transform: translate(var(--drift), calc(-1 * var(--rise))) rotate(var(--turn)) scale(0.2); }
}
@media (prefers-reduced-motion: reduce) {
  .card-remove { animation: remove-card 600ms ease-out var(--delay) both; }
  .burning-card { animation: char-card 500ms ease-out var(--delay) reverse both; }
  .char, .fire-front, .particle { display: none; }
}
</style>
