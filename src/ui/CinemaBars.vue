<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * 通用电影黑边：屏幕上下各一条黑边，滑入 → 停留 → 滑出，一次完整播放。
 * 可单独使用，也可挂在任何演出旁边组合（duration / delay 与演出一致即可）。不挡点击。
 * 父级需要是定位元素（relative / absolute），黑边铺满它。
 *
 *   <CinemaBars :duration="1000" :delay="200" />
 */
const props = withDefaults(
  defineProps<{
    /** 从滑入开始到滑出结束的总时长（ms） */
    duration: number
    /** 延迟多少 ms 后开始 */
    delay?: number
    /** 单条黑边占屏幕高度的百分比 */
    height?: number
    /** 滑入占总时长的比例 */
    inRatio?: number
    /** 开始滑出的时间点占总时长的比例 */
    outAt?: number
    zIndex?: number
  }>(),
  { delay: 0, height: 12, inRatio: 0.12, outAt: 0.8, zIndex: 65 },
)

const top = ref<HTMLElement | null>(null)
const bottom = ref<HTMLElement | null>(null)

onMounted(() => {
  const play = (el: HTMLElement | null, from: string) =>
    el?.animate(
      [
        { transform: `translateY(${from})`, offset: 0 },
        { transform: 'translateY(0)', offset: props.inRatio },
        { transform: 'translateY(0)', offset: props.outAt },
        { transform: `translateY(${from})`, offset: 1 },
      ],
      { duration: props.duration, delay: props.delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' },
    )
  play(top.value, '-100%')
  play(bottom.value, '100%')
})
</script>

<template>
  <div class="cinema" :style="{ zIndex }">
    <!-- 动画开始前先藏在屏幕外，避免延迟期间黑边直接盖在画面上 -->
    <div ref="top" class="bar top" :style="{ height: `${height}%` }" />
    <div ref="bottom" class="bar bottom" :style="{ height: `${height}%` }" />
  </div>
</template>

<style scoped>
.cinema {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.bar {
  position: absolute;
  left: 0;
  right: 0;
  background: #000;
}
.top {
  top: 0;
  transform: translateY(-100%);
}
.bottom {
  bottom: 0;
  transform: translateY(100%);
}
</style>
