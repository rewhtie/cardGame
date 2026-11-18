import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'

import { preloadSfx } from './composables/useSfx'
import { installSfxEvents } from './composables/useSfxEvents'

function isEditable(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')
}

// 禁用浏览器默认右键菜单；需要右键的组件自己监听 contextmenu（capture 阶段拦，组件里的处理不受影响）
document.addEventListener('contextmenu', (e) => e.preventDefault(), { capture: true })

// 鼠标侧键会被浏览器当成「后退 / 前进」，拦掉它们的按下与抬起，避免右键误触页面导航
document.addEventListener(
  'mousedown',
  (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault()
  },
  { capture: true },
)

for (const type of ['selectstart', 'copy', 'cut', 'dragstart']) {
  document.addEventListener(
    type,
    (e) => {
      if (!isEditable(e.target)) e.preventDefault()
    },
    { capture: type === 'dragstart' },
  )
}

createApp(App).mount('#app')
installSfxEvents()

// 浏览器要求音频上下文在用户交互后才能启动：首次点击时预解码全部音效
window.addEventListener('pointerdown', preloadSfx, { once: true })
