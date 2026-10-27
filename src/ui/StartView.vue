<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import type { RunSave } from '@/engine/save'
import { runProgress } from '@/engine/progress'

const props = defineProps<{ save: RunSave | null }>()
const emit = defineEmits<{ start: []; continue: []; settings: [] }>()

/** 存档摘要包含重新进入的节点，避免战斗存档显示上一层。 */
const summary = computed(() => {
  const r = props.save?.run
  if (!r) return ''
  const p = runProgress({ ...r, current: props.save?.enter?.id ?? r.current })
  const stage = p.stage === 1 ? '第一阶段' : '第二阶段'
  return `${stage} · 第 ${p.floor} 层 · ❤ ${r.player.hp}/${r.player.maxHp} · 💰 ${r.gold}`
})

// 已有存档时，新游戏需要再点一次确认，避免误覆盖
const armed = ref(false)
let armTimer: ReturnType<typeof setTimeout> | undefined
function newGame() {
  if (!props.save || armed.value) {
    clearTimeout(armTimer)
    armed.value = false
    emit('start')
    return
  }
  armed.value = true
  armTimer = setTimeout(() => (armed.value = false), 3000)
}
onBeforeUnmount(() => clearTimeout(armTimer))

/** 背景飘散的火星：位置、大小、节奏各不相同 */
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: `${3 + ((i * 5) % 5)}px`,
  delay: `${-((i * 1.7) % 9)}s`,
  duration: `${7 + ((i * 3) % 6)}s`,
}))
</script>

<template>
  <div class="menu theme-bg text-slate-100">
    <span
      v-for="(e, i) in EMBERS"
      :key="i"
      class="ember"
      :style="{
        left: e.left,
        width: e.size,
        height: e.size,
        animationDelay: e.delay,
        animationDuration: e.duration,
      }"
    />

    <div class="hero">
      <div class="flame"><Emoji e="🔥" /></div>
      <h1 class="logo">CardFire</h1>
      <div class="tagline"><span /> 卡牌 · 爬塔 · 远征 <span /></div>
    </div>

    <nav class="buttons">
      <button v-if="save" class="entry primary" @click="emit('continue')">
        <span class="entry-title">继续游戏</span>
        <span class="entry-sub">{{ summary }}</span>
      </button>
      <button class="entry" :class="{ danger: armed, primary: !save }" @click="newGame">
        <span class="entry-title">{{ armed ? '再点一次，覆盖存档' : '新游戏' }}</span>
        <span v-if="save && !armed" class="entry-sub">会覆盖当前存档</span>
      </button>
      <button class="entry" @click="emit('settings')">
        <span class="entry-title">设置</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3.5rem;
}

/* 标题 */
.hero {
  position: relative;
  z-index: 1;
  text-align: center;
}
.flame {
  font-size: 3rem;
  filter: drop-shadow(0 0 18px rgba(251, 146, 60, 0.9));
  animation: flicker 2.4s ease-in-out infinite;
}
.logo {
  margin: 0;
  font-size: 5.5rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.1;
  background: linear-gradient(180deg, #fef3c7 10%, #fbbf24 45%, #b45309 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 4px 0 rgba(0, 0, 0, 0.6)) drop-shadow(0 0 28px rgba(217, 119, 6, 0.45));
}
.tagline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.6rem;
  font-size: 0.95rem;
  letter-spacing: 0.4em;
  color: #b09c86;
}
.tagline span {
  width: 4rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.7));
}
.tagline span:last-child {
  transform: scaleX(-1);
}

/* 按钮：与弹框同源的金属渐变外框 */
.buttons {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 22rem;
}
.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.85rem 1rem;
  cursor: pointer;
  color: #f1e6d4;
  background:
    linear-gradient(180deg, rgba(45, 34, 28, 0.95), rgba(24, 16, 12, 0.95)) padding-box,
    linear-gradient(145deg, #fef3c7, #d97706 40%, #78350f 70%, #fcd34d) border-box;
  border: 2px solid transparent;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  transition:
    transform 0.15s,
    box-shadow 0.15s,
    filter 0.15s;
}
.entry:hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.6),
    0 0 22px rgba(251, 191, 36, 0.35);
  filter: brightness(1.12);
}
.entry:active {
  transform: translateY(0);
}
.entry-title {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
}
.entry-sub {
  font-size: 0.78rem;
  color: #b09c86;
}
/* 主操作：金色填充 */
.entry.primary {
  color: #1c1917;
  background:
    linear-gradient(180deg, #fcd34d, #d97706) padding-box,
    linear-gradient(145deg, #fef3c7, #d97706 40%, #78350f 70%, #fcd34d) border-box;
}
.entry.primary .entry-sub {
  color: rgba(28, 25, 23, 0.75);
}
/* 二次确认：红色警示 */
.entry.danger {
  color: #fee2e2;
  background:
    linear-gradient(180deg, #b91c1c, #7f1d1d) padding-box,
    linear-gradient(145deg, #fecaca, #dc2626 40%, #7f1d1d 70%, #fca5a5) border-box;
}

/* 火星 */
.ember {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 8px 2px rgba(251, 146, 60, 0.8);
  opacity: 0;
  animation: rise linear infinite;
}
@keyframes rise {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  10% {
    opacity: 0.9;
  }
  100% {
    transform: translate(2rem, -46rem);
    opacity: 0;
  }
}
@keyframes flicker {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1) translateY(-2px);
  }
}
</style>
