<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { playMenuMusic, playRunMusic, stopMenuMusic, stopRunMusic } from '@/composables/useMusic'
import { useRun } from '@/composables/useRun'
import { useDevHotState } from '@/composables/useDevHotState'
import { useSettings } from '@/composables/useSettings'
import CharacterSelectView from '@/ui/CharacterSelectView.vue'
import CodexView from '@/ui/CodexView.vue'
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
const showCodex = ref(false)
const showEditor = ref(false)
const showSfxEditor = ref(false)
const showSelect = ref(false)
const showDevTest = ref(false)

useDevHotState(import.meta.hot, 'dev-panels', {
  showStatusEditor, showEnemyEditor, showEditor, showSfxEditor, showDevTest, showSettings, showCodex, showSelect,
})
const { init } = useSettings()
const { run, savedGame, start, continueGame, send, retry, quit } = useRun()

onMounted(init)

// 没有进行中的局时（主菜单 / 选角色）播放菜单 OST；只有进入战斗才放战斗 OST，地图等其它界面静音
watch(
  () => (!run.value ? 'menu' : run.value.screen === 'battle' ? 'battle' : 'quiet'),
  (scene) => {
    if (scene !== 'menu') stopMenuMusic()
    if (scene !== 'battle') stopRunMusic()
    if (scene === 'menu') playMenuMusic()
    else if (scene === 'battle') playRunMusic()
  },
  { immediate: true },
)
</script>

<template>
  <StageFrame>
    <RunView v-if="run" :run="run" @send="send" @retry="retry" @menu="quit" />
    <StartView
      v-else
      :save="savedGame"
      @start="showSelect = true"
      @continue="continueGame()"
      @codex="showCodex = true"
      @settings="showSettings = true"
    />
    <CodexView v-if="showCodex && !run" @close="showCodex = false" />
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

/* 游戏统一背景：墨黑底 + 纸张颗粒 + 底部暗红血光 + 四角深暗角，衬托粗墨线手绘立绘 */
.theme-bg {
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.88 0 0 0 0 0.75 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse 85% 50% at 50% 115%, rgba(200, 32, 42, 0.32), transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% -8%, rgba(242, 230, 204, 0.08), transparent 70%),
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.7) 100%),
    linear-gradient(180deg, #120e0b 0%, #1b1511 55%, #24120f 100%);
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

/* 滚动条：墨色轨道 + 血红滑块，与立绘的红色符文呼应 */
* {
  scrollbar-width: thin;
  scrollbar-color: #a3161f rgba(13, 10, 8, 0.6);
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
  background: linear-gradient(180deg, #e04848, #7c1018);
  border: 2px solid #0d0a08;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #f08a8a, #a3161f);
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
