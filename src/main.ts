import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'

import { preloadSfx } from './composables/useSfx'
import { installSfxEvents } from './composables/useSfxEvents'

// 禁用浏览器默认右键菜单；需要右键的组件自己监听 contextmenu
document.addEventListener('contextmenu', (e) => e.preventDefault())

createApp(App).mount('#app')
installSfxEvents()

// 浏览器要求音频上下文在用户交互后才能启动：首次点击时预解码全部音效
window.addEventListener('pointerdown', preloadSfx, { once: true })
