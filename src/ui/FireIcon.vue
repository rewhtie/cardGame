<script setup lang="ts">
/** 篝火：交叉的木柴 + 三层火焰 */
defineProps<{ flicker?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 64 64" fill="none" stroke-linejoin="round">
    <defs>
      <linearGradient id="fi-outer" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#dc2626" />
        <stop offset="0.55" stop-color="#f97316" />
        <stop offset="1" stop-color="#fde047" />
      </linearGradient>
      <linearGradient id="fi-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a16207" />
        <stop offset="1" stop-color="#451a03" />
      </linearGradient>
    </defs>

    <g :class="{ flame: flicker }">
      <path
        d="M32 4c2 8 14 13 14 27a14 14 0 01-28 0c0-6 3-10 6-13 0 4 2 6 4 7C27 18 30 12 32 4z"
        fill="url(#fi-outer)"
        stroke="#fef3c7"
        stroke-width="1.2"
      />
      <path
        d="M32 24c2 4 7 6 7 12a7 7 0 01-14 0c0-3 2-5 4-7 0 2 1 3 2 3 0-3 0-5 1-8z"
        fill="#fde68a"
        opacity="0.95"
      />
      <path d="M32 34c1 2 3 3 3 5a3 3 0 01-6 0c0-2 2-3 3-5z" fill="#fffbeb" />
    </g>

    <rect
      x="6"
      y="49"
      width="52"
      height="8"
      rx="4"
      transform="rotate(-9 32 53)"
      fill="url(#fi-wood)"
      stroke="#1c0a02"
      stroke-width="1.2"
    />
    <rect
      x="6"
      y="49"
      width="52"
      height="8"
      rx="4"
      transform="rotate(9 32 53)"
      fill="url(#fi-wood)"
      stroke="#1c0a02"
      stroke-width="1.2"
    />
    <circle cx="9" cy="52" r="2.2" fill="#78350f" />
    <circle cx="55" cy="52" r="2.2" fill="#78350f" />
  </svg>
</template>

<style scoped>
.flame {
  transform-origin: 32px 46px;
  animation: flicker 1.4s ease-in-out infinite alternate;
}
@keyframes flicker {
  from {
    transform: scale(1, 1);
  }
  to {
    transform: scale(0.96, 1.05);
  }
}
@media (prefers-reduced-motion: reduce) {
  .flame {
    animation: none;
  }
}
</style>
