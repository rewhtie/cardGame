<script setup lang="ts">
import type { ShopItem } from '@/engine/shop'

defineProps<{ item: ShopItem; gold: number }>()
</script>

<template>
  <span class="price" :class="{ poor: !item.sold && gold < item.price }">
    <template v-if="item.sold">已售出</template>
    <template v-else>
      <span v-if="item.discount" class="sale">-{{ item.discount }}%</span>
      <s v-if="item.original" class="orig">{{ item.original }}</s>
      💰 {{ item.price }}
    </template>
  </span>
</template>

<style scoped>
.price {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fcd34d;
}
.price.poor {
  color: #f87171;
}
.orig {
  font-size: 0.8rem;
  font-weight: 400;
  color: #94a3b8;
}
.sale {
  padding: 0 0.3rem;
  font-size: 0.7rem;
  color: #18100c;
  background: #4ade80;
  border-radius: 4px;
}
</style>
