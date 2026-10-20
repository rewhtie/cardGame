<script setup lang="ts">
import { computed } from 'vue'
import { potions as defs } from '@/data/items'
import CardPanel from './CardPanel.vue'

const props = defineProps<{ offer: string[]; held: string[]; capacity: number }>()
defineEmits<{ take: [index: number]; skip: [index?: number] }>()

const full = computed(() => props.held.length >= props.capacity)
</script>

<template>
  <div class="absolute inset-0 z-[9] flex items-center justify-center bg-black/75 pt-16" @pointerdown.stop>
    <CardPanel
      class="!w-[34rem] !h-[26rem]"
      title="获得药水"
      closable
      :hint="full ? '药水栏已满：在上方状态栏右键药水可丢弃' : '选择拿走或放弃'"
      @close="$emit('skip')"
    >
      <div class="flex flex-col gap-3">
        <div v-for="(id, i) in offer" :key="`${id}-${i}`" class="row">
          <span class="icon">{{ defs[id]?.icon ?? '🧪' }}</span>
          <span class="flex-1">
            <span class="name">{{ defs[id]?.name ?? id }}</span>
            <span class="desc">{{ defs[id]?.text }}</span>
          </span>
          <button class="act take" :disabled="full" @click="$emit('take', i)">拿走</button>
          <button class="act" @click="$emit('skip', i)">放弃</button>
        </div>
      </div>
    </CardPanel>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.6rem 0.9rem;
  color: #e2e8f0;
  background: linear-gradient(90deg, rgba(51, 65, 85, 0.75), rgba(30, 41, 59, 0.75));
  border: 1px solid #334155;
  border-radius: 10px;
}
.icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  font-size: 1.6rem;
  background: radial-gradient(circle at 50% 35%, #334155, #0f172a 85%);
  border: 2px solid #38bdf8;
  border-radius: 50%;
}
.name {
  display: block;
  font-weight: 700;
  color: #fef3c7;
}
.desc {
  display: block;
  font-size: 0.8rem;
  color: #94a3b8;
}
.act {
  padding: 0.25rem 0.8rem;
  font-size: 0.85rem;
  color: #e2e8f0;
  cursor: pointer;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid #64748b;
  border-radius: 8px;
}
.act:hover:not(:disabled) {
  border-color: #f59e0b;
}
.act:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.take {
  border-color: #38bdf8;
}
</style>
