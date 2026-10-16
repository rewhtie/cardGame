import { ref, watch } from 'vue'

/** 仅开发模式：上帝模式可进入任意地图节点，并在图鉴里直接获得卡牌 / 药水 / 遗物 */
const GOD_KEY = 'cardFire.godMode'
const isDev = import.meta.env.DEV
const godMode = ref(isDev && localStorage.getItem(GOD_KEY) === '1')
watch(godMode, (on) => localStorage.setItem(GOD_KEY, on ? '1' : '0'))

export function useGodMode() {
  return { isDev, godMode }
}
