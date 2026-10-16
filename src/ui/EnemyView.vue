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
        'text-purple-300': intent.type === 'debuff' || intent.type === 'buff',
      }"
    >
      <template v-if="intent.type === 'attack'">
        ⚔ {{ calcAttack(intent.damage, enemy.statuses, playerStatuses) }}
      </template>
      <template v-else-if="intent.type === 'defend'">🛡 {{ intent.block }}</template>
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
          : ''
      "
    >
      🟢
    </div>
    <div class="font-bold">{{ enemy.def.name }}</div>
    <div class="w-48 h-4 bg-slate-700 rounded overflow-hidden">
      <div
        class="h-full bg-red-500 transition-[width] duration-300"
        :style="{ width: `${(enemy.hp / enemy.def.maxHp) * 100}%` }"
      />
    </div>
    <div class="text-sm">
      ❤ {{ enemy.hp }}/{{ enemy.def.maxHp }}
      <span v-if="enemy.block > 0" class="ml-2 text-sky-300">🛡 {{ enemy.block }}</span>
    </div>
    <StatusIcons :statuses="enemy.statuses" />
  </div>
</template>
