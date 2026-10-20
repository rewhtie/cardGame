<script setup lang="ts">
const props = defineProps<{
  kind: 'draw' | 'discard' | 'exhaust' | 'map'
  /** 角标数字；地图按钮不传则不显示角标 */
  count?: number
  label: string
  /** 悬浮文字位置，默认在上方 */
  tip?: 'top' | 'bottom'
  /** 40px 小尺寸，与设置按钮一致 */
  small?: boolean
  /** 去掉圆形边框（含悬浮高亮边框） */
  borderless?: boolean
}>()
</script>

<template>
  <button
    class="group relative rounded-full hover:-translate-y-0.5 transition flex items-center justify-center"
    :class="[
      props.small ? 'w-10 h-10' : 'w-14 h-14',
      props.borderless
        ? 'bg-transparent border-0 p-0 cursor-pointer'
        : 'bg-slate-800/80 hover:bg-slate-700 border border-slate-600 hover:border-amber-400',
    ]"
    :aria-label="`${label}${count !== undefined ? ` ${count}` : ''}`"
  >
    <svg
      viewBox="0 0 48 48"
      :class="props.small ? 'w-[34px] h-[34px]' : 'w-9 h-9'"
      fill="none"
      stroke-linejoin="round"
    >
      <defs>
        <linearGradient id="pile-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#f97316" />
          <stop offset="1" stop-color="#fde047" />
        </linearGradient>
      </defs>

      <!-- 抽牌堆：叠放的牌背 -->
      <g v-if="kind === 'draw'">
        <rect
          x="9"
          y="9"
          width="24"
          height="32"
          rx="3"
          fill="#1e3a5f"
          stroke="#38bdf8"
          stroke-width="1.5"
        />
        <rect
          x="13"
          y="6"
          width="24"
          height="32"
          rx="3"
          fill="#1e40af"
          stroke="#38bdf8"
          stroke-width="1.5"
        />
        <rect
          x="17"
          y="3"
          width="24"
          height="32"
          rx="3"
          fill="#2563eb"
          stroke="#bae6fd"
          stroke-width="1.5"
        />
        <rect
          x="21"
          y="7"
          width="16"
          height="24"
          rx="2"
          stroke="#bae6fd"
          stroke-width="1"
          opacity="0.6"
        />
        <path d="M29 12l5 7-5 7-5-7z" fill="#fbbf24" stroke="#fde68a" stroke-width="1" />
      </g>

      <!-- 弃牌堆：牌落入托盘 -->
      <g v-else-if="kind === 'discard'">
        <g transform="rotate(-12 20 22)">
          <rect
            x="10"
            y="8"
            width="20"
            height="27"
            rx="3"
            fill="#6b5a4c"
            stroke="#b09c86"
            stroke-width="1.5"
          />
        </g>
        <g transform="rotate(10 28 22)">
          <rect
            x="18"
            y="6"
            width="20"
            height="27"
            rx="3"
            fill="#8a7562"
            stroke="#d8c8b0"
            stroke-width="1.5"
          />
          <path
            d="M28 14v10m-4-4l4 4 4-4"
            stroke="#f1e6d4"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </g>
        <path
          d="M6 33v7a2 2 0 002 2h32a2 2 0 002-2v-7"
          stroke="#b09c86"
          stroke-width="2"
          stroke-linecap="round"
        />
      </g>

      <!-- 地图：折叠的路线图 -->
      <g v-else-if="kind === 'map'">
        <path
          d="M7 12l10-4 14 5 10-4v28l-10 4-14-5-10 4z"
          fill="#132a1f"
          stroke="#34d399"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path d="M17 8v28M31 13v28" stroke="#34d399" stroke-width="1.2" opacity="0.7" />
        <circle cx="24" cy="21" r="3.2" fill="#fcd34d" stroke="#fef3c7" stroke-width="1" />
        <path d="M24 24v7" stroke="#fcd34d" stroke-width="1.6" stroke-linecap="round" />
      </g>

      <!-- 消耗牌堆：燃烧的牌 -->
      <g v-else>
        <rect
          x="11"
          y="16"
          width="26"
          height="28"
          rx="3"
          fill="#431407"
          stroke="#fb923c"
          stroke-width="1.5"
        />
        <path
          d="M24 4c1 5 8 8 8 16a8 8 0 01-16 0c0-3 1.5-5 3-6.500 0 2.500 1 3.500 2 4C21 12 22 8 24 4z"
          fill="url(#pile-flame)"
          stroke="#fef3c7"
          stroke-width="1"
        />
        <path
          d="M24 22c1 2 3 3 3 5.500a3 3 0 01-6 0c0-1.500 1-2.500 3-5.500z"
          fill="#fff7ed"
          opacity="0.85"
        />
      </g>
    </svg>

    <span
      v-if="count !== undefined"
      class="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-slate-900 text-xs font-bold leading-5 text-center shadow"
    >
      {{ count }}
    </span>

    <span
      class="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950 border border-slate-600 text-xs text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
      :class="props.tip === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'"
    >
      {{ label }}
    </span>
  </button>
</template>
