import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { cardEditorPlugin } from './tools/cardEditorPlugin'
import { docSyncPlugin } from './tools/docSync'
import { enemyEditorPlugin } from './tools/enemyEditorPlugin'
import { editorWritesPlugin } from './tools/editorWrites'
import { sfxEditorPlugin } from './tools/sfxEditorPlugin'

export default defineConfig({
  plugins: [editorWritesPlugin(), vue(), UnoCSS(), cardEditorPlugin(), sfxEditorPlugin(), enemyEditorPlugin(), docSyncPlugin()],
  resolve: {
    // Windows 下 cwd 可能是小写盘符（d:），而模块 realpath 是大写（D:），不统一会导致 import.meta.glob 生成错误的相对路径
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase()) },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
})
