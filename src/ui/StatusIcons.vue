<script setup lang="ts">
import { computed } from 'vue'
import { STATUSES, statusTip } from '@/engine/statuses'

const props = defineProps<{ statuses: Record<string, number>; vertical?: boolean }>()

/**
 * 临时层数记账：temp:xxx（玩家，回合结束失去，层数为正）、restore:xxx（敌人被临时削减，回合结束恢复）。
 * 返回该状态临时部分的带符号数值：temp 为 +n，restore 为 -n。
 */
const tempOf = (id: string) => (props.statuses['temp:' + id] ?? 0) - (props.statuses['restore:' + id] ?? 0)
const tempText = (signed: number) =>
  signed > 0 ? `回合结束时失去这 ${signed} 层` : `敌人回合结束时恢复这 ${-signed} 点`

/** 按注册表顺序显示，层数为 0 的不显示；整层都是临时的，直接在悬浮说明里写清空时点 */
const items = computed(() =>
  STATUSES.filter((d) => (props.statuses[d.id] ?? 0) !== 0).map((d) => {
    const stacks = props.statuses[d.id]!
    const temp = tempOf(d.id)
    return {
      def: d,
      stacks,
      tip: statusTip(d, stacks),
      tempNote: temp !== 0 && stacks === temp ? tempText(temp) : undefined,
    }
  }),
)

/** 同一个状态里永久和临时层数并存时，才合并出一个通用图标，悬浮时逐项列出临时部分 */
const temps = computed(() =>
  STATUSES.flatMap((d) => {
    const stacks = props.statuses[d.id] ?? 0
    const temp = tempOf(d.id)
    if (stacks === 0 || temp === 0 || stacks === temp) return []
    return [{ key: d.id, icon: d.icon, name: d.name, temp, perm: stacks - temp }]
  }),
)
const total = computed(() => temps.value.reduce((a, b) => a + Math.abs(b.temp), 0))

/** 竖排：图标 32px、间距 6px。先从底部向上排一列，排满 MIN_ROWS 个再换列，最多 MAX_COLS 列（图标再多就加高） */
const ICON = 32
const GAP_PX = 6
const MIN_ROWS = 5
const MAX_COLS = 3
const columnStyle = computed(() => {
  const count = items.value.length + (temps.value.length ? 1 : 0)
  const rows = Math.max(MIN_ROWS, Math.ceil(count / MAX_COLS))
  return { maxHeight: `${rows * ICON + (rows - 1) * GAP_PX}px` }
})

/** 悬浮说明的弹出方向：按 下、右、左、上 的顺序，取第一个完整落在可视区内的；都放不下就取溢出最少的 */
const GAP = 8
const EDGE = 4
const SIDES = ['bottom', 'right', 'left', 'top'] as const
function placeTip(e: MouseEvent) {
  const host = e.currentTarget as HTMLElement
  const tip = host.querySelector<HTMLElement>('.tip')
  if (!tip) return
  const r = host.getBoundingClientRect()
  const { width: w, height: h } = tip.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let best: (typeof SIDES)[number] = 'bottom'
  let bestOver = Infinity
  for (const side of SIDES) {
    const left =
      side === 'right' ? r.right + GAP : side === 'left' ? r.left - GAP - w : r.left + r.width / 2 - w / 2
    const top =
      side === 'bottom' ? r.bottom + GAP : side === 'top' ? r.top - GAP - h : r.top + r.height / 2 - h / 2
    const over =
      Math.max(0, EDGE - left) +
      Math.max(0, EDGE - top) +
      Math.max(0, left + w - (vw - EDGE)) +
      Math.max(0, top + h - (vh - EDGE))
    if (over === 0) {
      best = side
      break
    }
    if (over < bestOver) {
      bestOver = over
      best = side
    }
  }
  host.dataset.side = best
}
</script>

