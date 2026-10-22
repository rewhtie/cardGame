<script setup lang="ts">
/** 全屏回血特效：边缘泛绿光，中间浮起回复量；不挡点击 */
defineProps<{ amount: number; maxHp?: boolean }>()
</script>

<template>
  <div class="heal-screen">
    <div class="heal-text">{{ maxHp ? `最大生命 +${amount}` : `+${amount}` }} ❤</div>
  </div>
</template>

<style scoped>
.heal-screen {
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, transparent 30%, rgba(52, 211, 153, 0.55));
  animation: heal-glow 1.1s ease-out forwards;
}
.heal-text {
  font-size: 64px;
  font-weight: 800;
  color: #6ee7b7;
  text-shadow: 0 0 20px #10b981;
  animation: heal-rise 1.1s ease-out forwards;
}
@keyframes heal-glow {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes heal-rise {
  from {
    transform: translateY(30px) scale(0.8);
  }
  to {
    transform: translateY(-40px) scale(1.1);
  }
}
</style>
