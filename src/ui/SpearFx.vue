<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { playSpearSfx } from '@/composables/useSfx'
import CinemaBars from './CinemaBars.vue'

/**
 * 传说中的长枪出场演出（一个连续动画，总长 1.5 秒）：
 * 枪身与水平线成 25° 朝右上，从屏幕左下角猛地刺入，枪尖最终停在距屏幕顶部 1/4 处；
 * 刺入的同时绕枪身轴线翻面（素材左右镜像，不是整体旋转），越转越快，形成螺旋；
 * 全程只有一条时间线：位移先快后慢、翻面越来越快、最后一小段淡出。素材是内联 SVG，不挡点击。
 */
const props = defineProps<{ delay: number }>()
const emit = defineEmits<{ done: [] }>()

const SCALE = 4.25
const W = 120 * SCALE
const L = 380 * SCALE
const ANGLE = 35 // 枪身与水平线的夹角
const RAD = (ANGLE * Math.PI) / 180
const DIR = { x: Math.cos(RAD), y: -Math.sin(RAD) } // 枪尖朝向：右上
const DURATION_MS = 1000
const FADE_FROM = 0.65 // 时间线进度到此开始淡出
const TURNS = 5 // 总翻面圈数；相位随时间平方增长，起初慢、结尾极快

const root = ref<HTMLElement | null>(null)
const flash = ref(0)
const style = ref({ opacity: '0', transform: 'translate(-9999px, -9999px)' })
const spin = ref({ transform: 'scaleX(1)' })
/** 绕枪身旋转的气流：沿枪身排布的光点，按翻面相位绕轴公转（螺旋线），前侧亮、后侧暗 */
interface Orb { x: number; y: number; r: number; o: number }
const orbs = ref<Orb[]>([])
const swirlOpacity = ref(0)
const ORBS = 26
const SW = W * 2.4 // 气流层宽度，枪身居中
let raf = 0
let startAt = 0
let sfxTimer: ReturnType<typeof setTimeout> | undefined

/** 指数缓出：开头一瞬间冲出大半程，末段只剩缓慢的余势，形成顿挫（归一化到 0..1） */
const EXPO_K = 100
const easeOutExpo = (t: number) => (1 - 2 ** (-EXPO_K * t)) / (1 - 2 ** -EXPO_K)

