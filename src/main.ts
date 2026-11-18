import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'

import { preloadSfx } from './composables/useSfx'
import { installSfxEvents } from './composables/useSfxEvents'

// 禁用浏览器默认右键菜单；需要右键的组件自己监听 contextmenu
// capture 阶段拦：组件里的 @contextmenu.prevent 仍会先被这里挡掉默认菜单，但不影响它们自己的处理
document.addEventListener('contextmenu', (e) => e.preventDefault(), { capture: true })

// 右键 / 侧键常被浏览器当成「后退 / 前进」，拦住这两个键的 mousedown
// 并在能拦的情况下取消 auxclick，避免右键误触手式导航
document.addEventListener(
  'mousedown',
  (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault()
  },
  { capture: true },
)
document.addEventListener('auxclick', (e) => e.preventDefault(), { capture: true })

// 右键拖拽会触发浏览器的「拖动链接 / 图片」手势，这里统一关掉，组件自己处理右键
document.addEventListener(
  'dragstart',
  (e) => {
    if (!isEditable(e.target)) e.preventDefault()
  },
  { capture: true },
)

// 触屏长按 / 右键时浏览器可能弹出原生菜单或触发手势翻页，用 touch-action 与历史栈兜底
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType !== 'mouse' && e.button === 2) e.preventDefault()
  },
  { capture: true },
)

function isEditable(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')
}

for (const type of ['selectstart', 'copy', 'cut', 'dragstart']) {
  document.addEventListener(type, (e) => {
    if (!isEditable(e.target)) e.preventDefault()
  })
}

createApp(App).mount('#app')
installSfxEvents()

// 浏览器要求音频上下文在用户交互后才能启动：首次点击时预解码全部音效
window.addEventListener('pointerdown', preloadSfx, { once: true })
