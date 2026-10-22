<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { pushFx, resetFx } from '@/composables/useFx'
import type { BattleState } from '@/engine/types'
import type { RunState } from '@/engine/run'
import BattleView from './BattleView.vue'
import RunView from './RunView.vue'
import ShopView from './ShopView.vue'
import { sceneFor, type Scene } from './sfxScenes'

/**
 * 音效面板的场景区：同一时刻只挂一个场景（useFx 的演出队列是全局的），
 * 切换槽位 / 重播都先 resetFx() 再重新挂载，状态全是临时构造的，不碰存档和 useRun。
 */
const props = defineProps<{ slotKey: string; replayKey: number }>()

const scene = shallowRef<Scene>()
const mountKey = ref(0)
const battleState = shallowRef<BattleState>()
const runState = shallowRef<RunState>()
const shop = ref<{ poor: (key: string) => void } | null>(null)
const error = ref('')
let token = 0

async function play() {
  const mine = ++token
  resetFx()
  error.value = ''
  try {
    const s = sceneFor(props.slotKey)
    scene.value = s
    mountKey.value++
    if (s.kind === 'battle') {
      const plan = s.build()
      // 先停在动画前的状态，下一拍把终态交给界面并推演出事件，和真实游戏一致（数值靠 lag 回退）
      battleState.value = plan.before
      await nextTick()
      if (mine !== token) return
      battleState.value = plan.state
      pushFx(plan.events)
      return
    }
    const start = s.run()
    runState.value = start
    await nextTick()
    if (mine !== token) return
    if (s.component === 'hud-gold' && s.goldTo !== undefined) {
      runState.value = { ...start, gold: s.goldTo }
    } else if (s.component === 'shop') {
      shop.value?.poor('card0')
    } else if (s.events) {
      pushFx(s.events, false)
    }
  } catch (e) {
    error.value = (e as Error).message
  }
}

watch(() => [props.slotKey, props.replayKey], play, { immediate: true })
onBeforeUnmount(() => {
  token++
  resetFx()
})
</script>

<template>
  <div class="scene-box">
    <div v-if="error" class="p-4 text-red-400 text-sm">{{ error }}</div>
    <div v-else class="scene-inner">
      <BattleView
        v-if="scene?.kind === 'battle' && battleState"
        :key="mountKey"
        :state="battleState"
        readonly
      />
      <ShopView
        v-else-if="scene?.kind === 'run' && scene.component === 'shop' && runState"
        :key="mountKey"
        ref="shop"
        :run="runState"
      />
      <RunView v-else-if="scene?.kind === 'run' && runState" :key="mountKey" :run="runState" />
    </div>
  </div>
</template>

<style scoped>
.scene-box {
  position: relative;
  width: 959px;
  height: 500px;
  overflow: hidden;
  border-radius: 8px;
  background: #0f172a;
}
.scene-inner {
  width: 1230px;
  height: 640px;
  transform: scale(0.78);
  transform-origin: top left;
}
</style>