onMounted(() => {
  sfxTimer = setTimeout(() => void playSpearSfx(), props.delay)
  const w = root.value?.offsetWidth || window.innerWidth
  const h = root.value?.offsetHeight || window.innerHeight
  // 终点：枪尖距顶部 1/4，沿穿过左下角、与水平成 ANGLE 的线（过于靠右时收回到屏幕内）
  const tipEnd = { x: Math.min((h * 0.75) / Math.tan(RAD), w * 0.9), y: h * 0.25 }
  const back = L + 300 // 起点：整杆枪都在屏幕外（左下）
  const centerAt = (slide: number) => {
    // slide = 枪尖离终点的距离（沿枪身方向反向退回）
    const tipX = tipEnd.x - DIR.x * slide
    const tipY = tipEnd.y - DIR.y * slide
    return { x: tipX - (DIR.x * L) / 2, y: tipY - (DIR.y * L) / 2 }
  }

  const frame = (now: number) => {
    if (!startAt) startAt = now + props.delay
    const t = now - startAt
    if (t < 0) {
      raf = requestAnimationFrame(frame)
      return
    }
    if (t >= DURATION_MS) {
      emit('done')
      return
    }
    const p = t / DURATION_MS
    if (p > 0.1 && !flash.value) flash.value = 1 // 猛冲基本到位的瞬间闪一下
    const slide = back * (1 - easeOutExpo(p))
    const flip = Math.cos(TURNS * Math.PI * 2 * p * p)
    const opacity = p < FADE_FROM ? 1 : 1 - (p - FADE_FROM) / (1 - FADE_FROM)
    const c = centerAt(slide)
    style.value = {
      opacity: String(Math.min(opacity, t / 60)),
      transform: `translate(${c.x - W / 2}px, ${c.y - L / 2}px) rotate(${90 - ANGLE}deg)`,
    }
    spin.value = { transform: `scaleX(${flip})` }
    // 公转相位 = 翻面相位，转得越快气流越密；转速到位后才完全显现
    const phase = TURNS * Math.PI * 2 * p * p
    const speed = Math.min(1, p * 4)
    const list: Orb[] = []
    for (let k = 0; k < ORBS; k++) {
      const along = (k / ORBS) * 0.86 + 0.06 // 沿枪身 6%..92%
      const ang = phase * 1.6 + k * 0.62
      const depth = Math.sin(ang) // -1 后侧，1 前侧
      const radius = W * (0.36 + 0.5 * Math.min(1, along * 1.2))
      list.push({
        x: SW / 2 + Math.cos(ang) * radius,
        y: along * L,
        r: 3 + (depth + 1) * 3.2,
        o: (0.18 + 0.82 * ((depth + 1) / 2)) * speed,
      })
    }
    orbs.value = list
    swirlOpacity.value = opacity
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(sfxTimer)
})
</script>

<template>
  <div ref="root" class="spear-layer">
    <CinemaBars :duration="DURATION_MS" :delay="delay" />
    <div v-if="flash" class="impact" />
    <div class="spear" :style="style">
      <!-- 旋转气流：与枪身同向，不随镜像翻面 -->
      <svg class="swirl" :width="SW" :height="L" :viewBox="`0 0 ${SW} ${L}`" :style="{ opacity: swirlOpacity }">
        <ellipse
          v-for="i in 5"
          :key="`ring-${i}`"
          :cx="SW / 2"
          :cy="(i / 6) * L"
          :rx="W * (0.45 + i * 0.1)"
          :ry="W * 0.14"
          fill="none"
          stroke="#fecaca"
          stroke-width="2"
          opacity="0.22"
        />
        <circle
          v-for="(o, i) in orbs"
          :key="i"
          :cx="o.x"
          :cy="o.y"
          :r="o.r"
          fill="#fee2e2"
          :opacity="o.o"
        />
      </svg>
    <svg class="blade" :style="spin" viewBox="0 0 80 380" :width="W" :height="L">
      <defs>
        <linearGradient id="sp-shaft" x1="0" x2="1">
          <stop offset="0" stop-color="#0b0b0f" />
          <stop offset="0.5" stop-color="#3a3a46" />
          <stop offset="1" stop-color="#050507" />
        </linearGradient>
        <linearGradient id="sp-iron" x1="0" x2="1">
          <stop offset="0" stop-color="#1c1c24" />
          <stop offset="0.5" stop-color="#6b7280" />
          <stop offset="1" stop-color="#15151b" />
        </linearGradient>
      </defs>

      <!-- 枪杆：黑铁杆，几道暗铁箍 -->
      <rect x="36" y="118" width="8" height="254" fill="url(#sp-shaft)" />
      <rect x="33" y="170" width="14" height="7" fill="url(#sp-iron)" />
      <rect x="33" y="250" width="14" height="7" fill="url(#sp-iron)" />
      <rect x="32" y="330" width="16" height="9" fill="url(#sp-iron)" />
      <!-- 螺旋刻纹：翻面时斜纹方向会反过来 -->
      <path
        d="M36 186 L44 196 M36 204 L44 214 M36 222 L44 232 M36 240 L44 250 M36 262 L44 272 M36 280 L44 290 M36 298 L44 308 M36 316 L44 326"
        stroke="#9ca3af"
        stroke-width="1.2"
        opacity="0.55"
      />
      <!-- 枪尾：锥形尖刺 -->
      <path d="M40 380 L35 340 L45 340 Z" fill="url(#sp-iron)" />

      <!-- 枪头：细长锋利的柳叶刃，两侧再各带一枚下垂的倒刺 -->
      <path d="M36 122 L16 92 L14 108 L22 136 L36 132 Z" fill="#475569" stroke="#0f172a" stroke-width="0.8" />
      <path d="M44 122 L64 92 L66 108 L58 136 L44 132 Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8" />
      <!-- 刃身：左半暗、右半亮，棱线居中，形成立体的两面刃 -->
      <path d="M40 0 L30 54 L27 82 L31 104 L36 124 L40 124 Z" fill="#64748b" stroke="#0f172a" stroke-width="0.8" />
      <path d="M40 0 L50 54 L53 82 L49 104 L44 124 L40 124 Z" fill="#f1f5f9" stroke="#0f172a" stroke-width="0.8" />
      <path d="M40 0 L40 124" stroke="#1e293b" stroke-width="1.1" />
      <!-- 血槽 -->
      <path d="M40 58 L37 112 M40 58 L43 112" stroke="#334155" stroke-width="0.9" opacity="0.8" />
      <!-- 枪颈：黑铁套筒，带锐角护棱 -->
      <path d="M32 122 L48 122 L52 134 L40 142 L28 134 Z" fill="url(#sp-iron)" stroke="#0f172a" stroke-width="0.8" />
      <path d="M30 134 L22 150 L34 142 Z M50 134 L58 150 L46 142 Z" fill="#1f2937" stroke="#0f172a" stroke-width="0.6" />
      <circle cx="40" cy="130" r="2.4" fill="#b91c1c" />
    </svg>
    </div>
  </div>
</template>

<style scoped>
.spear-layer {
  position: absolute;
  inset: 0;
  z-index: 66;
  overflow: hidden;
  pointer-events: none;
}
.spear {
  position: absolute;
  left: 0;
  top: 0;
  width: v-bind('W + "px"');
  height: v-bind('L + "px"');
  transform-origin: 50% 50%;
  will-change: transform, opacity;
}
.blade {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  filter: drop-shadow(0 0 22px rgba(220, 38, 38, 0.75)) drop-shadow(0 0 6px rgba(255, 255, 255, 0.85));
}
.swirl {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  overflow: visible;
  filter: drop-shadow(0 0 8px rgba(248, 113, 113, 0.9));
}
/* 刺入落点的冲击闪光：整屏白金一闪 */
.impact {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 40% 35%, rgba(255, 247, 214, 0.75), rgba(251, 191, 36, 0.25) 40%, transparent 70%);
  animation: impact 0.45s ease-out both;
}
@keyframes impact {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
