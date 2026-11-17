<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import type { RunSave } from '@/engine/save'
import { runProgress } from '@/engine/progress'

const props = defineProps<{ save: RunSave | null }>()
const emit = defineEmits<{ start: []; continue: []; codex: []; settings: [] }>()

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
      <button class="entry" @click="emit('codex')">
        <span class="entry-title">图鉴</span>
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
  filter: drop-shadow(0 0 16px rgba(200, 32, 42, 0.75));
  animation: flicker 2.4s ease-in-out infinite;
}
.logo {
  margin: 0;
  font-size: 5.5rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.1;
  /* 骨白字 + 粗墨描边 + 血红投影：与手绘立绘的粗墨线一致 */
  color: #f2e6cc;
  -webkit-text-stroke: 3px #0d0a08;
  paint-order: stroke fill;
  text-shadow:
    0 5px 0 #7c1018,
    0 8px 0 #0d0a08,
    0 0 36px rgba(200, 32, 42, 0.45);
}
.tagline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.6rem;
  font-size: 0.95rem;
  letter-spacing: 0.4em;
  color: #a38f70;
}
.tagline span {
  width: 4rem;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200, 32, 42, 0.8));
}
.tagline span:last-child {
  transform: scaleX(-1);
}

/* 按钮：墨底 + 粗黑描边 + 骨白内线，像插画里的墨线勾边 */
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
  color: #f2e6cc;
  background: linear-gradient(180deg, #2a221c, #15100d);
  border: 3px solid #0d0a08;
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 2px rgba(201, 180, 143, 0.55),
    0 4px 0 #0d0a08,
    0 8px 18px rgba(0, 0, 0, 0.55);
  transition:
    transform 0.15s,
    box-shadow 0.15s,
    filter 0.15s;
}
.entry:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 0 0 2px rgba(242, 230, 204, 0.8),
    0 6px 0 #0d0a08,
    0 0 22px rgba(200, 32, 42, 0.45);
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
  color: #a38f70;
}
/* 主操作：血红填充 */
.entry.primary {
  color: #fbf5e8;
  background: linear-gradient(180deg, #d42a33, #8f121b);
  text-shadow: 0 2px 0 #0d0a08;
}
.entry.primary .entry-sub {
  color: rgba(251, 245, 232, 0.8);
}
/* 二次确认：墨底血字 + 红色内线警示 */
.entry.danger {
  color: #f08a8a;
  background: linear-gradient(180deg, #3a0f12, #1a0708);
  box-shadow:
    inset 0 0 0 2px #c8202a,
    0 4px 0 #0d0a08,
    0 8px 18px rgba(0, 0, 0, 0.55);
}

/* 火星 */
.ember {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: #f08a5a;
  box-shadow: 0 0 8px 2px rgba(200, 32, 42, 0.8);
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
