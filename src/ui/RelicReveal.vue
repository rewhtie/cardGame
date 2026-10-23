<script lang="ts">
/** 已消费的特效批次：组件重新挂载时不重放旧事件 */
let seenSeq = 0
</script>

<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fxBatch } from '@/composables/useFx'
import { relics as relicDefs } from '@/data/items'
import { isNewEnchant } from '@/composables/useSfxEvents'
import { progressOf, resolveCards } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import CardView from './CardView.vue'
import HealFx from './HealFx.vue'

/** 一次表现：遗物（可带牌 / 回血）或火堆升级（只有牌） */
interface Reveal {
  key: number
  id?: string
  cards?: { from: string; to: string }[]
  heal?: number
  /** 附魔（牌上镶嵌宝石）：不走升级的摇晃换牌，只播镶嵌动画和音效 */
  enchant?: boolean
  /** 战斗后进化：标题改为“进化” */
  evolve?: boolean
  /** 成长进度推进但未满：旧牌按进度裂开几道缝，不爆发 */
  train?: boolean
}
let nextKey = 0

const props = defineProps<{ cards: Record<string, CardDef> }>()

/** 摇晃时长；与 .card-shake 的 animation 时长保持一致 */
const SHAKE_MS = 900
const CARD_HOLD_MS = 900
const HEAL_MS = 1100
const ENCHANT_MS = 1600
/** 成长：先裂开（蓄力），再爆出蓝光、新牌冲破旧牌面 */
const EVOLVE_CRACK_MS = 1500
const EVOLVE_HOLD_MS = 1500
/** 成长未满：裂痕逐条出现后停留的总时长 */
const TRAIN_MS = 2300

/** 裂纹：从牌心向外的折线（牌面 144×208），pathLength=1，按 delay 依次延伸 */
const CRACKS = [
  { d: 'M72 104 L60 84 L66 62 L52 40 L56 8', delay: 0.1 },
  { d: 'M72 104 L90 90 L86 66 L104 48 L100 16', delay: 0.25 },
  { d: 'M72 104 L96 118 L116 112 L136 134', delay: 0.4 },
  { d: 'M72 104 L80 128 L66 146 L74 172 L62 204', delay: 0.55 },
  { d: 'M72 104 L50 120 L34 114 L8 136', delay: 0.7 },
  { d: 'M72 104 L44 98 L24 80 L6 88', delay: 0.85 },
]

/** 碎片：以牌心为顶点，把牌面切成 8 个三角，爆发时各自沿外侧方向飞散 */
const RIM: [number, number][] = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50]]
const SHARDS = RIM.map((a, i) => {
  const b = RIM[(i + 1) % RIM.length]!
  const mx = (a[0] + b[0]) / 2 - 50
  const my = (a[1] + b[1]) / 2 - 50
  const len = Math.hypot(mx, my) || 1
  return {
    clip: `polygon(50% 50%, ${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%)`,
    dx: Math.round((mx / len) * (150 + (i % 3) * 30)),
    dy: Math.round((my / len) * (170 + (i % 3) * 30)),
    rot: (i % 2 ? 1 : -1) * (25 + (i % 4) * 14),
  }
})

/** 击打火花：白色楔形，从牌面向外放射；角度均分一圈，长度 / 宽度 / 延迟略作错落 */
const SPARK_COUNT = 14
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => ({
  angle: (360 / SPARK_COUNT) * i + (i % 3) * 7,
  /** 楔形内端距牌心的距离；牌半高 104，取在牌缘外一圈，尖刺才不会全被牌面挡住 */
  dist: 96 + (i % 4) * 12,
  /** 楔形长度 */
  len: 30 + (i % 3) * 16,
  /** 楔形内端宽度 */
  width: 4 + (i % 3) * 2,
  /** 换牌炸开时的错落延迟 */
  delay: (i % 5) * 0.035,
  /** 摇晃时按帧错开的击打延迟，避免一圈火花同时亮起 */
  hit: (i % 6) * 0.05,
}))

const queue = ref<Reveal[]>([])
const current = computed(() => queue.value[0])
/** 0：升级前左右摇晃；1：换成升级后的牌 */
const phase = ref(0)
let timers: ReturnType<typeof setTimeout>[] = []

