<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRun } from '@/composables/useRun'
import { useSettings } from '@/composables/useSettings'
import { RESOLUTIONS, type DisplayMode } from '@/settings/settings'
import { quitApp } from '@/platform/window'
import CodexView from './CodexView.vue'

const emit = defineEmits<{ close: [] }>()

const { settings, setMode, setResolution } = useSettings()
const { run, seedInput, savedGame, continueGame, quit } = useRun()

/** 回到主菜单（存档保留） */
function toMenu() {
  quit()
  emit('close')
}
/** 快速重启：丢弃当前进度，重新读取存档 */
function quickRestart() {
  continueGame()
  emit('close')
}

const showCodex = ref(false)
/** 种子已移到对局右上角；设置里的种子板块暂时隐藏（代码保留，改成 true 即可恢复） */
const SHOW_SEED = false
/** 设置内的页面：主列表 / 画面设置 */
const page = ref<'main' | 'display'>('main')
const copied = ref(false)

async function copy(seed: string) {
  try {
    await navigator.clipboard.writeText(seed)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // 剪贴板不可用时忽略，种子仍显示在界面上
  }
}

const modes: { value: DisplayMode; label: string }[] = [
  { value: 'windowed', label: '窗口' },
  { value: 'fullscreen', label: '全屏' },
]

const isFullscreen = computed(() => settings.value.mode === 'fullscreen')

function isCurrent(width: number, height: number) {
  return settings.value.resolution.width === width && settings.value.resolution.height === height
}
</script>

<template>
  <div class="mask" @click.self="$emit('close')">
    <div class="frame">
      <button class="orb" title="关闭" @click="$emit('close')">✕</button>
      <div class="banner">{{ page === 'main' ? '设置' : '画面设置' }}</div>

      <div class="body">
        <button v-if="page !== 'main'" class="back" @click="page = 'main'">‹ 返回设置</button>

        <template v-if="page === 'main'">
          <button class="row" @click="showCodex = true">
            <span class="badge">📖</span>
            <span class="row-text">
              <span class="row-title">图鉴</span>
              <span class="row-sub">查看所有卡牌与遗物</span>
            </span>
            <span class="chev">›</span>
          </button>

          <button class="row" @click="page = 'display'">
            <span class="badge">🖥</span>
            <span class="row-text">
              <span class="row-title">画面设置</span>
              <span class="row-sub">
                {{ settings.mode === 'fullscreen' ? '全屏' : '窗口' }}，
                {{ settings.resolution.width }} × {{ settings.resolution.height }}
              </span>
            </span>
            <span class="chev">›</span>
          </button>

          <section v-if="SHOW_SEED" class="plaque">
            <div class="plaque-head">
              <span class="row-title">种子</span>
              <span class="row-sub">{{ run ? '这一局的种子' : '留空则随机，下一局生效' }}</span>
            </div>
            <div v-if="run" class="seed-line">
              <span class="seed select-text">{{ run.seed }}</span>
              <button
                class="chip"
                title="复制种子，分享给朋友即可得到相同的一局"
                @click="copy(run.seed)"
              >
                {{ copied ? '已复制' : '复制' }}
              </button>
            </div>
            <template v-else>
              <input
                v-model="seedInput"
                class="seed-input select-text"
                maxlength="16"
                placeholder="例如 7KQ2M9XA"
                spellcheck="false"
              />
              <div class="hint">输入相同的种子，就会得到相同的地图和战斗。</div>
            </template>
          </section>

          <button v-if="run" class="row" @click="toMenu">
            <span class="badge">🏠</span>
            <span class="row-text">
              <span class="row-title">回到主菜单</span>
              <span class="row-sub">存档保留，可从主菜单继续</span>
            </span>
            <span class="chev">›</span>
          </button>

          <button v-if="run && savedGame" class="row" @click="quickRestart">
            <span class="badge">↻</span>
            <span class="row-text">
              <span class="row-title">快速重启</span>
              <span class="row-sub">放弃当前进度，回到上次存档</span>
            </span>
            <span class="chev">›</span>
          </button>

          <button class="row" @click="quitApp">
            <span class="badge">⏻</span>
            <span class="row-text">
              <span class="row-title">退出游戏</span>
            </span>
            <span class="chev">›</span>
          </button>
        </template>

        <template v-else>
          <section class="plaque">
            <div class="plaque-head"><span class="row-title">显示模式</span></div>
            <div class="seg">
              <button
                v-for="m in modes"
                :key="m.value"
                class="seg-item"
                :class="{ on: settings.mode === m.value }"
                @click="setMode(m.value)"
              >
                {{ m.label }}
              </button>
            </div>
          </section>

          <section class="plaque">
            <div class="plaque-head"><span class="row-title">分辨率</span></div>
            <div class="res-grid">
              <button
                v-for="r in RESOLUTIONS"
                :key="`${r.width}x${r.height}`"
                class="chip"
                :class="{ on: isCurrent(r.width, r.height) }"
                @click="setResolution(r)"
              >
                {{ r.width }} × {{ r.height }}
              </button>
            </div>
            <div v-if="isFullscreen" class="hint">全屏时使用屏幕分辨率，窗口模式下生效。</div>
          </section>
        </template>
      </div>
    </div>
    <CodexView v-if="showCodex" @close="showCodex = false" />
  </div>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 45%, rgba(28, 16, 10, 0.78), rgba(0, 0, 0, 0.88));
}

