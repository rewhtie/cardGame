<script setup lang="ts">
import { computed } from 'vue'

/**
 * 拖拽瞄准箭头：从起点到终点的弧线，终点带箭头。
 * 必须放在 <svg> 里使用。弧线向上弯，距离越远弯得越多。
 */
const props = defineProps<{
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}>()

const geom = computed(() => {
  const dx = props.x2 - props.x1
  const dy = props.y2 - props.y1
  const len = Math.hypot(dx, dy) || 1
  // 法线取朝上的一侧；弯曲量随距离增长，但设上限避免过度弯折
  const sign = -dx <= 0 ? 1 : -1
  const bend = Math.min(len * 0.25, 90)
  const cx = (props.x1 + props.x2) / 2 + (sign * dy * bend) / len
  const cy = (props.y1 + props.y2) / 2 + (sign * -dx * bend) / len
  // 箭头朝向取曲线终点的切线
  const angle = (Math.atan2(props.y2 - cy, props.x2 - cx) * 180) / Math.PI
  return { path: `M${props.x1} ${props.y1} Q${cx} ${cy} ${props.x2} ${props.y2}`, angle }
})
</script>

<template>
  <g>
    <!-- 暗色描边垫底，保证在任何背景上都看得清 -->
    <path :d="geom.path" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="10" stroke-linecap="round" />
    <path
      :d="geom.path"
      fill="none"
      :stroke="color"
      stroke-width="6"
      stroke-linecap="round"
      stroke-dasharray="2 11"
    />
    <g :transform="`translate(${x2} ${y2}) rotate(${geom.angle})`">
      <path
        d="M4 0 L-22 -15 L-14 0 L-22 15 Z"
        :fill="color"
        stroke="#000"
        stroke-opacity="0.55"
        stroke-width="3"
        stroke-linejoin="round"
      />
    </g>
  </g>
</template>