const showCards = computed(() => !!current.value?.cards?.length)
const def = computed(() => (current.value?.id ? relicDefs[current.value.id] : undefined))
const pairs = computed(() => {
  const list = current.value?.cards ?? []
  const defs = resolveCards(
    props.cards,
    list.flatMap((c) => [c.from, c.to]),
  )
  return list.flatMap((c) => {
    const from = defs[c.from]
    const to = defs[c.to]
    if (!from || !to) return []
    // 成长进度占比 -> 裂痕条数：至少 1 条，未满最多 CRACKS.length - 1 条，留出最后的“冲破”
    const plays = from.evolve?.plays ?? 1
    const progress = progressOf(c.to)
    const cracks = Math.max(1, Math.min(CRACKS.length - 1, Math.round((CRACKS.length * progress) / plays)))
    return [{ from, to, progress, plays, cracks }]
  })
})

/** 多张牌时的散落位置与摇晃方向：--m 为 1 / -1，把摇晃轨迹镜像，避免整齐划一 */
const SLOTS = [
  { tilt: -7, dy: 12, m: 1 },
  { tilt: 6, dy: -9, m: -1 },
  { tilt: 5, dy: 15, m: 1 },
  { tilt: -6, dy: -13, m: -1 },
  { tilt: 3, dy: 8, m: -1 },
  { tilt: -4, dy: -6, m: 1 },
]
/** 只有一张牌时保持正中不倾斜；两张以上各就各位，散开摆 */
const slotOf = (i: number) =>
  pairs.value.length > 1 ? SLOTS[i % SLOTS.length]! : { tilt: 0, dy: 0, m: 1 }

