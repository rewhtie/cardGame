<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { potions as potionDefs, relics as relicDefs } from '@/data/items'
import { POTION_RULES } from '@/engine/potions'
import { maxPotions } from '@/engine/run'
import HoverTip from './HoverTip.vue'

const props = defineProps<{
  hp: number
  maxHp: number
  gold: number
  potions: string[]
  relics: string[]
  /** 战斗中的玩家回合才能使用药水 */
  canUse?: boolean
  /** 存活的敌人数：只剩一只时，单击投掷类药水即可直接打出 */
  livingEnemies?: number
}>()
const emit = defineEmits<{ use: [index: number, target?: number]; aim: [enemy: number | null] }>()

// ---- 拖拽用药：投掷类拖到敌人身上松手；饮用类单击，或拖到手牌区上沿以上松手 ----
const DRAG_THRESHOLD = 6
/** 手牌区上沿（设计像素），与出牌一致 */
const HAND_TOP = 470

const origin = ref<HTMLElement | null>(null)
const drag = ref<{
  index: number
  startX: number
  startY: number
  pressX: number
  pressY: number
  x: number
  y: number
  active: boolean
} | null>(null)
const aimed = ref<number | null>(null)

const ruleOf = (index: number) => POTION_RULES[props.potions[index] ?? '']
const dragAimsEnemy = () => !!drag.value?.active && ruleOf(drag.value.index)?.target === 'enemy'

/** 舞台被 CSS 整体缩放，屏幕坐标需换算回设计像素 */
function toStage(clientX: number, clientY: number) {
  const el = origin.value
  if (!el) return { x: clientX, y: clientY }
  const rect = el.getBoundingClientRect()
  const k = el.offsetWidth ? rect.width / el.offsetWidth : 1
  return { x: (clientX - rect.left) / k, y: (clientY - rect.top) / k }
}

function enemyUnder(clientX: number, clientY: number): number | null {
  const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-enemy-index]')
  return hit ? Number(hit.getAttribute('data-enemy-index')) : null
}

function onPress(index: number, e: PointerEvent) {
  if (!props.canUse || e.button !== 0 || !ruleOf(index)) return
  const slot = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const from = toStage(slot.left + slot.width / 2, slot.top + slot.height / 2)
  const p = toStage(e.clientX, e.clientY)
  drag.value = {
    index,
    startX: from.x,
    startY: from.y,
    pressX: p.x,
    pressY: p.y,
    x: p.x,
    y: p.y,
    active: false,
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onRelease)
  window.addEventListener('pointercancel', stopDrag)
}

function onMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = toStage(e.clientX, e.clientY)
  d.x = p.x
  d.y = p.y
  if (!d.active && Math.hypot(p.x - d.pressX, p.y - d.pressY) > DRAG_THRESHOLD) d.active = true
  drag.value = { ...d }
  aimed.value = dragAimsEnemy() ? enemyUnder(e.clientX, e.clientY) : null
  emit('aim', aimed.value)
}

function onRelease(e: PointerEvent) {
  const d = drag.value
  stopDrag()
  if (!d) return
  const rule = ruleOf(d.index)
  if (!rule) return

  if (!d.active) {
    // 单击：饮用类直接喝；投掷类只剩一只敌人时直接扔
    if (rule.target === 'self' || (props.livingEnemies ?? 0) <= 1) emit('use', d.index)
    return
  }
  if (rule.target === 'enemy') {
    const target = enemyUnder(e.clientX, e.clientY)
    if (target !== null) emit('use', d.index, target)
  } else if (toStage(e.clientX, e.clientY).y < HAND_TOP) {
    emit('use', d.index)
  }
}

function stopDrag() {
  drag.value = null
  aimed.value = null
  emit('aim', null)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onRelease)
  window.removeEventListener('pointercancel', stopDrag)
}

onBeforeUnmount(stopDrag)

const hintOf = (id: string | undefined) => {
  if (!props.canUse || !id) return undefined
  return POTION_RULES[id]?.target === 'enemy' ? '拖到敌人身上投掷' : '单击饮用，或拖到上方饮用'
}
</script>

