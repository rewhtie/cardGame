<script setup lang="ts">
import { computed, ref } from 'vue'
import { cards as allCards } from '@/data/cards'
import { evolvedId, resolveCards } from '@/engine/enchant'
import type { CardDef } from '@/engine/types'
import CardView from './CardView.vue'

const props = defineProps<{
  card: CardDef
  /** 升级后的牌面；诅咒牌没有升级版，不传 */
  upgraded?: CardDef
  /** 进化进度（战斗牌堆里按实例记的计数） */
  progress?: number
}>()

/** 成长牌：成长后会变成的牌（保留升级 / 附魔标记） */
const evolved = computed(() => {
  const into = props.card.evolve?.into
  if (!into) return undefined
  const id = evolvedId(props.card.id, into)
  return resolveCards(allCards, [id])[id]
})

/** 右键：弹出对比；成长牌是 左边初始，右上锻造、右下成长 */
const comparing = ref(false)
const canCompare = computed(() => !!props.upgraded || !!evolved.value)
</script>

<template>
  <div class="w-36 h-52" @contextmenu.prevent="comparing = canCompare">
    <CardView :card="card" :playable="true" :progress="progress" />

    <!-- stage 带 transform，fixed 实际相对舞台铺满，不受外层滚动区裁剪 -->
    <div
      v-if="comparing && canCompare"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center gap-10"
      @click.stop="comparing = false"
      @contextmenu.prevent.stop="comparing = false"
      @pointerdown.stop
      @wheel.stop
    >
      <CardView
        :card="card"
        :playable="true"
        :progress="progress"
        class="scale-110 pointer-events-none"
      />
      <!-- 每个分支一行：标签胶囊 + 细线箭头 + 牌面 -->
      <div class="flex flex-col gap-10">
        <div v-if="upgraded" class="flex items-center gap-4">
          <div class="flex flex-col items-center gap-2">
            <span class="px-3 py-0.5 rounded-full text-sm font-bold bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40">锻造后</span>
            <svg class="w-20 h-3 text-emerald-400" viewBox="0 0 80 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 6h74M68 1l8 5-8 5" />
            </svg>
          </div>
          <CardView :card="upgraded" :playable="true" class="scale-110 pointer-events-none" />
        </div>
        <div v-if="evolved" class="flex items-center gap-4">
          <div class="flex flex-col items-center gap-2">
            <span class="px-3 py-0.5 rounded-full text-sm font-bold bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/40">成长后</span>
            <svg class="w-20 h-3 text-sky-400" viewBox="0 0 80 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 6h74M68 1l8 5-8 5" />
            </svg>
            <span class="text-xs text-slate-400 text-center leading-snug">打出 {{ card.evolve!.plays }} 次<br />战斗胜利时结算</span>
          </div>
          <CardView :card="evolved" :playable="true" class="scale-110 pointer-events-none" />
        </div>
      </div>
    </div>
  </div>
</template>