/* 与卡牌一致的渐变金属外框 */
.frame {
  position: relative;
  width: 28rem;
  padding: 6px;
  border-radius: 16px;
  background: linear-gradient(145deg, #fef3c7, #d97706 55%, #fcd34d);
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.7),
    0 0 40px rgba(217, 119, 6, 0.25);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 2.6rem 1.25rem 1.25rem;
  border-radius: 11px;
  color: #f1e6d4;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.025) 0 6px, transparent 6px 12px),
    #241812;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.7);
}

/* 压在顶边的名牌条 */
.banner {
  position: absolute;
  top: -1.1rem;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  min-width: 11rem;
  padding: 0.45rem 2.2rem;
  text-align: center;
  white-space: nowrap;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #fff;
  background: linear-gradient(180deg, #b45309, #78350f);
  border-top: 1px solid rgba(255, 255, 255, 0.45);
  border-bottom: 1px solid rgba(0, 0, 0, 0.6);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
}

/* 角上的关闭宝石 */
.orb {
  position: absolute;
  top: -12px;
  right: -12px;
  z-index: 3;
  width: 2.1rem;
  height: 2.1rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: #fde68a;
  cursor: pointer;
  background: #24170f;
  border: 1px solid rgba(251, 191, 36, 0.5);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  transition:
    color 0.15s,
    background 0.15s,
    transform 0.15s;
}
.orb:hover {
  color: #1c1917;
  background: #fbbf24;
  transform: rotate(90deg);
}

.back {
  align-self: flex-start;
  padding: 0.1rem 0.2rem;
  font-size: 0.85rem;
  color: #b09c86;
  background: none;
  border: 0;
  cursor: pointer;
}
.back:hover {
  color: #fbbf24;
}

/* 菜单行 */
.row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  text-align: left;
  color: inherit;
  cursor: pointer;
  background: linear-gradient(90deg, rgba(74, 56, 44, 0.7), rgba(45, 34, 28, 0.7));
  border: 1px solid #4a3b30;
  border-radius: 10px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.row:hover {
  border-color: #f59e0b;
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.3);
}
.badge {
  flex: none;
  width: 2.6rem;
  height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  background: radial-gradient(circle at 50% 40%, #b45309, #451a03 80%);
  border: 2px solid #fcd34d;
  border-radius: 50%;
}
.row-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.row-title {
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #fef3c7;
}
.row-sub {
  font-size: 0.75rem;
  color: #b09c86;
}
.chev {
  font-size: 1.5rem;
  color: #d97706;
}

/* 内容板块 */
.plaque {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  background: rgba(24, 16, 12, 0.65);
  border: 1px solid #4a3b30;
  border-radius: 10px;
}
.plaque-head {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
}
.hint {
  font-size: 0.75rem;
  color: #8a7562;
}

.seed-line {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.seed,
.seed-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 1.15rem;
  letter-spacing: 0.22em;
  color: #fcd34d;
  background: #140d0a;
  border: 1px solid #6b5a4c;
  border-radius: 8px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  outline: none;
}
.seed {
  font-family: ui-monospace, Consolas, monospace;
}
.seed-input {
  width: 100%;
  text-transform: uppercase;
}
.seed-input::placeholder {
  color: #6b5a4c;
  letter-spacing: 0.1em;
}
.seed-input:focus {
  border-color: #f59e0b;
}

/* 小按钮 */
.chip {
  padding: 0.45rem 0.9rem;
  font-size: 0.9rem;
  color: #f1e6d4;
  cursor: pointer;
  background: #2d221c;
  border: 1px solid #6b5a4c;
  border-radius: 8px;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.chip:hover {
  border-color: #f59e0b;
}
.chip.on {
  color: #fff;
  font-weight: 700;
  background: linear-gradient(180deg, #b45309, #78350f);
  border-color: #fcd34d;
}

/* 分段选择 */
.seg {
  display: flex;
  gap: 0.4rem;
}
.seg-item {
  flex: 1;
  padding: 0.55rem 0;
  font-size: 1rem;
  color: #d8c8b0;
  cursor: pointer;
  background: #2d221c;
  border: 1px solid #6b5a4c;
  border-radius: 8px;
  transition: border-color 0.15s;
}
.seg-item:hover {
  border-color: #f59e0b;
}
.seg-item.on {
  color: #fff;
  font-weight: 700;
  background: linear-gradient(180deg, #b45309, #78350f);
  border-color: #fcd34d;
}

.res-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
</style>
