<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BattleState } from '@/engine/types'
import CardPanel from './CardPanel.vue'
import CardView from './CardView.vue'

/** 战斗中的待选弹框：净化（选手牌消耗）/ 复制 / 预知（选要弃掉的牌）/ 发现 */
const props = defineProps<{ state: BattleState }>()
const emit = defineEmits<{ resolve: [picks: number[]] }>()

const pending = computed(() => props.state.pending)
const ids = computed(() => {
  const p = pending.value
  if (!p) return []
  if (p.kind === 'scry') return p.cards
  if (p.kind === 'discover') return p.options
  if (p.kind === 'retrieve' || p.kind === 'recover') return p.cards
  return props.state.hand
})
const need = computed(() => {
  const p = pending.value
  if (!p) return { min: 0, max: 0 }
  if (p.kind === 'exhaust' || p.kind === 'retrieve') return { min: p.count, max: p.count }
  if (p.kind === 'scry') return { min: 0, max: p.cards.length }
  if (p.kind === 'recover') return { min: 0, max: 1 }
  return { min: 1, max: 1 }
})
const title = computed(
  () => ({ exhaust: '净化', copy: '复制', scry: '预知', discover: '发现', retrieve: '回收', recover: '遗弃徽章' })[pending.value?.kind ?? 'exhaust'],
)
const hint = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.kind === 'exhaust') return p.statusOnly ? '重放：选择一张状态牌消耗' : `选择 ${p.count} 张手牌消耗`
  if (p.kind === 'copy') return '选择一张手牌复制'
  if (p.kind === 'retrieve') return `从弃牌堆选择 ${p.count} 张牌放回手牌`
  if (p.kind === 'recover') return '本回合第一次弃牌：可以选一张刚弃掉的牌放回手牌，也可以不选'
  if (p.kind === 'scry') return '抽牌堆顶部的牌（自左向右）。点选要弃掉的牌，可以不选'
  return '选择一张牌加入手牌，本回合耗能变为 0'
})

const selected = ref<number[]>([])
watch(pending, () => (selected.value = []))

function eligible(id: string) {
  const p = pending.value
  return p?.kind !== 'exhaust' || !p.statusOnly || props.state.cards[id]?.rarity === 'status'
}

function toggle(i: number) {
  if (!eligible(ids.value[i] ?? '')) return
  if (selected.value.includes(i)) selected.value = selected.value.filter((x) => x !== i)
  else if (need.value.max === 1) selected.value = [i]
  else if (selected.value.length < need.value.max) selected.value = [...selected.value, i]
}
const ready = computed(() => selected.value.length >= need.value.min && selected.value.length <= need.value.max)
</script>

<template>
  <div v-if="pending" class="absolute inset-0 z-[56] bg-black/70 flex items-center justify-center p-8">
    <CardPanel :title="title" :hint="`${hint}（已选 ${selected.length}/${need.max}）`">
      <div class="flex flex-wrap justify-center gap-4">
        <template v-for="(id, i) in ids" :key="`${id}-${i}`">
          <CardView
            v-if="state.cards[id]"
            :card="state.cards[id]!"
            :playable="eligible(id)"
            :class="{ 'opacity-40': !eligible(id) }"
            :selected="selected.includes(i)"
            @click="toggle(i)"
          />
        </template>
      </div>
      <template #footer>
        <button class="btn-primary disabled:opacity-40" :disabled="!ready" @click="emit('resolve', selected)">
          确认
        </button>
      </template>
    </CardPanel>
  </div>
</template>
