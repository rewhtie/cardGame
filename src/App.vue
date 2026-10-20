<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { useRun } from '@/composables/useRun'
import { useSettings } from '@/composables/useSettings'
import CharacterSelectView from '@/ui/CharacterSelectView.vue'
import RunView from '@/ui/RunView.vue'
import SettingsPanel from '@/ui/SettingsPanel.vue'
import StageFrame from '@/ui/StageFrame.vue'
import StartView from '@/ui/StartView.vue'

/** 开发模式专用的卡牌测试台；生产构建里整个模块不会被打包 */
const DevTestView = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/ui/DevTestView.vue'))
  : null

const CardEditorView = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/ui/CardEditorView.vue'))
  : null

const showSettings = ref(false)
const showEditor = ref(false)
const showSelect = ref(false)
const showDevTest = ref(false)
const { init } = useSettings()
const { run, savedGame, start, continueGame, send, retry, quit } = useRun()

onMounted(init)
</script>

<template>
  <StageFrame>
    <RunView v-if="run" :run="run" @send="send" @retry="retry" @menu="quit" />
    <StartView
      v-else
      :save="savedGame"
      @start="showSelect = true"
      @continue="continueGame()"
      @settings="showSettings = true"
    />
    <CharacterSelectView
      v-if="showSelect && !run"
      @choose="(id) => { showSelect = false; start(id) }"
      @back="showSelect = false"
    />
    <button
      v-if="DevTestView && !run"
      class="absolute top-1/2 left-0 z-10 -translate-y-1/2 px-2 py-4 rounded-r border-0 bg-amber-500 text-slate-900 font-bold text-sm cursor-pointer hover:bg-amber-400 [writing-mode:vertical-rl]"
      title="开发模式：卡牌测试台"
      @click="showDevTest = true"
    >
      🧪 卡牌测试
    </button>
    <component :is="DevTestView" v-if="DevTestView && showDevTest" @close="showDevTest = false" />
    <button
      v-if="CardEditorView && !run"
      class="absolute top-[calc(50%+9rem)] left-0 z-10 -translate-y-1/2 px-2 py-4 rounded-r border-0 bg-emerald-500 text-slate-900 font-bold text-sm cursor-pointer hover:bg-emerald-400 [writing-mode:vertical-rl]"
      title="开发模式：卡牌编辑器"
      @click="showEditor = true"
    >
      🛠 卡牌编辑
    </button>
    <component :is="CardEditorView" v-if="CardEditorView && showEditor" @close="showEditor = false" />
    <button
      class="absolute top-3 right-3 z-10 w-10 h-10 p-0 border-0 bg-transparent text-3xl leading-10 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
      title="设置"
      @click="showSettings = true"
    >
      ⚙
    </button>
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </StageFrame>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

/* 游戏统一背景：暖棕炭黑 + 底部篝火余温 + 顶部淡青月光 + 柔和暗角 */
.theme-bg {
  background:
    radial-gradient(ellipse 90% 55% at 50% 112%, rgba(234, 120, 20, 0.42), transparent 70%),
    radial-gradient(ellipse 55% 40% at 50% -5%, rgba(120, 170, 160, 0.14), transparent 70%),
    radial-gradient(ellipse at center, transparent 60%, rgba(10, 4, 2, 0.45) 100%),
    repeating-linear-gradient(135deg, rgba(255, 220, 170, 0.03) 0 2px, transparent 2px 14px),
    linear-gradient(180deg, #1c1411 0%, #2a1c16 55%, #3a2217 100%);
}

/* 滚动条：细窄的暗色轨道 + 金色滑块，与卡面金属边框呼应 */
* {
  scrollbar-width: thin;
  scrollbar-color: #b45309 rgba(24, 16, 12, 0.5);
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: rgba(24, 16, 12, 0.5);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #fcd34d, #b45309);
  border: 2px solid rgba(24, 16, 12, 0.85);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #fde68a, #d97706);
}
::-webkit-scrollbar-corner {
  background: transparent;
}

html,
body,
#app {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  font-family: system-ui, 'Microsoft YaHei', sans-serif;
  user-select: none;
}
</style>
