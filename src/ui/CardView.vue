<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { cards as allCards } from '@/data/cards'
import { cardText, evolvedId, progressOf, resolveCards } from '@/engine/enchant'
import { ENCHANTS } from '@/engine/enchants'
import {
  calcAttack,
  calcBlock,
  STATUSES,
  statusTip,
  type StatusDef,
  type Statuses,
} from '@/engine/statuses'
import type { CardDef, Rarity } from '@/engine/types'

const props = defineProps<{
  card: CardDef
  playable: boolean
  /** 出牌者（玩家）的状态：卡面上的伤害 / 格挡显示为修正后的数值 */
  statuses?: Statuses
  /** 被瞄准的敌人状态：拖拽指向敌人时，伤害再叠加易伤等修正 */
  targetStatuses?: Statuses
  /** 战斗预览算好的每段「造成 N 点伤害」最终值（见 engine/preview.ts），顺序与卡面文字一致 */
  damages?: number[]
  /** 选牌界面中被选中：上浮并显示金色高亮 */
  selected?: boolean
  /** 覆盖显示的费用（剑意 / 剑流让牌免费时传 0） */
  cost?: number | 'X'
  /** 覆盖进化进度（战斗中按实例计数）；缺省取卡牌 id 里的 ~N */
  progress?: number
}>()

/** 进化进度 n/总次数：只有声明了 evolve 的牌才显示 */
const evolveProgress = computed(() =>
  props.card.evolve
    ? `${Math.min(props.progress ?? progressOf(props.card.id), props.card.evolve.plays)}/${props.card.evolve.plays}`
    : '',
)

/** 进化后的牌（保留升级 / 附魔标记）；悬浮在进化进度上时展示，让玩家知道会变成什么 */
const evolveTarget = computed(() => {
  const into = props.card.evolve?.into
  if (!into) return null
  const id = evolvedId(props.card.id, into)
  return resolveCards(allCards, [id])[id] ?? null
})
const evolveTip = ref<{ x: number; y: number } | null>(null)
function showEvolveTip(ev: MouseEvent) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  evolveTip.value = { x: r.left + r.width / 2, y: r.top }
}

/** 卡面文字拆成片段；伤害 / 格挡数字按当前状态换算，并标出相对原值的升降 */
const textParts = computed(() => {
  const text = cardText(props.card)
  if (!props.statuses) return [{ text, diff: 0 }]
  const parts = text.split(/(造成 \d+ 点伤害|获得 \d+ 点格挡)/).filter(Boolean)
  // 有战斗预览（含条件加成、感电 / 活力 / 背水 / 冰霜、遗物改写）且条数对得上时，伤害直接用预览的最终值
  const dmgCount = parts.filter((p) => /^造成 \d+ 点伤害$/.test(p)).length
  const final = props.damages && props.damages.length === dmgCount ? props.damages : undefined
  let di = 0
  return parts.map((part) => {
    const m = /^(造成|获得) (\d+) 点(伤害|格挡)$/.exec(part)
    if (!m) return { text: part, diff: 0 }
    const base = Number(m[2])
    const value =
      m[3] === '伤害'
        ? (final?.[di++] ?? calcAttack(base, props.statuses, props.targetStatuses ?? {}))
        : calcBlock(base, props.statuses!)
    return { text: `${m[1]} ${value} 点${m[3]}`, diff: value - base }
  })
})

/** 描述文字超出描述框时逐级缩小字号，直到放得下（或到下限） */
const descEl = ref<HTMLElement | null>(null)
const descInner = ref<HTMLElement | null>(null)
const DESC_MAX_REM = 0.78
const DESC_MIN_REM = 0.45
function fitDesc() {
  const box = descEl.value
  const inner = descInner.value
  if (!box || !inner || box.clientHeight === 0) return // 未显示（display: none）时无法测量
  const cs = getComputedStyle(box)
  const room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  let size = DESC_MAX_REM
  box.style.fontSize = ''
  while (inner.offsetHeight > room && size > DESC_MIN_REM) {
    size = Math.round((size - 0.02) * 100) / 100
    box.style.fontSize = `${size}rem`
  }
}
onMounted(fitDesc)
watch(textParts, () => nextTick(fitDesc), { flush: 'post' })

