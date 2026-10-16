import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'btn-primary':
      'px-4 py-2 rounded bg-amber-500 text-slate-900 font-bold hover:bg-amber-400 disabled:(opacity-40 cursor-not-allowed)',
  },
})
