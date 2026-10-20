<script setup lang="ts">
import { ref } from 'vue'
import { cards } from '@/data/cards'
import { potions, relics } from '@/data/items'
import { maxPotions, type RunState } from '@/engine/run'
import type { ShopItem } from '@/engine/shop'
import CardPickView from './CardPickView.vue'
import CardView from './CardView.vue'
import HoverTip from './HoverTip.vue'
import ShopPrice from './ShopPrice.vue'

const props = defineProps<{ run: RunState }>()
const emit = defineEmits<{
  buy: [kind: 'card' | 'relic' | 'potion', index: number]
  remove: [deckIndex: number]
  leave: []
}>()

const removing = ref(false)

const shop = () => props.run.shop!
const canAfford = (item: ShopItem) => !item.sold && props.run.gold >= item.price
const potionFull = () => props.run.potions.length >= maxPotions(props.run.relics)
</script>

<template>
  <div class="shop theme-bg text-slate-100">
    <CardPickView
      v-if="removing"
      title="删除一张牌"
      :hint="`支付 ${shop().removeCost} 金币，永久删除一张牌`"
      :deck="run.content.deck"
      :cards="cards"
      :count="1"
      :eligible="() => true"
      cancellable
      @cancel="removing = false"
      @confirm="
        (idx) => {
          removing = false
          emit('remove', idx[0] ?? -1)
        }
      "
    />

    <header class="title">🛒 商店</header>

    <div class="rows">
      <!-- 第一行：5 张角色卡 + 3 个遗物 -->
      <div class="row">
        <div class="group">
          <div v-for="(item, i) in shop().cards.slice(0, 5)" :key="i" class="slot">
            <template v-if="item">
              <div :class="{ sold: item.sold }">
                <CardView
                  :card="cards[item.id]!"
                  :playable="canAfford(item)"
                  @click="canAfford(item) && emit('buy', 'card', i)"
                />
              </div>
              <ShopPrice :item="item" :gold="run.gold" />
            </template>
          </div>
        </div>
        <div class="group">
          <div v-for="(item, i) in shop().relics" :key="item.id" class="slot">
            <HoverTip
              :icon="relics[item.id]?.icon ?? ''"
              :name="relics[item.id]?.name ?? item.id"
              :text="relics[item.id]?.text ?? ''"
              tag="遗物"
            >
              <button
                class="item"
                :class="{ sold: item.sold }"
                :disabled="!canAfford(item)"
                @click="emit('buy', 'relic', i)"
              >
                {{ relics[item.id]?.icon }}
              </button>
            </HoverTip>
            <ShopPrice :item="item" :gold="run.gold" />
          </div>
        </div>
      </div>

      <!-- 第二行：2 张无色卡（暂空） + 3 瓶药水 + 删牌 -->
      <div class="row">
        <div class="group">
          <div v-for="(item, i) in shop().cards.slice(5)" :key="i" class="slot">
            <template v-if="item">
              <div :class="{ sold: item.sold }">
                <CardView
                  :card="cards[item.id]!"
                  :playable="canAfford(item)"
                  @click="canAfford(item) && emit('buy', 'card', i + 5)"
                />
              </div>
              <ShopPrice :item="item" :gold="run.gold" />
            </template>
            <div v-else class="empty-card">无色卡</div>
          </div>
        </div>
        <div class="group">
          <div v-for="(item, i) in shop().potions" :key="i" class="slot">
            <HoverTip
              :icon="potions[item.id]?.icon ?? ''"
              :name="potions[item.id]?.name ?? item.id"
              :text="potions[item.id]?.text ?? ''"
              tag="药水"
            >
              <button
                class="item"
                :class="{ sold: item.sold }"
                :disabled="!canAfford(item) || potionFull()"
                @click="emit('buy', 'potion', i)"
              >
                {{ potions[item.id]?.icon }}
              </button>
            </HoverTip>
            <ShopPrice :item="item" :gold="run.gold" />
          </div>
          <div class="slot">
            <button
              class="item remove"
              :class="{ sold: shop().removed }"
              :disabled="shop().removed || run.gold < shop().removeCost"
              title="删除一张牌"
              @click="removing = true"
            >
              🗑️
            </button>
            <span class="price" :class="{ poor: !shop().removed && run.gold < shop().removeCost }">
              {{ shop().removed ? '已使用' : `删牌 💰 ${shop().removeCost}` }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-primary leave" @click="emit('leave')">离开商店</button>
  </div>
</template>

<style scoped>
.shop {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding-top: 3rem;
}
.title {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  color: #fde68a;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 3rem;
}
.group {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.row > .group:last-child {
  width: 15rem;
  justify-content: flex-end;
}
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}
.price {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fcd34d;
}
.price.poor {
  color: #f87171;
}
.sold {
  opacity: 0.3;
  pointer-events: none;
}
.empty-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 9rem;
  height: 13rem;
  color: #6b5d50;
  border: 2px dashed #4a3b30;
  border-radius: 12px;
}
.item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.2rem;
  height: 4.2rem;
  font-size: 2rem;
  cursor: pointer;
  background: radial-gradient(circle at 50% 35%, #334155, #0f172a 85%);
  border: 2px solid rgba(252, 211, 77, 0.6);
  border-radius: 50%;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.item:hover:not(:disabled) {
  transform: translateY(-4px);
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.5);
}
.item:disabled {
  cursor: not-allowed;
  filter: grayscale(0.6) brightness(0.7);
}
.leave {
  margin-top: 0.5rem;
}
</style>