/** 稀有度配色：frame 为边框渐变，banner 为名牌，glow 为悬停光晕 */
const RARITY: Record<Rarity, { frame: string; banner: string; glow: string; label: string }> = {
  white: {
    frame: 'linear-gradient(145deg, #f1f5f9, #b09c86 55%, #f1e6d4)',
    banner: 'linear-gradient(180deg, #8a7562, #4a3b30)',
    glow: 'rgba(226, 232, 240, 0.55)',
    label: '普通',
  },
  blue: {
    frame: 'linear-gradient(145deg, #bae6fd, #0284c7 55%, #7dd3fc)',
    banner: 'linear-gradient(180deg, #0369a1, #0c4a6e)',
    glow: 'rgba(56, 189, 248, 0.6)',
    label: '罕见',
  },
  gold: {
    frame: 'linear-gradient(145deg, #fef3c7, #d97706 55%, #fcd34d)',
    banner: 'linear-gradient(180deg, #b45309, #78350f)',
    glow: 'rgba(251, 191, 36, 0.7)',
    label: '稀有',
  },
  curse: {
    frame: 'linear-gradient(145deg, #4b5563, #1f2937 55%, #6b7280)',
    banner: 'linear-gradient(180deg, #3f1d2e, #1c0e16)',
    glow: 'rgba(168, 85, 247, 0.65)',
    label: '诅咒',
  },
  status: {
    frame: 'linear-gradient(145deg, #94a3b8, #475569 55%, #64748b)',
    banner: 'linear-gradient(180deg, #475569, #1e293b)',
    glow: 'rgba(148, 163, 184, 0.5)',
    label: '状态',
  },
}

const TYPES = {
  attack: {
    label: '攻击',
    art: 'radial-gradient(circle at 50% 40%, #b91c1c, #450a0a 80%)',
    icon: '⚔️',
  },
  skill: {
    label: '技能',
    art: 'radial-gradient(circle at 50% 40%, #0f766e, #042f2e 80%)',
    icon: '🛡️',
  },
  power: {
    label: '能力',
    art: 'radial-gradient(circle at 50% 40%, #7e22ce, #2e1065 80%)',
    icon: '✨',
  },
}

const rarity = computed(() => RARITY[props.card.rarity])
const type = computed(() => TYPES[props.card.kind])
const vars = computed(() => ({
  '--frame': rarity.value.frame,
  '--banner': rarity.value.banner,
  '--glow': rarity.value.glow,
  '--art': type.value.art,
}))
/** 诅咒牌 / 状态牌：卡面压暗，与可打出的牌一眼区分 */
const cursed = computed(() => props.card.rarity === 'curse' || props.card.rarity === 'status')
/** 卡牌给出的各状态层数，用来把悬浮说明里的 N 换成具体数字 */
const stackOf = computed(() => {
  const m = new Map<string, number>()
  for (const e of props.card.effects) {
    if (e.type === 'applyStatus' && !m.has(e.status)) m.set(e.status, e.stacks)
  }
  return m
})
/** 状态名 → 定义；长名优先匹配 */
const TERM_RE = new RegExp(`(${[...STATUSES].sort((x, y) => y.name.length - x.name.length).map((d) => d.name).join('|')})`)
const defByName = Object.fromEntries(STATUSES.map((d) => [d.name, d]))

/** 把文字片段里出现的状态名切出来，加下划线 */
function withTerms(text: string) {
  return text
    .split(TERM_RE)
    .filter(Boolean)
    .map((t) => ({ text: t, def: defByName[t] as StatusDef | undefined }))
}

/** 悬浮中的状态说明（视口坐标，名称正上方居中）；null 表示不显示 */
const tip = ref<{ x: number; y: number; def: StatusDef; stacks?: number } | null>(null)
function showTip(ev: MouseEvent, def: StatusDef) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  tip.value = { x: r.left + r.width / 2, y: r.top, def, stacks: stackOf.value.get(def.id) }
}
const tipText = computed(() => (tip.value ? statusTip(tip.value.def, tip.value.stacks) : null))
/** 卡面"类型"行的标签 */
const tag = computed(() => {
  if (cursed.value) return rarity.value.label
  return type.value.label // 保留/消耗已在描述里写明，类型行不重复
})
</script>

