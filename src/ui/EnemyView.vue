<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { attackBonusAt } from '@/engine/intents'
import { enemyAttack } from '@/engine/blades'
import { statusById } from '@/engine/statuses'
import type { CardDef, EnemyState, Intent } from '@/engine/types'
import { computed, ref, watch } from 'vue'
import HoverTip from './HoverTip.vue'
import StatusIcons from './StatusIcons.vue'

const props = defineProps<{
  enemy: EnemyState
  intent: Intent | null
  /** 玩家当前状态：用于把攻击意图换算成最终伤害 */
  playerStatuses: Record<string, number>
  /** 玩家当前格挡：冰霜穿甲 / 增伤的预览要看它 */
  playerBlock?: number
  /** 被拖拽中的卡牌指着这只敌人：高亮怪物模型 */
  hovered?: boolean
  /** 即将分裂：原意图被打断，显示「？？？」 */
  splitting?: boolean
  /** 用于把意图里的牌 id 换成牌名 */
  cards?: Readonly<Record<string, CardDef>>
}>()

const TIP_ICON: Record<Intent['type'], string> = {
  attack: '⚔',
  defend: '🛡',
  debuff: '🔻',
  buff: '🔺',
  addCards: '🟢',
  idle: '💤',
  summon: '📣',
  steal: '🪙',
  flee: '💨',
}
const stunned = computed(() => (props.enemy.statuses.stunned ?? 0) > 0)

/** 只有「这一场里刚死」才播倒地动画；进场时就已是尸体的直接显示倒地姿态 */
const dying = ref(false)
watch(
  () => props.enemy.hp > 0,
  (alive, wasAlive) => {
    dying.value = wasAlive && !alive
  },
)
const cardName = (id: string) => props.cards?.[id]?.name ?? id
const dmg = computed(() =>
  props.intent?.type === 'attack'
    ? enemyAttack(props.intent.damage + attackBonusAt(props.enemy.def, props.enemy.turns ?? 0), props.enemy, { block: props.playerBlock ?? 0, statuses: props.playerStatuses }).damage
    : 0,
)

/** 意图悬浮说明：一句话讲清下一步要干什么 */
const intentTip = computed(() => {
  const i = props.intent
  if (!i) return null
  switch (i.type) {
    case 'attack':
      return {
        name: '攻击',
        text:
          (i.hits && i.hits > 1 ? `造成 ${dmg.value} 点伤害，连击 ${i.hits} 次` : `造成 ${dmg.value} 点伤害`) +
          (i.addCards ? `，并往你的弃牌堆塞入 ${i.addCards.count} 张【${cardName(i.addCards.cardId)}】` : ''),
        color: '#f87171',
      }
    case 'defend':
      return { name: '防御', text: `获得 ${i.block} 点格挡`, color: '#7dd3fc' }
    case 'addCards':
      return {
        name: '塞牌',
        text: `往你的弃牌堆塞入 ${i.count} 张【${cardName(i.cardId)}】，会占用抽牌`,
        color: '#c4b5fd',
      }
    case 'idle':
      return { name: '蓄力', text: '本回合什么也不做', color: '#c4b5fd' }
    case 'summon':
      return { name: '召唤', text: `召唤一只${i.enemy.name}`, color: '#c4b5fd' }
    case 'steal':
      return { name: '偷窃', text: `偷走你最多 ${i.amount} 金币，击败它可夺回`, color: '#c4b5fd' }
    case 'flee':
      return { name: '逃跑', text: '带着偷来的金币逃离战斗', color: '#c4b5fd' }
    case 'debuff':
    case 'buff': {
      const st = statusById[i.status]
      return {
        name: i.type === 'debuff' ? '减益' : '增益',
        text: `${i.type === 'debuff' ? '给你' : '自身'}添加 ${i.stacks} 层【${st?.name ?? i.status}】：${(st?.text ?? '').replaceAll('N', String(i.stacks))}`,
        color: '#c4b5fd',
      }
    }
  }
})
</script>

