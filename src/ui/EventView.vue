<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { computed, ref } from 'vue'
import { optionDisabled, type EventDef } from '@/engine/event'
import type { RunState } from '@/engine/run'
import type { CardDef } from '@/engine/types'
import { relics } from '@/data/items'
import { statusById } from '@/engine/statuses'
import CardView from './CardView.vue'

const props = defineProps<{ run: RunState; def: EventDef }>()
defineEmits<{ choose: [index: number]; leave: [] }>()

const chosen = computed(() => props.run.event?.optionIndex != null)
const options = computed(() =>
  props.def.options.map((opt) => ({ label: opt.label, reason: optionDisabled(props.run, opt) })),
)

const cardByName = computed(() =>
  Object.fromEntries(Object.values(props.run.content.cards).map((c) => [c.name, c])),
)

/** 悬浮说明：卡牌显示牌面；遗物、敌人显示文字框 */
type Term = { card: CardDef } | { info: { icon?: string; name: string; lines: string[] } }

const relicByName = Object.fromEntries(Object.values(relics).map((r) => [r.name, r]))

/** 本事件战斗里出现的敌人 */
const enemyByName = computed(() =>
  Object.fromEntries(
    props.def.options
      .flatMap((o) => o.outcomes)
      .flatMap((o) => (o.type === 'battle' ? (o.enemies ?? []) : []))
      .map((e) => [e.name, e]),
  ),
)

function term(name: string): Term | undefined {
  const note = props.def.notes?.[name]
  const card = cardByName.value[name]
  if (card) return { card }
  const relic = relicByName[name]
  if (relic) return { info: { icon: relic.icon, name: relic.name, lines: [relic.text, ...(note ? [note] : [])] } }
  const enemy = enemyByName.value[name]
  if (enemy) {
    const statuses = Object.keys(enemy.startStatuses ?? {})
      .map((id) => statusById[id])
      .filter((st) => st?.text)
      .map((st) => `【${st.name}】${st.text}`)
    return { info: { icon: enemy.icon, name: `${enemy.name}（生命 ${enemy.maxHp}）`, lines: [...statuses, ...(note ? [note] : [])] } }
  }
  if (note) return { info: { name, lines: [note] } }
}

/** 把文字里的【名字】切出来；能对上卡牌 / 遗物 / 敌人 / 备注的加下划线 + 悬浮说明 */
function parts(label: string) {
  return label
    .split(/(【.+?】)/)
    .filter(Boolean)
    .map((text) => {
      const name = /^【(.+)】$/.exec(text)?.[1]
      return { text, term: name ? term(name) : undefined }
    })
}

/** 悬浮中的预览（视口坐标，文字左侧垂直居中）；null 表示不显示 */
const tip = ref<({ x: number; y: number } & Term) | null>(null)
function showTip(ev: MouseEvent, t: Term) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  // 牌高约 13rem，夹在视口内避免被上下边缘截掉
  const half = 'card' in t ? 112 : 60
  const y = Math.min(Math.max(r.top + r.height / 2, half + 8), window.innerHeight - half - 8)
  tip.value = { x: r.left - 12, y, ...t }
}
</script>

<template>
  <div class="scene">
    <div class="flex items-center gap-12 relative max-w-[1000px]">
      <div class="flex flex-col items-center gap-4 w-72 text-center">
        <span class="orb"><Emoji :e="def.icon" /></span>
        <span class="banner">{{ def.title }}</span>
        <p class="desc">
          <template v-for="(p, j) in parts(def.text)" :key="j">
            <span
              v-if="p.term"
              class="term"
              @mouseenter="showTip($event, p.term)"
              @mouseleave="tip = null"
              >{{ p.text }}</span
            >
            <template v-else>{{ p.text }}</template>
          </template>
        </p>
      </div>

      <div class="flex flex-col gap-3 w-[26rem]">
        <template v-if="!chosen">
          <button
            v-for="(opt, i) in options"
            :key="i"
            class="option"
            :disabled="opt.reason !== null"
            @click="$emit('choose', i)"
          >
            <span>
              <template v-for="(p, j) in parts(opt.label)" :key="j">
                <span
                  v-if="p.term"
                  class="term"
                  @mouseenter="showTip($event, p.term)"
                  @mouseleave="tip = null"
                  >{{ p.text }}</span
                >
                <template v-else>{{ p.text }}</template>
              </template>
            </span>
          </button>
        </template>
        <button v-else class="option" @click="$emit('leave')">继续</button>
      </div>
    </div>

    <!-- 卡牌预览：传送到 body，避免被舞台的 transform / 裁剪影响 -->
    <Teleport to="body">
      <div
        v-if="tip"
        class="card-tip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >
        <CardView v-if="'card' in tip" :card="tip.card" :playable="true" />
        <div v-else class="info-tip">
          <div class="font-bold mb-1">
            <Emoji v-if="tip.info.icon" :e="tip.info.icon" /> {{ tip.info.name }}
          </div>
          <p v-for="(line, k) in tip.info.lines" :key="k">{{ line }}</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f1f5f9;
  background: linear-gradient(180deg, #140d0a, #22140f 70%, #1f1410);
}
.option {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 1.2rem;
  text-align: left;
  color: inherit;
  cursor: pointer;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 6px, transparent 6px 12px),
    #241812;
  border: 3px solid transparent;
  border-radius: 12px;
  background-clip: padding-box;
  box-shadow:
    0 0 0 3px #d97706,
    0 6px 16px rgba(0, 0, 0, 0.6);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.option:hover:not(:disabled) {
  transform: translateX(-4px);
  box-shadow:
    0 0 0 3px #fcd34d,
    0 0 22px rgba(251, 191, 36, 0.5),
    0 8px 18px rgba(0, 0, 0, 0.6);
}
.option:disabled {
  cursor: not-allowed;
  filter: grayscale(0.7) brightness(0.6);
}
.orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6rem;
  height: 6rem;
  font-size: 3.2rem;
  background: radial-gradient(circle at 50% 40%, #7c2d12, #1c0a02 80%);
  border: 2px solid #fcd34d;
  border-radius: 50%;
}
.banner {
  padding: 0.25rem 2rem;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #fff;
  background: linear-gradient(180deg, #b45309, #78350f);
  clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
}
.desc {
  font-size: 0.95rem;
  line-height: 1.6;
  color: #d8c8b0;
}
/* 选项里的卡牌名：实线下划线 */
.term {
  cursor: help;
  text-decoration: underline;
}
.info-tip {
  width: 16rem;
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #f1f5f9;
  background: #1c120d;
  border: 2px solid #d97706;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
}
.card-tip {
  position: fixed;
  z-index: 2147483647;
  transform: translate(-100%, -50%);
  pointer-events: none;
}
</style>
