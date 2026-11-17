import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      // 全局把冷色 slate 重映射为“墨黑 / 骨白羊皮纸”，与手绘立绘的粗墨线 + 骨白底色一致
      slate: {
        50: '#fbf5e8',
        100: '#f2e6cc',
        200: '#e2d0ad',
        300: '#c9b48f',
        400: '#a38f70',
        500: '#7a6a54',
        600: '#54473a',
        700: '#3a3029',
        800: '#26201b',
        900: '#18130f',
        950: '#0d0a08',
      },
      // 强调色：做旧黄铜（图标里的金币、皇冠、天平同色系）
      amber: {
        200: '#f6e3a8',
        300: '#ecc96a',
        400: '#dcae3c',
        500: '#c08a1c',
        600: '#986614',
        700: '#714a10',
      },
      // 血红：立绘里的羽毛、符文、血滴
      red: {
        300: '#f08a8a',
        400: '#e04848',
        500: '#c8202a',
        600: '#a3161f',
        700: '#7c1018',
        800: '#560b10',
      },
    },
  },
  shortcuts: {
    'btn-primary':
      'px-4 py-2 rounded bg-red-600 text-slate-50 font-bold border-2 border-slate-950 shadow-[0_3px_0_#0d0a08,inset_0_1px_0_rgba(255,220,200,0.35)] hover:bg-red-500 disabled:(opacity-40 cursor-not-allowed)',
  },
})