<template>
  <div class="card" :class="{ playable, locked: !playable, selected, cursed }" :style="vars">
    <div class="frame">
      <div class="inner">
        <div class="art">
          <span class="icon">{{ card.icon ?? type.icon }}</span>
        </div>
        <div class="banner">{{ card.name }}</div>
        <div class="type">— {{ tag }} —</div>
        <div ref="descEl" class="desc">
          <span ref="descInner" class="desc-text">
            <span
              v-for="(p, i) in textParts"
              :key="i"
              :class="p.diff > 0 ? 'up' : p.diff < 0 ? 'down' : ''"
            >
              <template v-for="(t, j) in withTerms(p.text)" :key="j">
                <span
                  v-if="t.def"
                  class="term"
                  :class="t.def.kind"
                  @mouseenter="showTip($event, t.def)"
                  @mouseleave="tip = null"
                  >{{ t.text }}</span
                >
                <template v-else>{{ t.text }}</template>
              </template>
            </span>
          </span>
        </div>
        <div class="rarity-gem" :title="rarity.label" />
      </div>
    </div>

    <!-- 无法打出的牌（状态 / 诅咒）没有费用，不显示费用球 -->
    <div v-if="!card.unplayable" class="cost">{{ cost ?? card.cost }}</div>
    <div
      v-if="evolveProgress"
      class="evolve-progress"
      @mouseenter="showEvolveTip"
      @mouseleave="evolveTip = null"
    >
      {{ evolveProgress }}
    </div>
    <span v-if="card.enchant" class="enchant" :class="{ innate: card.enchant === 'innate' }" :title="ENCHANTS[card.enchant]?.name ?? '已附魔'" />

    <!-- 状态说明：传送到 body，避免被卡面 overflow 裁掉 -->
    <Teleport to="body">
      <div
        v-if="evolveTip && evolveTarget"
        class="info-tip"
        :style="{ left: evolveTip.x + 'px', top: evolveTip.y + 'px' }"
      >
        <div class="info-name">
          {{ evolveTarget.icon ?? '' }} 成长为：{{ evolveTarget.name }}
        </div>
        <div class="info-text">{{ cardText(evolveTarget) }}</div>
        <div class="info-duration">
          累计打出 {{ card.evolve!.plays }} 次后，战斗胜利时成长
        </div>
      </div>
      <div
        v-if="tip && tipText"
        class="info-tip"
        :class="tip.def.kind"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <div class="info-name">
          {{ tip.def.icon }} {{ tip.def.name }}
          <span class="info-kind">{{ tip.def.kind === 'buff' ? '增益' : '减益' }}</span>
        </div>
        <div class="info-text">
          <template v-if="!tipText.plain && (tipText.total !== undefined || tipText.perLayer !== tip.def.text)">
            <b>每层：</b>{{ tipText.perLayer }}
          </template>
          <template v-else>{{ tipText.perLayer }}</template>
        </div>
        <div v-if="tipText.total !== undefined" class="info-text">
          <b>当前 {{ tipText.stacks }} 层：</b>{{ tipText.total }}
        </div>
        <div class="info-duration">{{ tipText.duration }}</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  width: 9rem;
  height: 13rem;
  cursor: pointer;
  user-select: none;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.card.playable:hover {
  transform: translateY(-1rem);
  filter: drop-shadow(0 0 14px var(--glow));
}
/* 选中：保持上浮（悬停与否都一样），金色光晕 + 外框描边跟随卡牌圆角 */
.card.selected,
.card.selected:hover {
  transform: translateY(-1rem);
  filter: drop-shadow(0 0 16px rgba(251, 191, 36, 0.95));
}
.card.selected .frame {
  outline: 3px solid #fbbf24;
  outline-offset: 2px;
}
/* 能量不足：保持不透明，只降低饱和度和亮度，费用球变红 */
.card.locked {
  filter: grayscale(0.7) brightness(0.8);
}
.card.locked .cost {
  background: radial-gradient(circle at 35% 30%, #fca5a5, #b91c1c 70%);
  border-color: #fee2e2;
}

/* 诅咒牌：暗紫底纹，卡面整体压暗，与可打出的牌区分 */
.card.cursed .inner {
  background: linear-gradient(180deg, #241426, #160c1b);
}
.card.cursed .art {
  filter: grayscale(0.55) brightness(0.85);
}
.card.cursed .banner {
  filter: saturate(0.8);
}

/* 渐变外框 */
.frame {
  width: 100%;
  height: 100%;
  padding: 5px;
  border-radius: 12px;
  background: var(--frame);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.55);
}
.inner {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #2d221c;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6);
}

/* 插图区：底色按攻击/技能区分，叠一层斜纹 */
.art {
  position: relative;
  flex: 0 0 46%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--art);
}
.art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05) 0 6px,
    transparent 6px 12px
  );
}
.icon {
  position: relative;
  z-index: 1;
  font-size: 3rem;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.7));
}

