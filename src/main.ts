import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'

import { preloadSfx } from './composables/useSfx'

createApp(App).mount('#app')

// 浏览器要求音频上下文在用户交互后才能启动：首次点击时预解码全部音效
window.addEventListener('pointerdown', preloadSfx, { once: true })
