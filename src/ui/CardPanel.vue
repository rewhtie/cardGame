<script setup lang="ts">
/**
 * 选牌类弹框的公共外壳：金属渐变外框 + 深色背景 + 四角菱形装饰 + 标题栏。
 * 牌堆查看、遗物选牌、锻造、卡牌奖励共用。内容放默认插槽（可滚动），按钮放 footer 插槽。
 */
defineProps<{ title?: string; hint?: string; closable?: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="panel">
    <div class="inner">
      <button v-if="closable" class="close" title="关闭" aria-label="关闭" @click="$emit('close')">
        <svg viewBox="0 0 16 16" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round" />
        </svg>
      </button>
      <header v-if="title || $slots.title" class="head">
        <span class="line" />
        <span class="title"><slot name="title">{{ title }}</slot></span>
        <span class="line" />
      </header>
      <p v-if="hint" class="hint">{{ hint }}</p>
      <div v-if="$slots.toolbar" class="toolbar"><slot name="toolbar" /></div>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer" class="foot"><slot name="footer" /></footer>
    </div>
    <span class="corner tl" />
    <span class="corner tr" />
    <span class="corner bl" />
    <span class="corner br" />
  </div>
</template>

<style scoped>
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 30rem;
  max-width: min(1100px, 100%);
  max-height: 100%;
  min-height: 0;
  padding: 5px;
  border-radius: 16px;
  /* 与卡面外框同源的金属渐变 */
  background: linear-gradient(145deg, #fef3c7, #d97706 30%, #78350f 55%, #b45309 75%, #fcd34d);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.75),
    0 0 48px rgba(217, 119, 6, 0.18);
}
.inner {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 1.25rem 1rem 1rem;
  border-radius: 11px;
  background:
    radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99, 102, 241, 0.18), transparent 70%),
    radial-gradient(ellipse 70% 40% at 50% 100%, rgba(217, 119, 6, 0.16), transparent 70%),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 14px),
    linear-gradient(180deg, #131a33, #0d1224);
  /* 内侧细线：像镶边的凹槽 */
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.7),
    inset 0 0 0 3px rgba(251, 191, 36, 0.18),
    inset 0 0 36px rgba(0, 0, 0, 0.6);
}

/* 右上角关闭图标 */
.close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  cursor: pointer;
  color: #fde68a;
  background: rgba(24, 16, 12, 0.7);
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 50%;
  transition:
    color 0.15s,
    background 0.15s,
    transform 0.15s;
}
.close:hover {
  color: #1c1917;
  background: #fbbf24;
  transform: rotate(90deg);
}

.head {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0 1.5rem;
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #fde68a;
  text-shadow:
    0 2px 4px rgba(0, 0, 0, 0.8),
    0 0 14px rgba(251, 191, 36, 0.35);
}
.line {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.7), transparent);
}
.hint {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: #b09c86;
}
/* 标题下方的固定工具栏（如分页标签），不随内容滚动 */
.toolbar {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 留出上浮与光晕的空间，避免被滚动容器裁掉 */
  padding: 1.75rem 1.5rem 1.25rem;
}
.foot {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(251, 191, 36, 0.2);
}

/* 四角菱形铆钉 */
.corner {
  position: absolute;
  z-index: 1;
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #fef3c7, #d97706);
  border: 1px solid rgba(0, 0, 0, 0.65);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}
.tl {
  top: -4px;
  left: -4px;
}
.tr {
  top: -4px;
  right: -4px;
}
.bl {
  bottom: -4px;
  left: -4px;
}
.br {
  right: -4px;
  bottom: -4px;
}
</style>
