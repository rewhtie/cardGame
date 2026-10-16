<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DESIGN_SIZE, fitScale } from '@/settings/settings'

const scale = ref(1)

function update() {
  scale.value = fitScale(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  update()
  window.addEventListener('resize', update)
})
onBeforeUnmount(() => window.removeEventListener('resize', update))

const stageStyle = computed(() => ({
  width: `${DESIGN_SIZE.width}px`,
  height: `${DESIGN_SIZE.height}px`,
  transform: `scale(${scale.value})`,
}))
</script>

<template>
  <!-- 固定设计分辨率的舞台，整体等比缩放并居中，多余部分留黑边，永远不出滚动条 -->
  <div class="fixed inset-0 overflow-hidden bg-black flex items-center justify-center">
    <div class="relative flex-none overflow-hidden" :style="stageStyle">
      <slot />
    </div>
  </div>
</template>