<template>
  <div
    class="absolute top-0 left-0 right-0 z-10 flex flex-col pointer-events-none text-slate-100 text-sm"
  >
    <!-- 第一行：人物、生命、药水、金币 -->
    <div class="hud flex items-center gap-4 min-w-0 px-4 py-2 pointer-events-auto">
      <!-- 人物头像：头盔剪影 -->
      <svg
        class="w-9 h-9 flex-none"
        viewBox="0 0 48 48"
        fill="none"
        stroke-linejoin="round"
        stroke-linecap="round"
      >
        <circle cx="24" cy="24" r="22" fill="#1e293b" stroke="#fcd34d" stroke-width="2" />
        <path
          d="M12 28c0-9 5-15 12-15s12 6 12 15v5a2 2 0 01-2 2H14a2 2 0 01-2-2z"
          fill="#64748b"
          stroke="#0f172a"
          stroke-width="1.5"
        />
        <path d="M24 13v22" stroke="#0f172a" stroke-width="1.5" />
        <path d="M14 25h20v5H14z" fill="#0f172a" />
        <path d="M24 8c-1 3 0 4 0 5 1-1 2-3 0-5z" fill="#ef4444" stroke="#ef4444" />
      </svg>

      <span class="stat text-red-300">❤ {{ hp }}/{{ maxHp }}</span>

      <!-- 药水栏：固定槽位，空槽显示虚线框 -->
      <span class="flex gap-1.5">
        <template v-for="i in maxPotions(relics)" :key="i">
          <HoverTip
            v-if="potions[i - 1] && potionDefs[potions[i - 1]!]"
            :icon="potionDefs[potions[i - 1]!]!.icon"
            :name="potionDefs[potions[i - 1]!]!.name"
            :text="potionDefs[potions[i - 1]!]!.text"
            :hint="hintOf(potions[i - 1])"
            tag="药水"
            color="#38bdf8"
            align="left"
          >
            <span
              class="w-7 h-7 flex items-center justify-center rounded-full text-base border-2 border-sky-300 bg-slate-900 touch-none"
              :class="[
                canUse ? 'cursor-grab' : '',
                drag?.active && drag.index === i - 1 ? 'opacity-40' : '',
              ]"
              @pointerdown="onPress(i - 1, $event)"
              >{{ potionDefs[potions[i - 1]!]!.icon }}</span
            >
          </HoverTip>
          <span
            v-else
            class="w-7 h-7 rounded-full border-2 border-dashed border-slate-600 bg-slate-900/40"
          />
        </template>
      </span>

      <span class="stat text-amber-300">💰 {{ gold }}</span>

      <!-- 右侧插槽（地图上的牌组按钮）；右侧留出设置按钮的位置 -->
      <div class="ml-auto mr-12 flex items-center"><slot /></div>
    </div>

    <!-- 分隔线：两端渐隐的金线，中间一枚菱形 -->
    <div v-if="relics.length" class="divider" aria-hidden="true"><i /></div>

    <!-- 第二行：遗物 -->
    <div
      v-if="relics.length"
      class="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 pointer-events-auto"
    >
      <template v-for="(id, n) in relics" :key="`${id}-${n}`">
        <HoverTip
          v-if="relicDefs[id]"
          :icon="relicDefs[id]!.icon"
          :name="relicDefs[id]!.name"
          :text="relicDefs[id]!.text"
          tag="遗物"
          align="left"
        >
          <span class="text-lg flex-none relic">{{ relicDefs[id]!.icon }}</span>
        </HoverTip>
      </template>
    </div>
    <!-- 舞台原点（用于换算缩放后的坐标） -->
    <div ref="origin" class="fixed inset-0 pointer-events-none" />

    <!-- 拖拽指示：投掷类画瞄准线，饮用类越过手牌区上沿后提示可松手 -->
    <svg v-if="drag?.active" class="fixed inset-0 w-full h-full pointer-events-none z-50">
      <template v-if="dragAimsEnemy()">
        <line
          :x1="drag.startX"
          :y1="drag.startY"
          :x2="drag.x"
          :y2="drag.y"
          :stroke="aimed !== null ? '#fbbf24' : '#38bdf8'"
          stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray="4 12"
        />
        <circle
          :cx="drag.x"
          :cy="drag.y"
          r="14"
          fill="none"
          :stroke="aimed !== null ? '#fbbf24' : '#38bdf8'"
          stroke-width="4"
        />
      </template>
      <text
        v-else
        :x="drag.x"
        :y="drag.y - 20"
        text-anchor="middle"
        :fill="drag.y < HAND_TOP ? '#fbbf24' : '#94a3b8'"
        font-size="20"
        font-weight="bold"
      >
        {{ drag.y < HAND_TOP ? '松手饮用' : '拖到上方饮用' }}
      </text>
    </svg>
  </div>
</template>

<style scoped>
/* 顶栏：深色玻璃底，下沿一道金色细线收边 */
.hud {
  background: linear-gradient(180deg, rgba(15, 20, 40, 0.92), rgba(22, 27, 50, 0.8));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}
/* 生命、金币：圆角胶囊 */
.stat {
  padding: 0.15rem 0.7rem;
  font-weight: 700;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}
/* 分隔线：两端渐隐的金线 + 中间菱形 */
.divider {
  position: relative;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    #b45309 20%,
    #fcd34d 50%,
    #b45309 80%,
    transparent
  );
  opacity: 0.8;
}
.divider i {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  background: #fcd34d;
  box-shadow: 0 0 6px rgba(252, 211, 77, 0.8);
  transform: translate(-50%, -50%) rotate(45deg);
}
/* 遗物：圆角底座 */
.relic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  background: radial-gradient(circle at 50% 35%, #334155, #0f172a 85%);
  border: 1px solid rgba(252, 211, 77, 0.45);
  border-radius: 8px;
}
</style>
