<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { potions as potionDefs, relics as relicDefs } from '@/data/items'
import { POTION_RULES, fieldHeal } from '@/engine/potions'
import { relicCounter } from '@/engine/relics'
import { maxPotions } from '@/engine/run'
import { playSfx } from '@/composables/useSfx'
import AimArrow from './AimArrow.vue'
import HoverTip from './HoverTip.vue'

const props = defineProps<{
  hp: number
  maxHp: number
  gold: number
  potions: string[]
  relics: string[]
  /** 遗物计数（战斗中为战斗内的值）*/
  relicState?: Record<string, number>
  /** 战斗中的玩家回合才能使用药水 */
  canUse?: boolean
  /** 是否在战斗界面：战斗外只能使用纯回血药水 */
  inBattle?: boolean
  /** 存活的敌人数：只剩一只时，单击投掷类药水即可直接打出 */
  livingEnemies?: number
  /** 这一局的种子；传入则显示在右上角 */
  seed?: string
}>()
const emit = defineEmits<{
  use: [index: number, target?: number]
  discard: [index: number]
  aim: [enemy: number | null]
}>()

/** 金币变化动画：数字弹一下，旁边飘出 +N / -N（key 自增以重播） */
const goldFx = ref<{ key: number; delta: number } | null>(null)
let goldKey = 0
let goldTimer = 0
watch(
  () => props.gold,
  (now, before) => {
    if (now === before) return
    void playSfx(now > before ? 'run.gold.gain' : 'run.gold.spend')
    goldFx.value = { key: ++goldKey, delta: now - before }
    clearTimeout(goldTimer)
    goldTimer = window.setTimeout(() => (goldFx.value = null), 1000)
  },
)
onBeforeUnmount(() => clearTimeout(goldTimer))

/** 点击药水弹出的「使用 / 丢弃」菜单所指的药水栏下标 */
const menu = ref<number | null>(null)
const menuUsable = (index: number) => {
  const id = props.potions[index]
  if (!id) return false
  if (!props.inBattle) return fieldHeal(id) !== undefined
  return !!props.canUse && !needsAim(index)
}
/** 投掷类药水在多个敌人时必须拖到目标身上，菜单无法指定目标 */
const needsAim = (index: number) => ruleOf(index)?.target === 'enemy' && (props.livingEnemies ?? 0) > 1
const menuUseHint = (index: number) => {
  if (menuUsable(index)) return ''
  if (!props.inBattle) return '只能在战斗中使用'
  return props.canUse && needsAim(index) ? '有多个敌人，请拖到目标身上投掷' : '现在不能使用'
}
function menuUse(index: number) {
  menu.value = null
  emit('use', index)
}
function menuDiscard(index: number) {
  menu.value = null
  emit('discard', index)
}

const copied = ref(false)
async function copySeed() {
  if (!props.seed) return
  try {
    await navigator.clipboard.writeText(props.seed)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // 剪贴板不可用时忽略，种子仍显示在界面上
  }
}

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
  if (e.button !== 0 || !props.potions[index]) return
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
  if (props.canUse && !d.active && Math.hypot(p.x - d.pressX, p.y - d.pressY) > DRAG_THRESHOLD) d.active = true
  drag.value = { ...d }
  aimed.value = dragAimsEnemy() ? enemyUnder(e.clientX, e.clientY) : null
  emit('aim', aimed.value)
}

