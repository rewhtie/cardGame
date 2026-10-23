<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
/** 全屏受伤特效：边缘泛红光并抖一下，中间砸出失去量；不挡点击。与 HealFx 成对 */
defineProps<{ amount: number }>()
</script>

<template>
  <div class="hurt-screen">
    <div class="hurt-text">-{{ amount }} <Emoji e="💔" /></div>
  </div>
</template>

<style scoped>
.hurt-screen {
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, transparent 25%, rgba(220, 38, 38, 0.6));
  /* step-end 抽帧：与摇晃卡牌同一套顿挫感 */
  animation:
    hurt-glow 0.9s ease-out forwards,
    hurt-shake 0.4s step-end;
}
.hurt-text {
  font-size: 64px;
  font-weight: 800;
  color: #fca5a5;
  text-shadow: 0 0 20px #dc2626;
  animation: hurt-slam 0.9s ease-out forwards;
}
@keyframes hurt-glow {
  0% {
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes hurt-shake {
  0% {
    transform: translate(-10px, 4px);
  }
  25% {
    transform: translate(9px, -4px);
  }
  50% {
    transform: translate(-6px, 2px);
  }
  75% {
    transform: translate(3px, 0);
  }
  100% {
    transform: translate(0, 0);
  }
}
@keyframes hurt-slam {
  from {
    transform: translateY(-20px) scale(1.5);
  }
  30% {
    transform: translateY(0) scale(1);
  }
  to {
    transform: translateY(30px) scale(0.95);
  }
}
</style>
