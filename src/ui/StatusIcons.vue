<script setup lang="ts">
import { computed } from 'vue'
import { STATUSES, statusTip } from '@/engine/statuses'

const props = defineProps<{ statuses: Record<string, number>; vertical?: boolean }>()

/** 按注册表顺序显示，层数为 0 的不显示 */
const items = computed(() =>
  STATUSES.filter((d) => (props.statuses[d.id] ?? 0) > 0).map((d) => ({
    def: d,
    stacks: props.statuses[d.id]!,
    tip: statusTip(d, props.statuses[d.id]),
  })),
)
</script>

<template>
  <div v-if="items.length" class="flex gap-1.5" :class="vertical ? 'flex-col flex-wrap items-start max-h-56' : 'flex-wrap justify-center'">
    <!-- 自定义提示：悬浮立即出现，不走浏览器 title 的延迟 -->
    <div
      v-for="item in items"
      :key="item.def.id"
      class="tip-host group relative w-8 h-8 flex items-center justify-center rounded-md border-2 text-base cursor-help hover:z-30"
      :class="item.def.kind === 'buff' ? 'is-buff' : 'is-debuff'"
    >
      {{ item.def.icon }}
      <span
        class="absolute -right-1.5 -bottom-1.5 min-w-4 px-1 rounded-full bg-slate-950 border border-slate-600 text-[10px] leading-4 text-center text-white font-bold"
      >
        {{ item.stacks }}
      </span>

      <div class="tip" :class="item.def.kind === 'buff' ? 'tip-buff' : 'tip-debuff'">
        <div class="tip-title">
          <span class="text-base">{{ item.def.icon }}</span>
          <span>{{ item.def.name }}</span>
          <span class="tip-kind">{{ item.def.kind === 'buff' ? '增益' : '减益' }}</span>
        </div>
        <div class="tip-text">
          <template v-if="item.tip.perLayer !== item.def.text"><b>每层：</b></template
          >{{ item.tip.perLayer }}
        </div>
        <div v-if="item.tip.total !== undefined" class="tip-text tip-total">
          <b>当前 {{ item.stacks }} 层：</b>{{ item.tip.total }}
        </div>
        <div class="tip-duration">{{ item.tip.duration }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tip-host {
  background: radial-gradient(circle at 50% 35%, #4a3b30, #18100c 85%);
}
.is-buff {
  border-color: #34d399;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.35);
}
.is-debuff {
  border-color: #f87171;
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.35);
}

.tip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 40;
  width: max-content;
  max-width: 13rem;
  padding: 0.5rem 0.7rem 0.55rem;
  text-align: left;
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
.tip-host:hover .tip {
  opacity: 1;
  transform: translate(-50%, 0);
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
.tip-buff {
  --tip-color: #34d399;
}
.tip-debuff {
  --tip-color: #f87171;
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
.tip-kind {
  margin-left: auto;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #18100c;
  background: var(--tip-color);
  border-radius: 999px;
}
.tip-text {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #f1e6d4;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.tip-total {
  margin-top: 0.2rem;
  padding-top: 0;
  border-top: 0;
}
.tip-duration {
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: var(--tip-color);
}
</style>
