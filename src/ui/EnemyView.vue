<script setup lang="ts">
import { calcAttack, statusById } from '@/engine/statuses'
import type { EnemyState, Intent } from '@/engine/types'
import StatusIcons from './StatusIcons.vue'

defineProps<{
  enemy: EnemyState
  intent: Intent | null
  /** 玩家当前状态：用于把攻击意图换算成最终伤害 */
  playerStatuses: Record<string, number>
  /** 被拖拽中的卡牌指着这只敌人：高亮怪物模型 */
  hovered?: boolean
}>()
</script>

<template>
  <div
    class="flex flex-col items-center gap-2 p-2 transition-all duration-500"
    :class="enemy.hp <= 0 ? 'opacity-30 grayscale pointer-events-none' : ''"
  >
    <div
      v-if="intent && enemy.hp > 0"
      class="text-lg font-bold"
      :class="{
        'text-red-400': intent.type === 'attack',
        'text-sky-300': intent.type === 'defend',
        'text-purple-300': ['debuff', 'buff', 'summon', 'steal', 'flee', 'addCards', 'idle'].includes(intent.type),
      }"
    >
      <template v-if="intent.type === 'attack'">
        ⚔ {{ calcAttack(intent.damage, enemy.statuses, playerStatuses) }}
        <span v-if="intent.addCards" class="ml-1">🟢{{ intent.addCards.count }}</span>
      </template>
      <template v-else-if="intent.type === 'defend'">🛡 {{ intent.block }}</template>
      <template v-else-if="intent.type === 'addCards'">🟢 +{{ intent.count }}</template>
      <template v-else-if="intent.type === 'idle'">💤 蓄力</template>
      <template v-else-if="intent.type === 'summon'">📣 召唤</template>
      <template v-else-if="intent.type === 'steal'">🪙 偷 {{ intent.amount }}</template>
      <template v-else-if="intent.type === 'flee'">💨 逃跑</template>
      <template v-else>
        {{ intent.type === 'debuff' ? '🔻' : '🔺' }} {{ statusById[intent.status]?.icon }}
        {{ intent.stacks }}
      </template>
    </div>
    <div
      data-fx="sprite"
      class="w-40 h-40 rounded-full bg-emerald-500 flex items-center justify-center text-5xl transition-all duration-150"
      :class="
        hovered && enemy.hp > 0
          ? 'scale-110 ring-4 ring-amber-300 shadow-[0_0_32px_8px_rgba(251,191,36,0.6)] brightness-125'
          : enemy.block > 0 && enemy.hp > 0
            ? 'ring-4 ring-sky-300 shadow-[0_0_28px_6px_rgba(56,189,248,0.6)]'
            : ''
      "
    >
      {{ enemy.def.icon ?? '🟢' }}
    </div>
    <div class="font-bold">{{ enemy.def.name }}</div>
    <div class="relative w-48 h-4">
      <div class="w-full h-full bg-slate-700 rounded overflow-hidden">
        <div
          class="h-full transition-[width] duration-300"
          :class="enemy.block > 0 ? 'bg-sky-400' : 'bg-red-500'"
          :style="{ width: `${(enemy.hp / enemy.def.maxHp) * 100}%` }"
        />
      </div>
      <!-- 防御盾牌在血条右侧、与血条垂直居中；绝对定位不影响血条自身居中，有防御时血条变蓝 -->
      <div
        v-if="enemy.block > 0"
        class="absolute left-full -ml-3 -mt-1 top-1/2 -translate-y-1/2 w-10 h-10 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
      >
        <span class="absolute inset-0 flex items-center justify-center text-4xl leading-none"
          >🛡</span
        >
        <span
          class="absolute inset-0 flex items-center justify-center text-xs leading-none font-black text-white [text-shadow:0_0_4px_#0c4a6e,0_0_4px_#0c4a6e]"
          style="top: 9px"
          >{{ enemy.block }}</span
        >
      </div>
    </div>
    <div class="text-sm">
      ❤ {{ enemy.hp }}/{{ enemy.def.maxHp }}
      <span v-if="enemy.stolenGold" class="ml-2 text-amber-300">🪙 {{ enemy.stolenGold }}</span>
    </div>
    <StatusIcons :statuses="enemy.statuses" />
  </div>
</template>
