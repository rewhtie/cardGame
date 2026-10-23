<script setup lang="ts">
import Emoji from '@/ui/Emoji.vue'
import AnvilIcon from './AnvilIcon.vue'
import FireIcon from './FireIcon.vue'

defineProps<{ hp: number; maxHp: number; healAmount: number; canForge: boolean; special?: { name: string; icon: string; desc: string } | null; specialBlocked?: string | null }>()
defineEmits<{ rest: []; forge: []; special: []; leave: [] }>()
</script>

<template>
  <div class="scene">
    <div class="glow" />

    <div class="flex gap-8 relative">
      <button class="option" :disabled="hp >= maxHp" @click="$emit('rest')">
        <span class="orb"><FireIcon class="w-14 h-14" /></span>
        <span class="banner">休息</span>
        <span class="desc">回复 {{ healAmount }} 点生命</span>
        <span v-if="hp >= maxHp" class="note">生命已满</span>
      </button>

      <button class="option" :disabled="!canForge" @click="$emit('forge')">
        <span class="orb"><AnvilIcon class="w-14 h-14" /></span>
        <span class="banner">锻造</span>
        <span class="desc">升级一张牌</span>
        <span v-if="!canForge" class="note">没有可升级的牌</span>
      </button>

      <button v-if="special" class="option" :disabled="!!specialBlocked" @click="$emit('special')">
        <span class="orb"><span class="text-5xl"><Emoji :e="special.icon" /></span></span>
        <span class="banner">{{ special.name }}</span>
        <span class="desc">{{ special.desc }}</span>
        <span v-if="specialBlocked" class="note">{{ specialBlocked }}</span>
      </button>

      <button class="option" @click="$emit('leave')">
        <span class="orb">
          <!-- 向右前进的箭头：继续赶路 -->
          <svg
            class="w-14 h-14"
            viewBox="0 0 64 64"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 32h38" stroke="#fde68a" stroke-width="6" />
            <path d="M34 16l16 16-16 16" stroke="#fde68a" stroke-width="6" />
            <path d="M10 32h38M34 16l16 16-16 16" stroke="#b45309" stroke-width="2" />
          </svg>
        </span>
        <span class="banner">离开</span>
        <span class="desc">继续前进</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #f1f5f9;
  overflow: hidden;
  background: linear-gradient(180deg, #140d0a, #22140f 70%, #1f1410);
}
/* 篝火映在地面上的暖光 */
.glow {
  position: absolute;
  left: 50%;
  bottom: -12rem;
  width: 60rem;
  height: 28rem;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(249, 115, 22, 0.35), transparent 70%);
  pointer-events: none;
}

/* 选项卡：沿用卡牌的金属外框与名牌条 */
.option {
  position: relative;
  width: 13rem;
  padding: 1.6rem 1rem 1.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  color: inherit;
  cursor: pointer;
  background:
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 6px, transparent 6px 12px),
    #241812;
  border: 3px solid transparent;
  border-radius: 14px;
  background-clip: padding-box;
  box-shadow:
    0 0 0 3px #d97706,
    0 8px 22px rgba(0, 0, 0, 0.6);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
.option:hover:not(:disabled) {
  transform: translateY(-6px);
  box-shadow:
    0 0 0 3px #fcd34d,
    0 0 26px rgba(251, 191, 36, 0.55),
    0 12px 26px rgba(0, 0, 0, 0.6);
}
.option:disabled {
  cursor: not-allowed;
  filter: grayscale(0.7) brightness(0.6);
}
.orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5.2rem;
  height: 5.2rem;
  background: radial-gradient(circle at 50% 40%, #7c2d12, #1c0a02 80%);
  border: 2px solid #fcd34d;
  border-radius: 50%;
}
.banner {
  margin: 0 -0.4rem;
  padding: 0.25rem 2rem;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: #fff;
  background: linear-gradient(180deg, #b45309, #78350f);
  border-top: 1px solid rgba(255, 255, 255, 0.4);
  border-bottom: 1px solid rgba(0, 0, 0, 0.6);
  clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
}
.desc {
  font-size: 0.9rem;
  color: #d8c8b0;
}
.note {
  font-size: 0.75rem;
  color: #f87171;
}
</style>