function advance() {
  queue.value = queue.value.slice(1)
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

// 每出现新的一项就重新计时：带牌的遗物先摇晃再换牌，再停留片刻
watch(current, (r) => {
  clearTimers()
  phase.value = 0
  if (!r) return
  // 音效不在这里：见 useSfxEvents，按事件发声，与动画是否播放无关
  if (r.enchant) {
    timers.push(setTimeout(advance, ENCHANT_MS))
  } else if (r.train) {
    timers.push(setTimeout(advance, TRAIN_MS))
  } else if (r.cards?.length) {
    const crack = r.evolve ? EVOLVE_CRACK_MS : SHAKE_MS
    timers.push(setTimeout(() => (phase.value = 1), crack))
    timers.push(setTimeout(advance, crack + (r.evolve ? EVOLVE_HOLD_MS : CARD_HOLD_MS)))
  } else timers.push(setTimeout(advance, HEAL_MS))
})

watch(
  fxBatch,
  (b) => {
    if (b.seq <= seenSeq) return
    seenSeq = b.seq
    // 只有改动了牌或回复生命的遗物才有表现，其余静默生效
    const found: Reveal[] = []
    for (const e of b.events) {
      if (e.type === 'cardsUpgraded') found.push({ key: nextKey++, cards: e.cards })
      else if (e.type === 'cardsTrained') found.push({ key: nextKey++, cards: e.cards, train: true })
      else if (e.type === 'cardsEvolved') found.push({ key: nextKey++, cards: e.cards, evolve: true })
      else if (e.type === 'relicGained' && (e.cards?.length || e.heal)) {
        found.push({ key: nextKey++, id: e.id, cards: e.cards, heal: e.heal, enchant: isNewEnchant(e.cards) })
      }
    }
    if (found.length) queue.value = [...queue.value, ...found]
  },
  { immediate: true },
)

function skipAll() {
  clearTimers()
  queue.value = []
}
onBeforeUnmount(clearTimers)
</script>

<template>
  <HealFx v-if="current?.heal && !showCards" :key="current.key" :amount="current.heal" />
  <div
    v-else-if="current"
    class="absolute inset-0 z-60 bg-black/70 flex flex-col items-center justify-center gap-6"
    @click="skipAll"
    @pointerdown.stop
    @wheel.stop
  >
    <div v-if="def" :key="current.key" class="reveal-pop flex flex-col items-center gap-2">
      <div class="text-6xl"><Emoji :e="def.icon" /></div>
      <div class="text-2xl font-bold text-amber-300">{{ def.name }}</div>
      <div class="text-slate-300">{{ def.text }}</div>
      <div v-if="def.lore" class="text-sm italic text-slate-400">{{ def.lore }}</div>
    </div>
    <div v-if="current.evolve" class="text-2xl font-bold text-amber-300">成长</div>
    <div v-else-if="current.train" class="text-2xl font-bold text-sky-300">成长进度</div>
    <div
      v-if="pairs.length"
      class="flex flex-wrap justify-center items-start"
      :class="pairs.length > 1 ? 'gap-x-6 gap-y-8 max-w-[760px]' : 'gap-10'"
    >
      <div
        v-for="(p, i) in pairs"
        :key="`${current.key}-${i}`"
        class="relative w-36 h-52"
        :style="{
          transform: `rotate(${slotOf(i).tilt}deg) translateY(${slotOf(i).dy}px)`,
          zIndex: i,
        }"
      >
        <CardView
          v-if="current.enchant"
          :card="p.to"
          :playable="true"
          class="card-inlay pointer-events-none"
        />
        <template v-else-if="current.train">
          <!-- 未满：旧牌轻颤，裂痕按进度占比一条条爬开，蓝光随进度变亮，停住不爆发 -->
          <div
            class="evo-train absolute inset-0"
            :style="{ '--p': p.progress / p.plays }"
          >
            <CardView :card="p.from" :playable="true" :progress="p.progress" class="pointer-events-none" />
            <svg class="evo-crack" viewBox="0 0 144 208" fill="none">
              <path
                v-for="(c, k) in CRACKS.slice(0, p.cracks)"
                :key="k"
                :d="c.d"
                pathLength="1"
                :style="{ '--cd': `${0.15 + k * 0.28}s` }"
              />
            </svg>
          </div>
        </template>
        <template v-else-if="current.evolve">
          <!-- 蓄力：旧牌震颤、蓝光渐亮、裂纹一条条爬开 -->
          <div v-if="phase === 0" class="evo-old absolute inset-0">
            <CardView :card="p.from" :playable="true" class="pointer-events-none" />
            <svg class="evo-crack" viewBox="0 0 144 208" fill="none">
              <path
                v-for="(c, k) in CRACKS"
                :key="k"
                :d="c.d"
                pathLength="1"
                :style="{ '--cd': `${c.delay}s` }"
              />
            </svg>
          </div>
          <!-- 爆发：新牌从中心冲出，旧牌面碎成 8 片向外飞散 -->
          <template v-else>
            <div class="evo-ring" />
            <CardView :card="p.to" :playable="true" class="evo-new pointer-events-none" />
            <div
              v-for="(sh, k) in SHARDS"
              :key="k"
              class="evo-shard absolute inset-0 pointer-events-none"
              :style="{ clipPath: sh.clip, '--dx': `${sh.dx}px`, '--dy': `${sh.dy}px`, '--rot': `${sh.rot}deg` }"
            >
              <CardView :card="p.from" :playable="true" />
            </div>
          </template>
        </template>
        <template v-else>
        <CardView
          v-if="phase === 0"
          :card="p.from"
          :playable="true"
          class="card-shake pointer-events-none"
          :style="{ '--m': slotOf(i).m }"
        />
        <CardView v-else :card="p.to" :playable="true" class="card-flash pointer-events-none" />
        <div class="spark-field pointer-events-none" :style="{ transform: `rotate(${i * 23}deg)` }">
          <span
            v-for="(s, j) in SPARKS"
            :key="j"
            class="spark"
            :class="phase === 0 ? 'spark-ember' : 'spark-burst'"
            :style="{
              '--a': `${s.angle}deg`,
              '--r': `${s.dist}px`,
              '--len': `${s.len}px`,
              '--w': `${s.width}px`,
              '--d': phase === 0 ? `${s.hit}s` : `${s.delay}s`,
            }"
          />
        </div>
        </template>
      </div>
    </div>
    <div class="text-xs text-slate-500">点击任意处跳过</div>
  </div>
</template>

