<script setup lang="ts">
/** 悬浮立即显示的提示框（不走浏览器 title 的延迟）；默认在宿主下方居中，align=left 时左对齐 */
withDefaults(
  defineProps<{
    icon: string
    name: string
    text: string
    tag?: string
    hint?: string
    color?: string
    align?: 'center' | 'left'
  }>(),
  { color: '#fbbf24', align: 'center' },
)
</script>

<template>
  <span class="tip-host" :class="{ 'is-left': align === 'left' }">
    <slot />
    <span class="tip" :style="{ '--tip-color': color }">
      <span class="tip-title">
        <span class="text-base">{{ icon }}</span>
        <span>{{ name }}</span>
        <span v-if="tag" class="tip-tag">{{ tag }}</span>
      </span>
      <span class="tip-text">{{ text }}</span>
      <span v-if="hint" class="tip-hint">{{ hint }}</span>
    </span>
  </span>
</template>

<style scoped>
.tip-host {
  position: relative;
  display: inline-flex;
  cursor: help;
}
.tip-host:hover {
  z-index: 30;
}
.tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 40;
  display: block;
  width: max-content;
  max-width: 13rem;
  padding: 0.5rem 0.7rem 0.55rem;
  text-align: left;
  font-size: 0.8rem;
  font-weight: 400;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -4px);
  transition:
    opacity 0.08s,
    transform 0.08s;
  background: linear-gradient(180deg, #1e2540, #12162a);
  border: 1px solid var(--tip-color);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.6),
    0 8px 20px rgba(0, 0, 0, 0.6);
}
.is-left .tip {
  left: 0;
  transform: translate(0, -4px);
}
.tip-host:hover .tip {
  opacity: 1;
  transform: translate(-50%, 0);
}
.is-left:hover .tip {
  transform: translate(0, 0);
}
/* 小三角 */
.tip::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 50%;
  width: 8px;
  height: 8px;
  background: #1e2540;
  border-top: 1px solid var(--tip-color);
  border-left: 1px solid var(--tip-color);
  transform: translateX(-50%) rotate(45deg);
}
.is-left .tip::before {
  left: 16px;
}
.tip-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--tip-color);
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.tip-tag {
  margin-left: auto;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #0f172a;
  background: var(--tip-color);
  border-radius: 999px;
}
.tip-text {
  display: block;
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  line-height: 1.45;
  color: #e2e8f0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.tip-hint {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.72rem;
  color: var(--tip-color);
  opacity: 0.85;
}
</style>
