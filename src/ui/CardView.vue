<script setup lang="ts">
import { computed } from 'vue'
import { cardText } from '@/engine/enchant'
import { calcAttack, calcBlock, type Statuses } from '@/engine/statuses'
import type { CardDef, Rarity } from '@/engine/types'

const props = defineProps<{
  card: CardDef
  playable: boolean
  /** 出牌者（玩家）的状态：卡面上的伤害 / 格挡显示为修正后的数值 */
  statuses?: Statuses
  /** 被瞄准的敌人状态：拖拽指向敌人时，伤害再叠加易伤等修正 */
  targetStatuses?: Statuses
}>()

/** 卡面文字拆成片段；伤害 / 格挡数字按当前状态换算，并标出相对原值的升降 */
const textParts = computed(() => {
  const text = cardText(props.card)
  if (!props.statuses) return [{ text, diff: 0 }]
  return text
    .split(/(造成 \d+ 点伤害|获得 \d+ 点格挡)/)
    .filter(Boolean)
    .map((part) => {
      const m = /^(造成|获得) (\d+) 点(伤害|格挡)$/.exec(part)
      if (!m) return { text: part, diff: 0 }
      const base = Number(m[2])
      const value =
        m[3] === '伤害'
          ? calcAttack(base, props.statuses, props.targetStatuses ?? {})
          : calcBlock(base, props.statuses!)
      return { text: `${m[1]} ${value} 点${m[3]}`, diff: value - base }
    })
})

/** 稀有度配色：frame 为边框渐变，banner 为名牌，glow 为悬停光晕 */
const RARITY: Record<Rarity, { frame: string; banner: string; glow: string; label: string }> = {
  white: {
    frame: 'linear-gradient(145deg, #f1f5f9, #94a3b8 55%, #e2e8f0)',
    banner: 'linear-gradient(180deg, #64748b, #334155)',
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
</script>

<template>
  <div class="card" :class="{ playable, locked: !playable }" :style="vars">
    <div class="frame">
      <div class="inner">
        <div class="art">
          <span class="icon">{{ card.icon ?? type.icon }}</span>
        </div>
        <div class="banner">{{ card.name }}</div>
        <div class="type">— {{ type.label }}<template v-if="card.exhaust"> · 消耗</template> —</div>
        <div class="desc">
          <span>
            <span
              v-for="(p, i) in textParts"
              :key="i"
              :class="p.diff > 0 ? 'up' : p.diff < 0 ? 'down' : ''"
              >{{ p.text }}</span
            >
          </span>
        </div>
        <div class="rarity-gem" :title="rarity.label" />
      </div>
    </div>

    <div class="cost">{{ card.cost }}</div>
    <span v-if="card.enchanted" class="enchant" title="已附魔" />
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
/* 能量不足：保持不透明，只降低饱和度和亮度，费用球变红 */
.card.locked {
  filter: grayscale(0.7) brightness(0.8);
}
.card.locked .cost {
  background: radial-gradient(circle at 35% 30%, #fca5a5, #b91c1c 70%);
  border-color: #fee2e2;
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
  background: #1e293b;
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
  color: #94a3b8;
}

/* 描述框 */
.desc {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.2rem 0.4rem 0.5rem;
  padding: 0.25rem;
  text-align: center;
  font-size: 0.78rem;
  line-height: 1.25;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.65);
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.25);
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

/* 附魔宝石：镶嵌在右上角 */
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