<template>
  <div
    v-if="items.length || temps.length"
    class="flex gap-1.5"
    :class="vertical ? 'flex-col flex-wrap items-start content-start' : 'flex-wrap justify-center'"
    :style="vertical ? columnStyle : undefined"
  >
    <!-- 自定义提示：悬浮立即出现，不走浏览器 title 的延迟 -->
    <div
      v-for="item in items"
      :key="item.def.id"
      class="tip-host group relative w-8 h-8 flex items-center justify-center rounded-md border-2 text-base cursor-help hover:z-30"
      :class="item.def.kind === 'buff' ? 'is-buff' : 'is-debuff'"
      @mouseenter="placeTip"
    >
      {{ item.def.icon }}
      <!-- 数值型：显示层数本身；能力型：只有叠到 2 层以上才显示小号 ×N -->
      <span
        v-if="item.def.display !== 'count'"
        class="absolute -right-1.5 -bottom-1.5 min-w-4 px-1 rounded-full bg-slate-950 border border-slate-600 text-[10px] leading-4 text-center text-white font-bold"
      >
        {{ item.stacks }}
      </span>
      <span
        v-else-if="item.stacks > 1"
        class="absolute -right-1 -bottom-1 px-0.5 rounded bg-slate-950/90 text-[9px] leading-3 text-amber-200 font-bold"
      >
        ×{{ item.stacks }}
      </span>

      <div class="tip" :class="item.def.kind === 'buff' ? 'tip-buff' : 'tip-debuff'">
        <div class="tip-title">
          <span class="text-base">{{ item.def.icon }}</span>
          <span>{{ item.def.name }}</span>
          <span class="tip-kind">{{ item.def.kind === 'buff' ? '增益' : '减益' }}</span>
        </div>
        <div class="tip-text">
          <template v-if="!item.tip.plain && item.tip.perLayer !== item.def.text"><b>每层：</b></template
          >{{ item.tip.perLayer }}
        </div>
        <div v-if="item.tip.total !== undefined" class="tip-text tip-total">
          <b>当前 {{ item.stacks }} 层：</b>{{ item.tip.total }}
        </div>
        <div class="tip-duration">{{ item.tempNote ?? item.tip.duration }}</div>
      </div>
    </div>
    <!-- 通用「临时层数」图标：只有同一状态永久、临时层数并存时才出现 -->
    <div v-if="temps.length" class="tip-host group relative w-8 h-8 flex items-center justify-center rounded-md border-2 text-base cursor-help hover:z-30 is-buff" @mouseenter="placeTip">
      ⏳
      <span class="absolute -right-1.5 -bottom-1.5 min-w-4 px-1 rounded-full bg-slate-950 border border-slate-600 text-[10px] leading-4 text-center text-white font-bold">{{ total }}</span>
      <div class="tip tip-buff">
        <div class="tip-title">
          <span class="text-base">⏳</span>
          <span>临时层数</span>
          <span class="tip-kind">增益</span>
        </div>
        <div v-for="t in temps" :key="t.key" class="tip-text">{{ t.icon }} {{ t.name }}：永久 {{ t.perm }}，临时 {{ t.temp }}（{{ tempText(t.temp) }}）</div>
        <div class="tip-duration">永久和临时层数同时存在的状态</div>
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
  --hide: translate(-50%, -4px);
  --show: translate(-50%, 0);
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
  transform: var(--hide);
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
  transform: var(--show);
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
/* 方向：默认在下方，placeTip 悬浮时按可视区写入 data-side */
.tip-host[data-side='top'] .tip {
  --hide: translate(-50%, 4px);
  top: auto;
  bottom: calc(100% + 8px);
}
.tip-host[data-side='top'] .tip::before {
  top: auto;
  bottom: -5px;
  border: 0;
  border-bottom: 1px solid var(--tip-color);
  border-right: 1px solid var(--tip-color);
}
.tip-host[data-side='right'] .tip {
  --hide: translate(-4px, -50%);
  --show: translate(0, -50%);
  top: 50%;
  left: calc(100% + 8px);
}
.tip-host[data-side='right'] .tip::before {
  top: 50%;
  left: -5px;
  border: 0;
  border-left: 1px solid var(--tip-color);
  border-bottom: 1px solid var(--tip-color);
  transform: translateY(-50%) rotate(45deg);
}
.tip-host[data-side='left'] .tip {
  --hide: translate(4px, -50%);
  --show: translate(0, -50%);
  top: 50%;
  left: auto;
  right: calc(100% + 8px);
}
.tip-host[data-side='left'] .tip::before {
  top: 50%;
  left: auto;
  right: -5px;
  border: 0;
  border-top: 1px solid var(--tip-color);
  border-right: 1px solid var(--tip-color);
  transform: translateY(-50%) rotate(45deg);
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
