<script setup lang="ts">
/** 铁砧：砧面、尖角、腰身、底座，上方带火星 */
</script>

<template>
  <svg viewBox="0 0 64 64" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <defs>
      <linearGradient id="av-iron" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d8c8b0" />
        <stop offset="0.35" stop-color="#8a7562" />
        <stop offset="1" stop-color="#2d221c" />
      </linearGradient>
    </defs>

    <!-- 火星 -->
    <g stroke="#fde047" stroke-width="2">
      <path d="M30 6v6M22 9l3 5M38 9l-3 5M16 16l5 3M44 16l-5 3" />
    </g>

    <!-- 砧体：左侧尖角 + 砧面 + 腰身 + 底座 -->
    <path
      d="M5 25c9 0 14-3 17-3h36c0 8-6 13-14 13h-5c0 4 1 8 5 10v6H14v-6c4-2 5-6 5-10h-2C11 35 6 31 5 25z"
      fill="url(#av-iron)"
      stroke="#18100c"
      stroke-width="1.5"
    />
    <path d="M22 22h36" stroke="#f1e6d4" stroke-width="1.5" opacity="0.7" />
    <path d="M14 51h36" stroke="#18100c" stroke-width="1.5" opacity="0.6" />
  </svg>
</template>
