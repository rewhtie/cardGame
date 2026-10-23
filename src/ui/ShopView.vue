<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { cards } from '@/data/cards'
import { playSfx } from '@/composables/useSfx'
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

/** 买不起：被点的价格抖一下，并提示金币不足 */
const shaking = ref('')
const notice = ref('')
let shakeTimer = 0
let noticeTimer = 0
async function poor(key: string) {
  void playSfx('run.shop.poor')
  shaking.value = ''
  await nextTick() // 先清空再赋值，连点时动画才会重播
  shaking.value = key
  clearTimeout(shakeTimer)
  shakeTimer = window.setTimeout(() => (shaking.value = ''), 450)
  // 提示的消失时间定死：显示期间再点不会续期
  if (notice.value) return
  notice.value = '金币不足'
  noticeTimer = window.setTimeout(() => (notice.value = ''), 1500)
}
// 音效面板复现"买不起"场景时需要从外部触发一次
defineExpose({ poor })
onBeforeUnmount(() => {
  clearTimeout(shakeTimer)
  clearTimeout(noticeTimer)
})
function buy(item: ShopItem, kind: 'card' | 'relic' | 'potion', i: number) {
  if (item.sold) return
  if (!canAfford(item)) return void poor(`${kind}${i}`)
  emit('buy', kind, i)
}
function startRemove() {
  if (shop().removed) return
  if (props.run.gold < shop().removeCost) return void poor('remove')
  removing.value = true
}
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

    <header class="title"><Emoji e="🛒" /> 商店</header>

    <div class="rows">
      <!-- 第一行：5 张角色卡 -->
      <div class="row">
        <div class="group">
          <div v-for="(item, i) in shop().cards.slice(0, 5)" :key="i" class="slot">
            <template v-if="item">
              <div :class="{ sold: item.sold, shake: shaking === `card${i}` }">
                <CardView
                  :card="cards[item.id]!"
                  :playable="!item.sold"
                  @click="buy(item, 'card', i)"
                />
              </div>
              <ShopPrice :item="item" :gold="run.gold" :class="{ shake: shaking === `card${i}` }" />
            </template>
          </div>
        </div>
      </div>

      <!-- 第二行：2 张无色卡；右侧上排遗物、下排药水，再右为删牌 -->
      <div class="row">
        <div class="group">
          <div v-for="(item, i) in shop().cards.slice(5)" :key="i" class="slot">
            <template v-if="item">
              <div :class="{ sold: item.sold, shake: shaking === `card${i + 5}` }">
                <CardView
                  :card="cards[item.id]!"
                  :playable="!item.sold"
                  @click="buy(item, 'card', i + 5)"
                />
              </div>
              <ShopPrice :item="item" :gold="run.gold" :class="{ shake: shaking === `card${i + 5}` }" />
            </template>
            <div v-else class="empty-card">无色卡</div>
          </div>
        </div>
        <div class="shelf">
          <div class="aisle">
            <div v-for="(item, i) in shop().relics" :key="item.id" class="slot">
              <HoverTip
                :icon="relics[item.id]?.icon ?? ''"
                :name="relics[item.id]?.name ?? item.id"
                :text="relics[item.id]?.text ?? ''"
                :lore="relics[item.id]?.lore"
                tag="遗物"
              >
                <button
                  class="item"
                  :class="{ sold: item.sold, shake: shaking === `relic${i}` }"
                  :disabled="item.sold"
                  @click="buy(item, 'relic', i)"
                >
                  <Emoji :e="relics[item.id]?.icon" />
                </button>
              </HoverTip>
              <ShopPrice :item="item" :gold="run.gold" :class="{ shake: shaking === `relic${i}` }" />
            </div>
          </div>
          <div class="aisle">
            <div v-for="(item, i) in shop().potions" :key="i" class="slot">
              <HoverTip
                :icon="potions[item.id]?.icon ?? ''"
                :name="potions[item.id]?.name ?? item.id"
                :text="potions[item.id]?.text ?? ''"
                tag="药水"
              >
                <button
                  class="item"
                  :class="{ sold: item.sold, shake: shaking === `potion${i}` }"
                  :disabled="item.sold || potionFull()"
                  @click="buy(item, 'potion', i)"
                >
                  <Emoji :e="potions[item.id]?.icon" />
                </button>
              </HoverTip>
              <ShopPrice :item="item" :gold="run.gold" :class="{ shake: shaking === `potion${i}` }" />
            </div>
          </div>
          <div class="slot remove-slot">
            <button
              class="item remove"
              :class="{ sold: shop().removed, shake: shaking === 'remove' }"
              :disabled="shop().removed"
              title="删除一张牌"
              @click="startRemove"
            >
              <Emoji e="🗑️" />
            </button>
            <span
              class="price"
              :class="{ poor: !shop().removed && run.gold < shop().removeCost, shake: shaking === 'remove' }"
            >
              <template v-if="shop().removed">已使用</template><template v-else>删牌 <Emoji e="💰" /> {{ shop().removeCost }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <Transition name="notice">
      <div v-if="notice" class="notice">{{ notice }}</div>
    </Transition>

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
.shelf {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: 1fr 1fr;
  flex: 1;
  align-content: center;
  justify-content: center;
  column-gap: 3rem;
  row-gap: 0.6rem;
}
.aisle {
  display: flex;
  gap: 1rem;
  justify-content: center;
}
/* 遗物 / 药水格子定宽：价格、折扣标签变化都不会撑开排版 */
.aisle > .slot {
  width: 5.5rem;
}
.remove-slot {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
}
.remove-slot {
  width: 5.5rem;
}
.item.remove {
  width: 4.6rem;
  height: 4.6rem;
  font-size: 2.2rem;
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
  color: #94a3b8;
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
.shake {
  animation: shake 0.45s;
}
/* 商店里的卡牌悬浮上浮得更少（手牌里仍是原来的 1rem） */
.shop :deep(.card.playable:hover) {
  transform: translateY(-0.5rem);
}
/* 买不起时的抖动：卡牌先落回原位再左右晃动，和药水、遗物一致 */
.shake :deep(.card.playable:hover) {
  transform: none;
  filter: none;
}
/* 价格是行内元素，transform 要变成 inline-flex 才生效 */
span.shake {
  display: inline-flex;
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20%,
  60% {
    transform: translateX(-6px);
  }
  40%,
  80% {
    transform: translateX(6px);
  }
}
.notice {
  position: absolute;
  top: 5.5rem;
  left: 50%;
  z-index: 50;
  transform: translateX(-50%);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  pointer-events: none;
}
.notice-enter-active {
  animation: notice-pop 0.25s ease-out;
}
.notice-leave-active {
  transition: opacity 0.3s;
}
@keyframes notice-pop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
