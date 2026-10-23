<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import type { ShopItem } from '@/engine/shop'

defineProps<{ item: ShopItem; gold: number }>()
</script>

<template>
  <span class="price" :class="{ poor: !item.sold && gold < item.price }">
    <span class="now"><template v-if="item.sold">已售出</template><template v-else><Emoji e="💰" /> {{ item.price }}</template></span>
    <!-- 折扣行放在现价下方并始终占位，让现价紧贴商品：打折与否都不改变整体高度 -->
    <span class="meta">
      <template v-if="!item.sold && item.discount">
        <span class="sale">-{{ item.discount }}%</span>
        <s class="orig">{{ item.original }}</s>
      </template>
    </span>
  </span>
</template>

<style scoped>
.price {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 5rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fcd34d;
  white-space: nowrap;
}
.price.poor {
  color: #94a3b8;
  filter: grayscale(1);
}
.meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  height: 1.1rem;
}
.now {
  line-height: 1.2;
}
.orig {
  font-size: 0.75rem;
  font-weight: 400;
  color: #94a3b8;
}
.sale {
  padding: 0 0.3rem;
  font-size: 0.7rem;
  line-height: 1.1rem;
  color: #18100c;
  background: #4ade80;
  border-radius: 4px;
}
</style>
