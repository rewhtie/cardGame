<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { playMenuMusic, stopMenuMusic } from '@/composables/useMusic'
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

/** 卡牌编辑器：开发模式改源码；打包后给玩家调整已有卡牌（从设置进入） */
const CardEditorView = defineAsyncComponent(() => import('@/ui/CardEditorView.vue'))
const isDev = import.meta.env.DEV

const SfxEditorView = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/ui/SfxEditorView.vue'))
  : null

const EnemyEditorView = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/ui/EnemyEditorView.vue'))
  : null

const StatusEditorView = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/ui/StatusEditorView.vue'))
  : null

const showStatusEditor = ref(false)
const showEnemyEditor = ref(false)
const showSettings = ref(false)
const showEditor = ref(false)
const showSfxEditor = ref(false)
const showSelect = ref(false)
const showDevTest = ref(false)
const { init } = useSettings()
const { run, savedGame, start, continueGame, send, retry, quit } = useRun()

onMounted(init)

// 没有进行中的局时（主菜单 / 选角色）播放 OST，进入游戏后停止
watch(() => !!run.value, (inRun) => (inRun ? stopMenuMusic() : playMenuMusic()), { immediate: true })
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
    <!-- 开发模式入口：竖排在左侧居中，数量增减不会互相挤出屏幕 -->
    <div
      v-if="!run && (DevTestView || (isDev && CardEditorView) || SfxEditorView || EnemyEditorView || StatusEditorView)"
      class="absolute left-0 top-1/2 z-10 -translate-y-1/2 flex flex-col gap-2"
    >
      <button
        v-if="DevTestView"
        class="dev-entry bg-amber-500 hover:bg-amber-400"
        title="开发模式：卡牌测试台"
        @click="showDevTest = true"
      >
        🧪 卡牌测试
      </button>
      <button
        v-if="isDev"
        class="dev-entry bg-emerald-500 hover:bg-emerald-400"
        title="开发模式：卡牌编辑器"
        @click="showEditor = true"
      >
        🛠 卡牌编辑
      </button>
      <button
        v-if="SfxEditorView"
        class="dev-entry bg-sky-500 hover:bg-sky-400"
        title="开发模式：音效编辑器"
        @click="showSfxEditor = true"
      >
        🔊 音效编辑
      </button>
      <button
        v-if="EnemyEditorView"
        class="dev-entry bg-rose-500 hover:bg-rose-400"
        title="开发模式：敌人编辑器"
        @click="showEnemyEditor = true"
      >
        👹 敌人编辑
      </button>
      <button
        v-if="StatusEditorView"
        class="dev-entry bg-violet-400 hover:bg-violet-300"
        title="开发模式：状态面板"
        @click="showStatusEditor = true"
      >
        ☠️ 状态面板
      </button>
    </div>
    <component :is="DevTestView" v-if="DevTestView && showDevTest" @close="showDevTest = false" />
    <component :is="CardEditorView" v-if="CardEditorView && showEditor" @close="showEditor = false" />
    <component :is="SfxEditorView" v-if="SfxEditorView && showSfxEditor" @close="showSfxEditor = false" />
    <component :is="EnemyEditorView" v-if="EnemyEditorView && showEnemyEditor" @close="showEnemyEditor = false" />
    <component :is="StatusEditorView" v-if="StatusEditorView && showStatusEditor" @close="showStatusEditor = false" />
    <button
      class="absolute top-3 right-3 z-10 w-10 h-10 p-0 border-0 bg-transparent text-3xl leading-10 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
      title="设置"
      @click="showSettings = true"
    >
      ⚙
    </button>
    <SettingsPanel v-if="showSettings" @close="showSettings = false" @cards="showSettings = false; showEditor = true" />
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

/* 主菜单左侧的开发模式入口：竖排文字小标签，颜色由各按钮自带 */
.dev-entry {
  padding: 1rem 0.5rem;
  border: 0;
  border-radius: 0 0.25rem 0.25rem 0;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  writing-mode: vertical-rl;
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