function onRelease(e: PointerEvent) {
  const d = drag.value
  stopDrag()
  if (!d) return
  const rule = ruleOf(d.index)
  if (!d.active) {
    menu.value = menu.value === d.index ? null : d.index
    return
  }
  if (!rule) return
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
  if (!id) return undefined
  if (!props.canUse) return '点击或右键：使用或丢弃'
  return POTION_RULES[id]?.target === 'enemy'
    ? '拖到敌人身上投掷；点击或右键：使用或丢弃'
    : '拖到上方饮用；点击或右键：使用或丢弃'
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
        <circle cx="24" cy="24" r="22" fill="#2d221c" stroke="#fcd34d" stroke-width="2" />
        <path
          d="M12 28c0-9 5-15 12-15s12 6 12 15v5a2 2 0 01-2 2H14a2 2 0 01-2-2z"
          fill="#8a7562"
          stroke="#18100c"
          stroke-width="1.5"
        />
        <path d="M24 13v22" stroke="#18100c" stroke-width="1.5" />
        <path d="M14 25h20v5H14z" fill="#18100c" />
        <path d="M24 8c-1 3 0 4 0 5 1-1 2-3 0-5z" fill="#ef4444" stroke="#ef4444" />
      </svg>

      <span class="stat text-red-300"><Emoji e="❤" /> {{ hp }}/{{ maxHp }}</span>

      <!-- 药水栏：固定槽位，空槽显示虚线框 -->
      <span class="flex gap-1.5">
        <span v-for="i in maxPotions(relics)" :key="i" class="relative flex">
          <HoverTip
            v-if="potions[i - 1] && potionDefs[potions[i - 1]!]"
            :icon="potionDefs[potions[i - 1]!]!.icon"
            :name="potionDefs[potions[i - 1]!]!.name"
            :text="potionDefs[potions[i - 1]!]!.text"
            :hint="hintOf(potions[i - 1])"
            tag="药水"
            color="#38bdf8"
            align="left"
            :suppress="menu === i - 1"
          >
            <span
              class="w-7 h-7 flex items-center justify-center rounded-full text-base border-2 border-sky-300 bg-slate-900 touch-none"
              :class="[
                canUse ? 'cursor-grab' : 'cursor-pointer',
                drag?.active && drag.index === i - 1 ? 'opacity-40' : '',
              ]"
              @pointerdown="onPress(i - 1, $event)"
              @contextmenu.prevent="menu = menu === i - 1 ? null : i - 1"
              ><Emoji :e="potionDefs[potions[i - 1]!]!.icon" /></span
            >
          </HoverTip>
          <span
            v-else
            class="w-7 h-7 rounded-full border-2 border-dashed border-slate-600 bg-slate-900/40"
          />

          <template v-if="menu === i - 1 && potions[i - 1]">
            <div class="fixed inset-0" @pointerdown="menu = null" @contextmenu.prevent="menu = null" />
            <div class="menu">
              <button
                class="menu-btn"
                :disabled="!menuUsable(i - 1)"
                :title="menuUseHint(i - 1)"
                @click="menuUse(i - 1)"
              >
                使用
              </button>
              <button class="menu-btn" @click="menuDiscard(i - 1)">丢弃</button>
            </div>
          </template>
        </span>
      </span>

      <span class="stat text-amber-300 gold-stat">
        <span :key="goldFx?.key ?? 0" :class="goldFx ? 'gold-pop' : ''"><Emoji e="💰" /> {{ gold }}</span>
        <span
          v-if="goldFx"
          :key="`d${goldFx.key}`"
          class="gold-float"
          :class="goldFx.delta > 0 ? 'text-amber-300' : 'text-rose-300'"
        >
          {{ goldFx.delta > 0 ? '+' : '' }}{{ goldFx.delta }}
        </span>
      </span>

      <slot name="progress" />

      <!-- 右侧：种子，其后是插槽（地图上的牌组按钮）；右侧留出设置按钮的位置 -->
      <div class="ml-auto mr-12 flex items-center gap-4">
        <button
          v-if="seed"
          class="seed"
          :title="copied ? '已复制' : '点击复制种子，分享给朋友即可得到相同的一局'"
          @click="copySeed"
        >
          <span class="text-slate-400">种子</span>
          <b class="select-text">{{ copied ? '已复制' : seed }}</b>
        </button>
        <slot />
      </div>
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
          :lore="relicDefs[id]!.lore"
          tag="遗物"
          align="left"
        >
          <span class="text-lg flex-none relic relative">
            <Emoji :e="relicDefs[id]!.icon" />
            <span v-if="relicCounter(id, relicState ?? {}) !== undefined" class="relic-count">{{
              relicCounter(id, relicState ?? {})
            }}</span>
          </span>
        </HoverTip>
      </template>
    </div>
    <!-- 舞台原点（用于换算缩放后的坐标） -->
    <div ref="origin" class="fixed inset-0 pointer-events-none" />

    <!-- 拖拽指示：投掷类画瞄准线，饮用类越过手牌区上沿后提示可松手 -->
    <svg v-if="drag?.active" class="fixed inset-0 w-full h-full pointer-events-none z-50">
      <template v-if="dragAimsEnemy()">
        <AimArrow
          :x1="drag.startX"
          :y1="drag.startY"
          :x2="drag.x"
          :y2="drag.y"
          :color="aimed !== null ? '#fbbf24' : '#38bdf8'"
        />
      </template>
      <text
        v-else
        :x="drag.x"
        :y="drag.y - 20"
        text-anchor="middle"
        :fill="drag.y < HAND_TOP ? '#fbbf24' : '#b09c86'"
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
.gold-stat {
  position: relative;
}
.gold-pop {
  display: inline-block;
  animation: gold-pop 0.6s ease-out;
}
.gold-float {
  position: absolute;
  left: 100%;
  top: 50%;
  margin-left: 6px;
  font-weight: 900;
  white-space: nowrap;
  pointer-events: none;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.8);
  animation: gold-float 1s ease-out forwards;
}
/* 金币跳动：连跳两下，一下比一下矮 */
@keyframes gold-pop {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  20% {
    transform: translateY(-9px) scale(1.25);
    filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.9));
  }
  40% {
    transform: translateY(0) scale(1);
  }
  60% {
    transform: translateY(-5px) scale(1.12);
  }
  80% {
    transform: translateY(0) scale(1);
  }
}
@keyframes gold-float {
  0% {
    opacity: 0;
    transform: translate(-8px, -50%);
  }
  20% {
    opacity: 1;
    transform: translate(0, -50%);
  }
  100% {
    opacity: 0;
    transform: translate(10px, -50%);
  }
}
.stat {
  padding: 0.15rem 0.7rem;
  font-weight: 700;
  background: rgba(24, 16, 12, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}
/* 种子：胶囊，等宽字 */
.seed {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.7rem;
  font-size: 0.8rem;
  color: #fcd34d;
  cursor: pointer;
  background: rgba(24, 16, 12, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
}
.seed b {
  font-family: ui-monospace, Consolas, monospace;
  letter-spacing: 0.15em;
}
.seed:hover {
  border-color: #f59e0b;
}
/* 药水菜单：药水栏正下方 */
.menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 5rem;
  margin-top: 0.4rem;
  overflow: hidden;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
}
.menu-btn {
  padding: 0.35rem 1rem;
  text-align: left;
  color: #e2e8f0;
  cursor: pointer;
  background: transparent;
}
.menu-btn:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.25);
}
.menu-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
.relic-count {
  position: absolute;
  right: -0.3rem;
  bottom: -0.3rem;
  min-width: 1rem;
  padding: 0 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1rem;
  text-align: center;
  color: #fff;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 999px;
}
.relic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  background: radial-gradient(circle at 50% 35%, #4a3b30, #18100c 85%);
  border: 1px solid rgba(252, 211, 77, 0.45);
  border-radius: 8px;
}
</style>
