import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      // 全局把冷色 slate 重映射为暖色“焦炭/羊皮纸”灰，整套界面随之变暖
      slate: {
        50: '#faf6f0',
        100: '#f1e9dc',
        200: '#e0d3bf',
        300: '#c9b8a0',
        400: '#a8967f',
        500: '#857463',
        600: '#5e5045',
        700: '#433830',
        800: '#2d2420',
        900: '#1e1714',
        950: '#130e0c',
      },
    },
  },
  shortcuts: {
    'btn-primary':
      'px-4 py-2 rounded bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 disabled:(opacity-40 cursor-not-allowed)',
  },
})
