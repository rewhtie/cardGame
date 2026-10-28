import { ref, watch } from 'vue'

/** 网页测试结束后设为 false，生产环境将隐藏对局作弊功能。 */
const PUBLIC_TEST_CHEATS = true
export const cheatsEnabled = import.meta.env.DEV || PUBLIC_TEST_CHEATS

const GOD_KEY = 'cardFire.godMode'
const godMode = ref(cheatsEnabled && localStorage.getItem(GOD_KEY) === '1')
watch(godMode, (on) => localStorage.setItem(GOD_KEY, on ? '1' : '0'))

export function useGodMode() {
  return { cheatsEnabled, godMode }
}
