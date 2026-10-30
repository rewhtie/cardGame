<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DESIGN_SIZE, fitScale } from '@/settings/settings'

const frame = ref<HTMLElement | null>(null)
const scale = ref(1)
const viewportStyle = ref<Record<string, string>>({})
let observer: ResizeObserver | undefined
let mobileQuery: MediaQueryList | undefined
const portraitMobile = ref(false)
const entering = ref(false)
const orientationHint = ref('请将手机横过来，获得完整游戏画面。')

function updateOrientation() {
  portraitMobile.value = !!mobileQuery?.matches && window.innerHeight > window.innerWidth
}

async function enterLandscape() {
  if (entering.value) return
  entering.value = true
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        orientationHint.value = '浏览器不支持自动全屏，请手动将手机横过来。'
      }
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>
    }
    if (orientation?.lock) {
      try {
        await orientation.lock('landscape')
      } catch {
        orientationHint.value = '请关闭手机的方向锁定，再手动横屏游玩。'
      }
    } else {
      orientationHint.value = '请关闭手机的方向锁定，再手动横屏游玩。'
    }
    updateViewport()
  } finally {
    entering.value = false
  }
}

function updateScale() {
  const el = frame.value
  if (!el) return
  const css = getComputedStyle(el)
  const width = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
  const height = el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
  scale.value = fitScale(Math.max(1, width), Math.max(1, height))
}

function updateViewport() {
  updateOrientation()
  const viewport = window.visualViewport
  viewportStyle.value = {
    width: `${viewport?.width ?? window.innerWidth}px`,
    height: `${viewport?.height ?? window.innerHeight}px`,
    left: `${viewport?.offsetLeft ?? 0}px`,
    top: `${viewport?.offsetTop ?? 0}px`,
  }
}

onMounted(() => {
  mobileQuery = window.matchMedia('(any-pointer: coarse)')
  mobileQuery.addEventListener('change', updateOrientation)
  window.addEventListener('orientationchange', updateViewport)
  document.addEventListener('fullscreenchange', updateViewport)
  observer = new ResizeObserver(updateScale)
  if (frame.value) observer.observe(frame.value)
  updateViewport()
  updateScale()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
})
onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', updateOrientation)
  window.removeEventListener('orientationchange', updateViewport)
  document.removeEventListener('fullscreenchange', updateViewport)
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
    <div
      class="relative flex-none overflow-hidden"
      :style="stageStyle"
      :inert="portraitMobile"
      :aria-hidden="portraitMobile || undefined"
    >
      <slot />
    </div>
  </div>
  <Teleport to="body">
    <div v-if="portraitMobile" class="landscape-prompt" :style="viewportStyle">
      <div class="landscape-prompt-content">
        <div class="landscape-phone" aria-hidden="true">↻</div>
        <h1>请横屏游玩</h1>
        <p aria-live="polite">{{ orientationHint }}</p>
        <button type="button" :disabled="entering" @click="enterLandscape">
          {{ entering ? '正在进入…' : '进入游戏' }}
        </button>
        <p class="landscape-note">支持的浏览器会尝试全屏并锁定横屏；也可以直接手动旋转手机。</p>
      </div>
    </div>
  </Teleport>
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

body,
body * {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

body input,
body textarea,
body [contenteditable]:not([contenteditable="false"]),
body [contenteditable]:not([contenteditable="false"]) * {
  -webkit-user-select: text;
  user-select: text;
}

body img {
  -webkit-user-drag: none;
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

.landscape-prompt {
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, env(safe-area-inset-top, 0px))
    max(24px, env(safe-area-inset-right, 0px))
    max(24px, env(safe-area-inset-bottom, 0px))
    max(24px, env(safe-area-inset-left, 0px));
  overflow: auto;
  background: #090d15;
  color: #edf2fa;
  text-align: center;
}

.landscape-prompt-content {
  width: 100%;
  max-width: 360px;
}

.landscape-phone {
  margin-bottom: 20px;
  font-size: 64px;
  color: #e6bd76;
}

.landscape-prompt h1 {
  margin: 0 0 16px;
  font-size: 26px;
}

.landscape-prompt p {
  line-height: 1.7;
  color: #b9c3d5;
}

.landscape-prompt button {
  margin: 16px 0;
  min-height: 48px;
  padding: 12px 32px;
  border: 1px solid #e6bd76;
  border-radius: 8px;
  background: #e6bd76;
  color: #15110b;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.landscape-prompt button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.landscape-prompt .landscape-note {
  font-size: 13px;
}
</style>