/* 名牌 */
.banner {
  position: relative;
  z-index: 2;
  margin: -0.55rem -0.3rem 0;
  padding: 0.2rem 0;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #fff;
  background: var(--banner);
  border-top: 1px solid rgba(255, 255, 255, 0.4);
  border-bottom: 1px solid rgba(0, 0, 0, 0.6);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%);
}
.type {
  margin-top: 0.2rem;
  text-align: center;
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  color: #b09c86;
}

/* 描述框 */
.desc {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.2rem 0.4rem 0.5rem;
  padding: 0.25rem;
  text-align: center;
  font-size: 0.78rem;
  line-height: 1.25;
  color: #f1e6d4;
  background: rgba(24, 16, 12, 0.65);
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.desc-text {
  display: block;
  white-space: pre-line; /* 保留 / 固有 / 消耗 等词缀单独成行 */
  max-width: 100%;
}

/* 修正后的数值：高于原值绿色，低于原值红色 */
.up {
  color: #4ade80;
  font-weight: 700;
}
.down {
  color: #f87171;
  font-weight: 700;
}

/* 底部的稀有度宝石 */
.rarity-gem {
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 12px;
  height: 12px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--frame);
  border: 1px solid rgba(0, 0, 0, 0.6);
}

/* 进化进度：卡面右下角 */
.evolve-progress {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 3;
  padding: 0 0.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #fef3c7;
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid #d97706;
  border-radius: 999px;
}

/* 费用球 */
.cost {
  position: absolute;
  top: -10px;
  left: -10px;
  z-index: 3;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
  background: radial-gradient(circle at 35% 30%, #7dd3fc, #0369a1 70%);
  border: 2px solid #e0f2fe;
  border-radius: 50%;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.6),
    inset 0 -3px 5px rgba(0, 0, 0, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

/* 卡面上的状态名：普通实线下划线 */
.term {
  cursor: help;
  text-decoration: underline;
}
/* 提示框传送到 body，用视口坐标定位在图标正上方 */
.info-tip {
  position: fixed;
  z-index: 2147483647;
  transform: translate(-50%, calc(-100% - 8px));
  width: max-content;
  max-width: 12rem;
  padding: 0.45rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
  pointer-events: none;
  background: linear-gradient(180deg, #1e2540, #12162a);
  --tip-color: #34d399;
  border: 1px solid var(--tip-color);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.6),
    0 8px 20px rgba(0, 0, 0, 0.6);
}
.info-tip.debuff {
  --tip-color: #f87171;
}
.info-name {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--tip-color);
}
.info-kind {
  margin-left: auto;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  color: #18100c;
  background: var(--tip-color);
  border-radius: 999px;
}
.info-duration {
  padding-top: 0.3rem;
  font-size: 0.72rem;
  color: var(--tip-color);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.info-text {
  font-size: 0.75rem;
  line-height: 1.4;
  color: #f1e6d4;
}

/* 附魔宝石：镶嵌在右上角 */
.enchant.innate {
  background: linear-gradient(135deg, #fef9c3, #facc15 40%, #f97316);
  box-shadow:
    0 0 10px rgba(250, 204, 21, 0.9),
    inset 0 0 4px rgba(255, 255, 255, 0.8);
}
.enchant {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 3;
  width: 1.6rem;
  height: 1.6rem;
  transform: rotate(45deg);
  border-radius: 3px;
  background: linear-gradient(135deg, #e0f2fe, #38bdf8 40%, #c026d3);
  border: 2px solid #fff;
  box-shadow:
    0 0 10px rgba(56, 189, 248, 0.9),
    inset 0 0 4px rgba(255, 255, 255, 0.8);
}
</style>
