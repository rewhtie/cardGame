import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { cardEditorPlugin } from './tools/cardEditorPlugin'
import { docSyncPlugin } from './tools/docSync'
import { enemyEditorPlugin } from './tools/enemyEditorPlugin'
import { sfxEditorPlugin } from './tools/sfxEditorPlugin'

export default defineConfig({
  plugins: [vue(), UnoCSS(), cardEditorPlugin(), sfxEditorPlugin(), enemyEditorPlugin(), docSyncPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
})