<template>
  <div
    class="flex flex-col items-center gap-2 p-2 transition-all duration-500"
    :class="enemy.hp <= 0 ? 'opacity-30 grayscale pointer-events-none delay-[700ms]' : ''"
  >
    <div v-if="splitting && enemy.hp > 0" class="text-lg font-bold text-purple-300">
      <HoverTip icon="❓" name="？？？" text="意图被打断：本回合将分裂成两只" color="#c4b5fd"><Emoji e="❓" /> ？？？</HoverTip>
    </div>
    <div v-else-if="stunned && enemy.hp > 0" class="text-lg font-bold text-yellow-300">
      <HoverTip icon="💫" name="晕眩" text="意图被打断：本回合无法行动，晕眩结束后恢复原来的意图" color="#fde047"><Emoji e="💫" /> 晕眩</HoverTip>
    </div>
    <div
      v-else-if="intent && enemy.hp > 0"
      class="text-lg font-bold"
      :class="{
        'text-red-400': intent.type === 'attack',
        'text-sky-300': intent.type === 'defend',
        'text-purple-300': ['debuff', 'buff', 'summon', 'steal', 'flee', 'addCards', 'idle'].includes(intent.type),
      }"
    >
      <HoverTip
        v-if="intentTip"
        :icon="TIP_ICON[intent.type]"
        :name="intentTip.name"
        :text="intentTip.text"
        :color="intentTip.color"
      >
        <template v-if="intent.type === 'attack'">
          <Emoji e="⚔" /> {{ dmg }}<template v-if="(intent.hits ?? 1) > 1">×{{ intent.hits }}</template>
          <span v-if="intent.addCards" class="ml-1"><Emoji e="🟢" />{{ intent.addCards.count }}</span>
        </template>
        <template v-else-if="intent.type === 'defend'"><Emoji e="🛡" /> {{ intent.block }}</template>
        <template v-else-if="intent.type === 'addCards'">{{ cardName(intent.cardId) }} ×{{ intent.count }}</template>
        <template v-else-if="intent.type === 'idle'"><Emoji e="💤" /> 蓄力</template>
        <template v-else-if="intent.type === 'summon'"><Emoji e="📣" /> 召唤</template>
        <template v-else-if="intent.type === 'steal'"><Emoji e="🪙" /> 偷 {{ intent.amount }}</template>
        <template v-else-if="intent.type === 'flee'"><Emoji e="💨" /> 逃跑</template>
        <template v-else>
          <Emoji :e="intent.type === 'debuff' ? '🔻' : '🔺'" /> <Emoji :e="statusById[intent.status]?.icon" />
          {{ intent.stacks }}
        </template>
        <span v-for="(a, k) in intent.also ?? []" :key="k" class="ml-1 text-base">+<Emoji :e="TIP_ICON[a.type]" /></span>
      </HoverTip>
    </div>
    <div
      data-fx="sprite"
      class="w-40 h-40 rounded-full bg-transparent flex items-center justify-center text-5xl transition-all duration-150"
      :class="
        enemy.hp <= 0
          ? dying
            ? 'sprite-dying'
            : 'sprite-corpse'
          : hovered
            ? 'scale-110 ring-4 ring-amber-300 shadow-[0_0_32px_8px_rgba(251,191,36,0.6)] brightness-125'
            : enemy.block > 0
              ? 'ring-4 ring-sky-300 shadow-[0_0_28px_6px_rgba(56,189,248,0.6)]'
              : ''
      "
    >
      <Emoji :e="enemy.def.icon ?? '🟢'" />
    </div>
    <div class="font-bold">{{ enemy.def.name }}</div>
    <div class="relative w-48 h-4">
      <div class="w-full h-full bg-slate-700 rounded overflow-hidden">
        <div
          class="h-full transition-[width] duration-300"
          :class="enemy.block > 0 ? 'bg-sky-400' : 'bg-red-500'"
          :style="{ width: `${(enemy.hp / (enemy.maxHpOverride ?? enemy.def.maxHp)) * 100}%` }"
        />
      </div>
      <!-- 防御盾牌在血条右侧、与血条垂直居中；绝对定位不影响血条自身居中，有防御时血条变蓝 -->
      <div
        v-if="enemy.block > 0"
        class="absolute left-full -ml-3 -mt-1 top-1/2 -translate-y-1/2 w-10 h-10 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
      >
        <span class="absolute inset-0 flex items-center justify-center text-4xl leading-none"
          ><Emoji e="🛡" /></span
        >
        <span
          class="absolute inset-0 flex items-center justify-center text-xs leading-none font-black text-white [text-shadow:0_0_4px_#0c4a6e,0_0_4px_#0c4a6e]"
          style="top: 9px"
          >{{ enemy.block }}</span
        >
      </div>
    </div>
    <div class="text-sm">
      <Emoji e="❤" /> {{ enemy.hp }}/{{ enemy.maxHpOverride ?? enemy.def.maxHp }}
      <span v-if="enemy.stolenGold" class="ml-2 text-amber-300"><Emoji e="🪙" /> {{ enemy.stolenGold }}</span>
    </div>
    <StatusIcons :statuses="enemy.statuses" />
  </div>
</template>

<style scoped>
/* 死亡：被击中的闪白 + 左右抖动，随后向一侧倒下、压扁、褪色，最后停在尸体姿态 */
.sprite-dying {
  animation: enemy-die 0.95s cubic-bezier(0.4, 0, 0.7, 1) forwards;
}
.sprite-corpse {
  transform: translateY(20px) rotate(78deg) scale(0.82, 0.7);
  opacity: 0.45;
  filter: grayscale(1) brightness(0.65);
}
@keyframes enemy-die {
  0% {
    transform: none;
    filter: brightness(2.4) saturate(0);
  }
  10% {
    transform: translateX(-8px) scale(1.06);
    filter: brightness(1.8) saturate(0.4);
  }
  20% {
    transform: translateX(8px) scale(1.04);
  }
  30% {
    transform: translateX(-5px) rotate(-5deg);
    filter: brightness(1.2) grayscale(0.3);
  }
  55% {
    transform: translateY(-6px) rotate(10deg) scale(1.02);
    opacity: 1;
  }
  100% {
    transform: translateY(20px) rotate(78deg) scale(0.82, 0.7);
    opacity: 0.45;
    filter: grayscale(1) brightness(0.65);
  }
}
</style>
