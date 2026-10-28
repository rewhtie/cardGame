<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DESIGN_SIZE, fitScale } from '@/settings/settings'

const frame = ref<HTMLElement | null>(null)
const scale = ref(1)
const viewportStyle = ref<Record<string, string>>({})
let observer: ResizeObserver | undefined

function updateScale() {
  const el = frame.value
  if (!el) return
  const css = getComputedStyle(el)
  const width = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
  const height = el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
  scale.value = fitScale(Math.max(1, width), Math.max(1, height))
}

function updateViewport() {
  const viewport = window.visualViewport
  viewportStyle.value = {
    width: `${viewport?.width ?? window.innerWidth}px`,
    height: `${viewport?.height ?? window.innerHeight}px`,
    left: `${viewport?.offsetLeft ?? 0}px`,
    top: `${viewport?.offsetTop ?? 0}px`,
  }
}

onMounted(() => {
  observer = new ResizeObserver(updateScale)
  if (frame.value) observer.observe(frame.value)
  updateViewport()
  updateScale()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
})

const stageStyle = computed(() => ({
  width: `${DESIGN_SIZE.width}px`,
  height: `${DESIGN_SIZE.height}px`,
  transform: `scale(${scale.value})`,
}))
</script>

<template>
  <div ref="frame" class="stage-frame" :style="viewportStyle">
    <div class="relative flex-none overflow-hidden" :style="stageStyle">
      <slot />
    </div>
  </div>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

.stage-frame {
  position: fixed;
  inset: 0 auto auto 0;
  width: 100%;
  height: 100dvh;
  box-sizing: border-box;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
  touch-action: manipulation;
  -webkit-text-size-adjust: 100%;
}
</style>