<style scoped>
.reveal-pop {
  animation: reveal-pop 0.35s ease-out;
}
.card-shake {
  /* step-end：每个关键帧位置直接定格，不做插值，即"抽帧"的顿挫感 */
  animation: card-shake 0.9s step-end forwards;
  transform-origin: 50% 90%;
  /* --m 为 1 / -1：整条轨迹左右翻面，多张牌一起摇时不会像复制粘贴 */
  --m: 1;
}
.card-flash {
  animation: card-flash 0.5s ease-out;
}
/* 附魔镶嵌：牌从略大处“嵌”下来，紫光一闪后收束，不摇晃也没有火花 */
.card-inlay {
  animation: card-inlay 1.1s ease-out both;
}
@keyframes card-inlay {
  0% {
    transform: scale(1.35);
    filter: brightness(1.8) drop-shadow(0 0 4px #c4b5fd);
  }
  25% {
    transform: scale(1.1);
    filter: brightness(1.5) drop-shadow(0 0 26px #a78bfa);
  }
  35% {
    transform: scale(1.18);
    filter: brightness(2) drop-shadow(0 0 34px #ddd6fe);
  }
  60% {
    transform: scale(1.15);
    filter: brightness(1.2) drop-shadow(0 0 18px #a78bfa);
  }
  100% {
    transform: scale(1.15);
    filter: brightness(1) drop-shadow(0 0 10px rgba(167, 139, 250, 0.6));
  }
}
/* 卡牌周围的击打火花：--a/--r/--len/--w/--d 由模板按粒子给出 */
.spark-field {
  position: absolute;
  inset: 0;
  /* 白色光晕，让尖刺像"打出来的"而不是"画上去的" */
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.85));
}
.spark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--len);
  height: var(--w);
  /* 内端窄、外端宽：锤击漫画里那种从冲击点炸开的三角尖刺 */
  clip-path: polygon(0 50%, 100% 0, 100% 100%);
  background: linear-gradient(90deg, #ffffff 0%, #ffffff 55%, rgba(255, 255, 255, 0.75) 100%);
  /* 内端定位在牌心的方向上，向外放射 */
  margin-top: calc(var(--w) / -2);
  transform-origin: 0 50%;
  opacity: 0;
}
/* 摇晃时：一圈尖刺按帧错落炸亮又消失，给锤击做铺垫 */
.spark-ember {
  animation: spark-ember 0.9s step-end var(--d) forwards;
}
/* 换牌瞬间：尖刺向四面炸开 */
.spark-burst {
  animation: spark-burst 0.55s step-end var(--d) forwards;
}
/* 成长·蓄力：旧牌越抖越亮，蓝色光晕渐强 */
.evo-old {
  animation: evo-charge 1.5s ease-in forwards;
}
@keyframes evo-charge {
  0% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 #38bdf8); }
  20% { transform: scale(1.03) translateX(-2px); }
  35% { transform: scale(1.05) translateX(3px) rotate(0.6deg); }
  50% { transform: scale(1.07) translateX(-4px) rotate(-0.8deg); filter: brightness(1.15) drop-shadow(0 0 12px #38bdf8); }
  70% { transform: scale(1.1) translateX(5px) rotate(1deg); }
  85% { transform: scale(1.13) translateX(-6px) rotate(-1.2deg); filter: brightness(1.6) drop-shadow(0 0 26px #7dd3fc); }
  100% { transform: scale(1.16); filter: brightness(2.4) drop-shadow(0 0 40px #e0f2fe); }
}
.evo-crack {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  filter: drop-shadow(0 0 4px #7dd3fc);
}
.evo-crack path {
  stroke: #e0f2fe;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: evo-crack-grow 0.45s ease-out var(--cd) forwards;
}
@keyframes evo-crack-grow {
  to { stroke-dashoffset: 0; }
}
/* 成长·未满：轻颤一下后停住，光晕强度随进度占比 --p（0~1）增大 */
.evo-train {
  animation: evo-train 1.4s ease-out forwards;
}
@keyframes evo-train {
  0% { transform: scale(1); filter: none; }
  20% { transform: scale(1.04) translateX(-3px) rotate(-0.8deg); }
  40% { transform: scale(1.06) translateX(3px) rotate(0.8deg); }
  60% { transform: scale(1.07) translateX(-2px) rotate(-0.5deg); }
  100% {
    transform: scale(1.1);
    filter: brightness(calc(1 + var(--p) * 0.6)) drop-shadow(0 0 calc(8px + var(--p) * 26px) rgba(56, 189, 248, 0.9));
  }
}
/* 成长·爆发：新牌从小处冲出并过曝，随后回落 */
.evo-new {
  position: relative;
  z-index: 1;
  animation: evo-new 1.1s ease-out both;
}
@keyframes evo-new {
  0% { transform: scale(0.45); opacity: 0; filter: brightness(4) drop-shadow(0 0 30px #e0f2fe); }
  25% { transform: scale(1.38); opacity: 1; filter: brightness(2.6) drop-shadow(0 0 50px #38bdf8); }
  55% { transform: scale(1.14); filter: brightness(1.4) drop-shadow(0 0 28px #38bdf8); }
  100% { transform: scale(1.1); filter: brightness(1) drop-shadow(0 0 14px rgba(56, 189, 248, 0.6)); }
}
/* 旧牌碎片：沿各自方向飞出并旋转、淡去 */
.evo-shard {
  z-index: 2;
  animation: evo-shard 0.9s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
}
@keyframes evo-shard {
  0% { transform: translate(0, 0) rotate(0deg) scale(1.16); opacity: 1; filter: brightness(2.4); }
  70% { opacity: 0.8; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.9); opacity: 0; filter: brightness(1.4); }
}
/* 冲击波：蓝色光环从牌心扩散 */
.evo-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10rem;
  height: 10rem;
  margin: -5rem 0 0 -5rem;
  border-radius: 9999px;
  border: 4px solid #7dd3fc;
  box-shadow: 0 0 40px 10px rgba(56, 189, 248, 0.7), inset 0 0 30px rgba(125, 211, 252, 0.6);
  pointer-events: none;
  animation: evo-ring 0.9s ease-out forwards;
}
@keyframes evo-ring {
  from { transform: scale(0.2); opacity: 1; }
  to { transform: scale(3.4); opacity: 0; }
}
@keyframes reveal-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}
@keyframes card-shake {
  0% {
    transform: rotate(calc(var(--m) * -14deg)) translateX(calc(var(--m) * -14px)) scale(1.05);
  }
  14% {
    transform: rotate(calc(var(--m) * 13deg)) translateX(calc(var(--m) * 13px)) scale(1.05);
  }
  28% {
    transform: rotate(calc(var(--m) * -12deg)) translateX(calc(var(--m) * -12px)) scale(1.04);
  }
  42% {
    transform: rotate(calc(var(--m) * 11deg)) translateX(calc(var(--m) * 11px)) scale(1.04);
  }
  56% {
    transform: rotate(calc(var(--m) * -9deg)) translateX(calc(var(--m) * -9px)) scale(1.03);
  }
  70% {
    transform: rotate(calc(var(--m) * 7deg)) translateX(calc(var(--m) * 7px)) scale(1.02);
  }
  82% {
    transform: rotate(calc(var(--m) * -5deg)) translateX(calc(var(--m) * -5px)) scale(1.01);
  }
  92% {
    transform: rotate(calc(var(--m) * 3deg)) translateX(calc(var(--m) * 3px)) scale(1);
  }
  100% {
    transform: rotate(0deg) translateX(0px) scale(1.22);
  }
}
@keyframes card-flash {
  from {
    transform: scale(1.25);
    filter: brightness(2.2) drop-shadow(0 0 18px #fbbf24);
  }
}
/* 摇晃时：尖刺定在牌缘不动，只按帧炸亮 / 熄灭，像锤子一下下砸上去；step-end 与摇晃同步"抽帧" */
@keyframes spark-ember {
  0% {
    opacity: 0;
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.6, 0.6);
  }
  12% {
    opacity: 1;
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.8, 1.15);
  }
  24% {
    opacity: 0.15;
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.9, 0.7);
  }
  36% {
    opacity: 1;
    transform: rotate(var(--a)) translateX(var(--r)) scale(1.2, 1.3);
  }
  48% {
    opacity: 0.2;
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.85, 0.75);
  }
  60% {
    opacity: 0.95;
    transform: rotate(var(--a)) translateX(var(--r)) scale(1, 1.05);
  }
  72% {
    opacity: 0.15;
    transform: rotate(var(--a)) translateX(var(--r)) scale(0.9, 0.8);
  }
  84% {
    opacity: 1;
    transform: rotate(var(--a)) translateX(var(--r)) scale(1.3, 1.2);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateX(var(--r)) scale(1.5, 0.5);
  }
}
/* 换牌瞬间：尖刺沿 --a 方向炸开，一格格往外跳，尾段淡出 */
@keyframes spark-burst {
  0% {
    opacity: 0;
    transform: rotate(var(--a)) translateX(calc(var(--r) * 0.7)) scale(0.5, 0.5);
  }
  15% {
    opacity: 1;
    transform: rotate(var(--a)) translateX(var(--r)) scale(1.1, 1.35);
  }
  45% {
    opacity: 1;
    transform: rotate(var(--a)) translateX(calc(var(--r) + 26px)) scale(1, 1);
  }
  75% {
    opacity: 0.7;
    transform: rotate(var(--a)) translateX(calc(var(--r) + 48px)) scale(0.85, 0.7);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateX(calc(var(--r) + 70px)) scale(0.6, 0.4);
  }
}
</style>
