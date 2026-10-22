<script setup lang="ts">
import { ref } from 'vue'
import type { CardDef } from '@/engine/types'
import CardView from './CardView.vue'

defineProps<{
  card: CardDef
  /** 升级后的牌面；诅咒牌没有升级版，不传 */
  upgraded?: CardDef
  /** 进化进度（战斗牌堆里按实例记的计数） */
  progress?: number
}>()

/** 右键：弹出升级前 / 升级后的对比 */
const comparing = ref(false)
</script>

<template>
  <div class="w-36 h-52" @contextmenu.prevent="comparing = !!upgraded">
    <CardView :card="card" :playable="true" :progress="progress" />

    <!-- stage 带 transform，fixed 实际相对舞台铺满，不受外层滚动区裁剪 -->
    <div
      v-if="comparing && upgraded"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center gap-12"
      @click.stop="comparing = false"
      @contextmenu.prevent.stop="comparing = false"
      @pointerdown.stop
      @wheel.stop
    >
      <div class="flex flex-col items-center gap-3">
        <div class="text-slate-300">升级前</div>
        <CardView
          :card="card"
          :playable="true"
          :progress="progress"
          class="scale-125 pointer-events-none"
        />
      </div>
      <div class="text-4xl text-amber-400">➜</div>
      <div class="flex flex-col items-center gap-3">
        <div class="text-emerald-400 font-bold">升级后</div>
        <CardView :card="upgraded" :playable="true" class="scale-125 pointer-events-none" />
      </div>
    </div>
  </div>
</template>
